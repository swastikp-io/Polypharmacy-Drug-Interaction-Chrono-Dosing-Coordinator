import type { ClinicalEngineService } from '../services/clinicalEngineService.js';
import {
  ConfirmMedicationInputSchema,
  type ConfirmMedicationInput,
} from '../schemas/mutationSchemas.js';

export function handleConfirmMedication(
  rawArgs: unknown,
  engine: ClinicalEngineService
) {
  const args = ConfirmMedicationInputSchema.parse(rawArgs);
  const med = engine.medRepo.findById(args.medicationId);

  if (!med) {
    throw new Error(`Medication record with ID "${args.medicationId}" was not found.`);
  }

  const previousStatus = med.verificationStatus;
  const updated = engine.medRepo.updateVerificationStatus(args.medicationId, 'confirmed');

  if (!updated) {
    throw new Error(`Failed to update verification status for medication "${args.medicationId}".`);
  }

  const auditLog = engine.auditService.logUpdate(
    med.patientId,
    'medication',
    args.medicationId,
    args.actor,
    `MCP confirm_medication: Verified order ${med.brand} (${med.genericName}) [${med.prescribedDose}] as confirmed clinical truth. Justification: ${args.justification}`,
    { verificationStatus: previousStatus },
    { verificationStatus: 'confirmed' }
  );

  return {
    success: true,
    medicationId: args.medicationId,
    brand: med.brand,
    genericName: med.genericName,
    patientId: med.patientId,
    previousStatus,
    newStatus: 'confirmed',
    confirmedBy: args.actor,
    justification: args.justification,
    auditLogId: auditLog.id,
    timestamp: auditLog.timestamp,
  };
}
