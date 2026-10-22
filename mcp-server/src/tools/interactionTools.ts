import type { ClinicalEngineService } from '../services/clinicalEngineService.js';
import {
  GetInteractionReportInputSchema,
  GetClinicalEvidenceInputSchema,
  type GetInteractionReportInput,
  type GetClinicalEvidenceInput,
} from '../schemas/interactionSchemas.js';

export async function handleGetInteractionReport(
  rawArgs: unknown,
  engine: ClinicalEngineService
) {
  const args = GetInteractionReportInputSchema.parse(rawArgs);
  const patient = engine.patientRepo.findById(args.patientId);

  if (!patient) {
    throw new Error(`Patient with ID "${args.patientId}" was not found.`);
  }

  const allMeds = engine.medRepo.findByPatientId(args.patientId);
  const activeMeds = allMeds.filter((m) => m.status === 'active' || m.status === 'prn');
  const labs = engine.labRepo.findByPatientId(args.patientId);

  const result = await engine.conflictEngine.evaluateRegimen(patient, activeMeds, labs);

  return {
    patientId: patient.id,
    patientName: patient.name,
    evaluatedMedicationCount: activeMeds.length,
    totalPairsEvaluated: result.summary.totalPairsEvaluated,
    summaryBySeverity: result.summary.bySeverity,
    duplicateIngredients: result.duplicateIngredients.map((dup) => ({
      ingredientName: dup.ingredientName,
      medications: dup.medications.map((m) => ({
        id: m.id,
        brand: m.brand,
        prescribedDose: m.prescribedDose,
      })),
      severity: dup.severity,
      clinicalRationale: dup.clinicalRationale,
    })),
    findings: result.findings.map((f) => ({
      findingId: f.findingId,
      medicationA: f.medicationA,
      medicationB: f.medicationB,
      severity: f.severity,
      category: f.category,
      evidenceLevel: f.evidenceLevel,
      mechanism: f.mechanism,
      clinicalImpact: f.clinicalImpact,
      sourceCitation: f.sourceCitation,
      ruleId: f.ruleId,
      datasetVersion: f.datasetVersion,
      managementRecommendation: f.managementRecommendation,
      requiredReview: f.requiredReview,
    })),
    clinicalDataGaps: result.dataGaps.map((gap) => ({
      gapType: gap.gapType,
      severity: gap.severity,
      title: gap.title,
      description: gap.description,
      suggestedAction: gap.suggestedAction,
      affectedMedicationIds: gap.affectedMedicationIds,
    })),
    providerStatus: {
      providerName: result.providerStatus.providerName,
      isAvailable: result.providerStatus.isAvailable,
      datasetVersion: result.providerStatus.datasetMetadata.version,
    },
    safetyCaveat:
      'CRITICAL SAFETY INVARIANT: Absence of documented interactions does not prove regimen safety. Unverified medications and unmeasured clearance values remain explicitly unknown.',
  };
}

export async function handleGetClinicalEvidence(
  rawArgs: unknown,
  engine: ClinicalEngineService
) {
  const args = GetClinicalEvidenceInputSchema.parse(rawArgs);

  if (args.ingredientPair) {
    const [ing1, ing2] = args.ingredientPair;
    const rules = await engine.interactionEvidenceProvider.findRulesForPair(ing1, ing2);
    const metadata = engine.interactionEvidenceProvider.getDatasetMetadata();

    if (!rules || rules.length === 0) {
      return {
        evidenceFound: false,
        ingredientPair: [ing1, ing2],
        message: `No validated clinical trial or authoritative reference rule documented for pair: "${ing1}" + "${ing2}" in reference dataset version ${metadata.version}.`,
        referenceDatasetVersion: metadata.version,
      };
    }

    const rule = rules[0];
    return {
      evidenceFound: true,
      ingredientPair: [ing1, ing2],
      citationMetadata: {
        interactionRuleId: rule.ruleId,
        sourceCitation: rule.sourceCitation,
        evidenceLevel: rule.evidenceLevel,
        publicationDate: rule.publicationDate,
        datasetVersion: rule.datasetVersion,
        mechanismDescription: rule.mechanism,
        clinicalImpact: rule.clinicalImpact,
      },
      severity: rule.severity,
      category: rule.category,
      recommendation: rule.managementRecommendation,
    };
  }

  if (args.findingId) {
    const allRules = await engine.interactionEvidenceProvider.getAllRules();
    const rule = allRules.find((r) => r.ruleId === args.findingId);

    if (rule) {
      return {
        evidenceFound: true,
        findingId: args.findingId,
        ingredientPair: [rule.ingredientA, rule.ingredientB],
        citationMetadata: {
          interactionRuleId: rule.ruleId,
          sourceCitation: rule.sourceCitation,
          evidenceLevel: rule.evidenceLevel,
          publicationDate: rule.publicationDate,
          datasetVersion: rule.datasetVersion,
          mechanismDescription: rule.mechanism,
          clinicalImpact: rule.clinicalImpact,
        },
        severity: rule.severity,
        category: rule.category,
        recommendation: rule.managementRecommendation,
      };
    }

    return {
      evidenceFound: false,
      findingId: args.findingId,
      message: `No clinical rule found with finding ID "${args.findingId}".`,
    };
  }

  return {
    evidenceFound: false,
    message: 'Either findingId or ingredientPair must be provided.',
  };
}
