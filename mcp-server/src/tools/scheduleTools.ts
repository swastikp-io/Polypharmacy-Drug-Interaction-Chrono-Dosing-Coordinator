import type { ClinicalEngineService } from '../services/clinicalEngineService.js';
import {
  ProposeMedicationScheduleInputSchema,
  type ProposeMedicationScheduleInput,
} from '../schemas/scheduleSchemas.js';

export async function handleProposeMedicationSchedule(
  rawArgs: unknown,
  engine: ClinicalEngineService
) {
  const args = ProposeMedicationScheduleInputSchema.parse(rawArgs);
  const patient = engine.patientRepo.findById(args.patientId);

  if (!patient) {
    throw new Error(`Patient with ID "${args.patientId}" was not found.`);
  }

  const allMeds = engine.medRepo.findByPatientId(args.patientId);
  const activeMeds = allMeds.filter((m) => m.status === 'active' || m.status === 'prn');
  const labs = engine.labRepo.findByPatientId(args.patientId);
  const routine = engine.chronoService.getPatientRoutine(args.patientId);

  const interactionResult = await engine.conflictEngine.evaluateRegimen(
    patient,
    activeMeds,
    labs
  );

  const scheduleTimeline = engine.chronoCoordinator.generateSchedule({
    patient,
    medications: activeMeds,
    routine,
    interactionFindings: interactionResult.findings,
  });

  return {
    scheduleId: scheduleTimeline.scheduleId,
    patientId: scheduleTimeline.patientId,
    patientName: patient.name,
    status: 'draft',
    isDraftOnly: true,
    prescribedDosesPreserved100Percent:
      scheduleTimeline.comparison.unchangedDoseCount === activeMeds.length,
    totalPrescriptionsScheduled: activeMeds.length,
    unchangedDoseCount: scheduleTimeline.comparison.unchangedDoseCount,
    unconfidentMedications: scheduleTimeline.unconfidentMedications,
    slots: scheduleTimeline.slots.map((slot) => ({
      slotId: slot.slotId,
      slotName: slot.slotName,
      targetTime: slot.targetTime,
      mealRelation: slot.mealRelation,
      doses: slot.doses.map((d) => ({
        medicationId: d.medicationId,
        brand: d.brand,
        genericName: d.genericName,
        prescribedDose: d.prescribedDose,
        timingRationale: d.timingRationale,
        evidenceSources: d.evidenceSources,
      })),
    })),
    conflicts: scheduleTimeline.conflicts.map((c) => ({
      id: c.id,
      conflictType: c.conflictType,
      severity: c.severity,
      title: c.title,
      description: c.description,
      medicationsInvolved: c.medicationsInvolved,
      recommendedAction: c.recommendedAction,
      evidenceCitation: c.evidenceCitation,
    })),
    safetyNotice: scheduleTimeline.safetyNotice,
  };
}
