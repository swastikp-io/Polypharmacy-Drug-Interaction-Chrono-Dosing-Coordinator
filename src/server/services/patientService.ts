import { detectDuplicateIngredients } from '../../shared/calculations.js';
import type { PatientComprehensiveProfile } from '../../shared/types.js';
import type { AllergyRepository } from '../repositories/allergyRepository.js';
import type { AuditLogRepository } from '../repositories/auditLogRepository.js';
import type { DiagnosisRepository } from '../repositories/diagnosisRepository.js';
import type { LabMeasurementRepository } from '../repositories/labMeasurementRepository.js';
import type { MedicationRepository } from '../repositories/medicationRepository.js';
import type { PatientRepository } from '../repositories/patientRepository.js';

export class PatientService {
  constructor(
    private patientRepo: PatientRepository,
    private medRepo: MedicationRepository,
    private allergyRepo: AllergyRepository,
    private diagRepo: DiagnosisRepository,
    private labRepo: LabMeasurementRepository,
    private auditRepo: AuditLogRepository
  ) {}

  getComprehensiveProfile(patientId: string): PatientComprehensiveProfile | null {
    const patient = this.patientRepo.findById(patientId);
    if (!patient) return null;

    const medications = this.medRepo.findByPatientId(patientId);
    const allergies = this.allergyRepo.findByPatientId(patientId);
    const diagnoses = this.diagRepo.findByPatientId(patientId);
    const labMeasurements = this.labRepo.findByPatientId(patientId);
    const auditLogs = this.auditRepo.findByPatientId(patientId);

    // Run clinical duplicate ingredient detection
    const duplicateIngredients = detectDuplicateIngredients(medications);

    return {
      patient,
      medications,
      allergies,
      diagnoses,
      labMeasurements,
      auditLogs,
      duplicateIngredients,
    };
  }
}
