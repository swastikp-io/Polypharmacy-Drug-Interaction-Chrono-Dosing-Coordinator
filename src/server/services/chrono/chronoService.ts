import type { AuditService } from '../auditService.js';
import type { MedicationRepository } from '../../repositories/medicationRepository.js';
import type { PatientRepository } from '../../repositories/patientRepository.js';
import type { ChronoRepository } from '../../repositories/chronoRepository.js';
import type {
  DailyScheduleTimeline,
  PatientRoutine,
  ScheduleReviewMetadata,
  ScheduleReviewSubmission,
  ScheduleStatus,
} from '../../../shared/chronoTypes.js';
import { CircadianScheduleCoordinator } from './scheduleCoordinator.js';

export class ChronoService {
  private patientRepo: PatientRepository;
  private medRepo: MedicationRepository;
  private chronoRepo: ChronoRepository;
  private auditService: AuditService;
  private coordinator: CircadianScheduleCoordinator;

  constructor(
    patientRepo: PatientRepository,
    medRepo: MedicationRepository,
    chronoRepo: ChronoRepository,
    auditService: AuditService
  ) {
    this.patientRepo = patientRepo;
    this.medRepo = medRepo;
    this.chronoRepo = chronoRepo;
    this.auditService = auditService;
    this.coordinator = new CircadianScheduleCoordinator();
  }

  public getPatientRoutine(patientId: string): PatientRoutine {
    const existing = this.chronoRepo.getPatientRoutine(patientId);
    if (existing) {
      return existing;
    }

    // Default routine
    const defaultRoutine: PatientRoutine = {
      patientId,
      wakeTime: '07:00',
      breakfastTime: '08:00',
      lunchTime: '12:30',
      dinnerTime: '18:30',
      bedTime: '21:30',
      notes: 'Standard community routine',
      updatedAt: new Date().toISOString(),
    };

    return this.chronoRepo.upsertPatientRoutine(defaultRoutine);
  }

  public updatePatientRoutine(
    patientId: string,
    routineData: Partial<PatientRoutine>,
    actor: string
  ): { routine: PatientRoutine; newSchedule: DailyScheduleTimeline } {
    const current = this.getPatientRoutine(patientId);
    const updatedRoutine: PatientRoutine = {
      ...current,
      ...routineData,
      patientId,
      updatedAt: new Date().toISOString(),
    };

    const savedRoutine = this.chronoRepo.upsertPatientRoutine(updatedRoutine);

    // Audit log
    this.auditService.logUpdate(
      patientId,
      'patient',
      patientId,
      actor,
      `Updated daily meal and sleep routine (Wake: ${savedRoutine.wakeTime}, Breakfast: ${savedRoutine.breakfastTime}, Bedtime: ${savedRoutine.bedTime})`,
      current,
      savedRoutine
    );

    // Recalculate draft schedule with the updated routine
    const newSchedule = this.generateDraftSchedule(patientId);

    return { routine: savedRoutine, newSchedule };
  }

  public generateDraftSchedule(patientId: string): DailyScheduleTimeline {
    const patient = this.patientRepo.findById(patientId);
    if (!patient) {
      throw new Error(`Patient with ID "${patientId}" not found`);
    }

    const medications = this.medRepo.findByPatientId(patientId);
    const routine = this.getPatientRoutine(patientId);

    const timeline = this.coordinator.generateSchedule({
      patient,
      medications,
      routine,
    });

    this.chronoRepo.saveSchedule(timeline);

    return timeline;
  }

  public getLatestSchedule(patientId: string): DailyScheduleTimeline {
    const existing = this.chronoRepo.getLatestSchedule(patientId);
    if (existing) {
      return existing;
    }
    return this.generateDraftSchedule(patientId);
  }

  public getScheduleHistory(patientId: string): DailyScheduleTimeline[] {
    return this.chronoRepo.getScheduleHistory(patientId);
  }

  public reviewSchedule(
    patientId: string,
    scheduleId: string,
    submission: ScheduleReviewSubmission
  ): DailyScheduleTimeline {
    const schedule = this.chronoRepo.getScheduleById(scheduleId);
    if (!schedule) {
      throw new Error(`Schedule with ID "${scheduleId}" not found`);
    }

    let newStatus: ScheduleStatus = 'draft';
    if (submission.decision === 'accepted') {
      newStatus = 'reviewed_accepted';
    } else if (submission.decision === 'rejected') {
      newStatus = 'reviewed_rejected';
    } else if (submission.decision === 'modified') {
      newStatus = 'modified_by_clinician';
    }

    const reviewMetadata: ScheduleReviewMetadata = {
      reviewedBy: submission.actor,
      reviewedAt: new Date().toISOString(),
      decision: submission.decision,
      decisionRationale: submission.rationale,
      clinicianNotes: submission.clinicianNotes || '',
    };

    let updatedSchedule: DailyScheduleTimeline = {
      ...schedule,
      status: newStatus,
      reviewMetadata,
    };

    if (submission.modifiedSlots && submission.modifiedSlots.length > 0) {
      updatedSchedule.slots = submission.modifiedSlots;
    }

    this.chronoRepo.saveSchedule(updatedSchedule);

    // Audit log
    this.auditService.logUpdate(
      patientId,
      'medication',
      scheduleId,
      submission.actor,
      `Clinician ${submission.decision.toUpperCase()} Circadian Schedule Draft (${scheduleId}). Rationale: ${submission.rationale}`,
      { status: schedule.status },
      { status: newStatus, review: reviewMetadata }
    );

    return updatedSchedule;
  }
}
