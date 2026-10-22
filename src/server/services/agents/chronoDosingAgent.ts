import type {
  ChronoConflictItem,
  ChronoDosingRequest,
  ChronoDosingResponse,
  ChronoDosingSlotItem,
  IChronoDosingAgentService,
  TimeOfDaySlot,
} from './types.js';
import { CircadianScheduleCoordinator } from '../chrono/scheduleCoordinator.js';

export class ChronoDosingAgentService implements IChronoDosingAgentService {
  private coordinator: CircadianScheduleCoordinator;

  constructor() {
    this.coordinator = new CircadianScheduleCoordinator();
  }

  async generateSchedule(request: ChronoDosingRequest): Promise<ChronoDosingResponse> {
    const { patient, medications, preferredWakeTime, preferredBedTime } = request;

    const routine = {
      patientId: patient.id,
      wakeTime: preferredWakeTime || '07:00',
      breakfastTime: '08:00',
      lunchTime: '12:30',
      dinnerTime: '18:30',
      bedTime: preferredBedTime || '21:30',
      updatedAt: new Date().toISOString(),
    };

    const timeline = this.coordinator.generateSchedule({
      patient,
      medications,
      routine,
    });

    // Map Phase 4 timeline slots to ChronoDosingSlotItem format
    const proposedSchedule: ChronoDosingSlotItem[] = [];

    for (const slot of timeline.slots) {
      let legacySlot: TimeOfDaySlot = 'morning';
      if (slot.slotId === 'slot_midday_lunch') legacySlot = 'noon';
      else if (slot.slotId === 'slot_evening_dinner') legacySlot = 'evening';
      else if (slot.slotId === 'slot_bedtime') legacySlot = 'bedtime';

      proposedSchedule.push({
        slot: legacySlot,
        timeWindow: `${slot.targetTime} (${slot.timeWindow})`,
        targetMedications: slot.doses.map((d) => ({
          medicationId: d.medicationId,
          brand: d.brand,
          genericName: d.genericName,
          prescribedDose: d.prescribedDose,
          frequency: d.prescribedFrequency,
          foodRelation: d.foodRelation,
          administrationNotes: d.administrationInstructions,
          circadianRationale: d.timingRationale,
        })),
      });
    }

    if (timeline.prnDoses.length > 0) {
      proposedSchedule.push({
        slot: 'prn_only',
        timeWindow: 'As Needed (PRN / Flexible)',
        targetMedications: timeline.prnDoses.map((d) => ({
          medicationId: d.medicationId,
          brand: d.brand,
          genericName: d.genericName,
          prescribedDose: d.prescribedDose,
          frequency: d.prescribedFrequency,
          foodRelation: d.foodRelation,
          administrationNotes: d.administrationInstructions,
          circadianRationale: d.timingRationale,
        })),
      });
    }

    // Map conflicts
    const chronoConflicts: ChronoConflictItem[] = timeline.conflicts.map((c) => ({
      id: c.id,
      medicationAId: c.medicationsInvolved[0]?.id || 'unknown',
      medicationAName: c.medicationsInvolved[0]?.name || 'Medication A',
      medicationBId: c.medicationsInvolved[1]?.id || 'unknown',
      medicationBName: c.medicationsInvolved[1]?.name || 'Medication B',
      conflictType:
        c.conflictType === 'separation_violation'
          ? 'absorption_chelation'
          : c.conflictType === 'bedtime_diuretic_hazard'
            ? 'fall_risk_nocturia'
            : 'circadian_inversion',
      description: c.description,
      recommendedSeparationHours: 4,
      managementGuidance: c.recommendedAction,
    }));

    const circadianInsights: string[] = [
      'Prescribed dose and frequency strictly preserved across all scheduled items.',
      'Timing windows computed deterministically from evidence-backed pharmacokinetic guidelines.',
    ];

    if (timeline.conflicts.length > 0) {
      circadianInsights.push(`${timeline.conflicts.length} clinical scheduling conflict(s) identified.`);
    }

    return {
      patientId: patient.id,
      timestamp: timeline.generatedAt,
      agentVersion: CircadianScheduleCoordinator.VERSION,
      isPrototype: true,
      proposedSchedule,
      chronoConflicts,
      circadianInsights,
      clinicalDisclaimer: timeline.safetyNotice,
    };
  }
}
