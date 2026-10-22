import type { ClinicalEngineService } from '../services/clinicalEngineService.js';
import {
  GetReviewStatusInputSchema,
  GetPatientReviewReportInputSchema,
  type GetReviewStatusInput,
  type GetPatientReviewReportInput,
} from '../schemas/reviewSchemas.js';

export async function handleGetReviewStatus(
  rawArgs: unknown,
  engine: ClinicalEngineService
) {
  const args = GetReviewStatusInputSchema.parse(rawArgs);
  const patient = engine.patientRepo.findById(args.patientId);

  if (!patient) {
    throw new Error(`Patient with ID "${args.patientId}" was not found.`);
  }

  const allMeds = engine.medRepo.findByPatientId(args.patientId);
  const activeMeds = allMeds.filter((m) => m.status === 'active' || m.status === 'prn');
  const unconfirmed = activeMeds.filter((m) => m.verificationStatus !== 'confirmed');

  const latestRun = engine.workflowCoordinator.getLatestRunForPatient(args.patientId);
  const report = await engine.workflowCoordinator.getOrGenerateConsolidatedReport(
    args.patientId,
    'Review Status Monitor'
  );

  return {
    patientId: patient.id,
    patientName: patient.name,
    mrn: patient.mrn,
    workflowState: latestRun ? latestRun.state : 'IDLE',
    isAwaitingClinicalConfirmation: unconfirmed.length > 0,
    unconfirmedMedicationsCount: unconfirmed.length,
    unconfirmedMedications: unconfirmed.map((u) => ({
      id: u.id,
      brand: u.brand,
      genericName: u.genericName,
      prescribedDose: u.prescribedDose,
      verificationStatus: u.verificationStatus,
    })),
    outstandingReviewItemsCount: report.itemsRequiringPharmacistReview.length,
    prioritizedReviewItems: report.itemsRequiringPharmacistReview.map((item) => ({
      id: item.id,
      category: item.category,
      urgency: item.urgency,
      title: item.title,
      description: item.description,
      medicationsInvolved: item.medicationsInvolved,
      actionableRecommendation: item.actionableRecommendation,
      evidenceCitation: item.evidenceCitation,
    })),
  };
}

export async function handleGetPatientReviewReport(
  rawArgs: unknown,
  engine: ClinicalEngineService
) {
  const args = GetPatientReviewReportInputSchema.parse(rawArgs);
  const patient = engine.patientRepo.findById(args.patientId);

  if (!patient) {
    throw new Error(`Patient with ID "${args.patientId}" was not found.`);
  }

  const report = await engine.workflowCoordinator.getOrGenerateConsolidatedReport(
    args.patientId,
    args.actor
  );

  return report;
}
