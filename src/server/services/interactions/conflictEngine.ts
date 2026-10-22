import { randomUUID } from 'crypto';
import {
  calculateAge,
  detectDuplicateIngredients,
  normalizeIngredientName,
} from '../../../shared/calculations.js';
import type {
  ClinicalDataGap,
  ConflictEngineResult,
  ConflictEngineSummary,
  EvidenceLevel,
  InteractionCategory,
  InteractionFinding,
  InteractionRule,
  InteractionSeverity,
  ProviderHealthStatus,
} from '../../../shared/interactionTypes.js';
import type {
  LabMeasurement,
  Medication,
  Patient,
} from '../../../shared/types.js';
import type {
  IDrugReferenceProvider,
  IInteractionEvidenceProvider,
} from './types.js';

export class PharmacokineticConflictEngine {
  readonly version = '3.0.0-phase3';

  constructor(
    private drugReferenceProvider: IDrugReferenceProvider,
    private evidenceProvider: IInteractionEvidenceProvider
  ) {}

  async evaluateRegimen(
    patient: Patient,
    medications: Medication[],
    labs: LabMeasurement[] = []
  ): Promise<ConflictEngineResult> {
    const startTime = performance.now();
    const evaluatedAt = new Date().toISOString();

    // 1. Check Provider Health & Safe Unavailable State
    const refAvailable = this.drugReferenceProvider.isAvailable();
    const evidenceAvailable = this.evidenceProvider.isAvailable();
    const isAvailable = refAvailable && evidenceAvailable;

    const refMeta = this.drugReferenceProvider.getDatasetMetadata();
    const evidenceMeta = this.evidenceProvider.getDatasetMetadata();

    // Check dataset staleness
    const revisionDateMs = new Date(evidenceMeta.revisionDate).getTime();
    const daysSinceRevision = Math.floor((Date.now() - revisionDateMs) / (1000 * 60 * 60 * 24));
    const isStale = daysSinceRevision > evidenceMeta.staleAfterDays;

    const providerStatus: ProviderHealthStatus = {
      providerName: `${this.drugReferenceProvider.name} & ${this.evidenceProvider.name}`,
      isAvailable,
      isStale,
      lastCheckedAt: evaluatedAt,
      datasetMetadata: evidenceMeta,
      warningNotice: !isAvailable
        ? 'CRITICAL OUTAGE: Reference database provider is offline. Patient regimen safety cannot be determined.'
        : isStale
          ? `Dataset revision is ${daysSinceRevision} days old (exceeds ${evidenceMeta.staleAfterDays}-day maintenance threshold).`
          : undefined,
    };

    // SAFE PROVIDER-UNAVAILABLE STATE:
    // If reference providers are offline, do NOT declare regimen safe!
    if (!isAvailable) {
      const outageGap: ClinicalDataGap = {
        gapType: 'conflicting_evidence',
        severity: 'high',
        title: 'Interaction Reference Provider Unavailable',
        description:
          'The clinical pharmacokinetic reference provider is currently unreachable or simulated offline. Drug-drug interactions, duplicate therapies, and organ clearance conflicts could NOT be screened.',
        affectedMedicationIds: medications.map((m) => m.id),
        suggestedAction:
          'Do not rely on this evaluation. Conduct manual clinical pharmacist review using primary literature and package inserts until provider service is restored.',
      };

      return {
        patientId: patient.id,
        evaluatedAt,
        engineVersion: this.version,
        isPrototype: true,
        providerStatus,
        findings: [],
        duplicateIngredients: [],
        dataGaps: [outageGap],
        summary: this.buildEmptySummary(medications.length, performance.now() - startTime, 1),
        clinicalDisclaimer:
          'PROVIDER OUTAGE NOTICE: Reference provider is unavailable. Absence of findings does NOT indicate regimen safety. Clinical manual reconciliation is strictly required.',
      };
    }

    // 2. Active Medications & Duplicate Active Ingredient Evaluation
    const activeMeds = medications.filter(
      (m) => m.status === 'active' || m.status === 'prn' || m.status === 'held'
    );
    const duplicateGroups = detectDuplicateIngredients(activeMeds);
    const findings: InteractionFinding[] = [];
    const dataGaps: ClinicalDataGap[] = [];

    // Flag dataset staleness if detected
    if (isStale) {
      dataGaps.push({
        gapType: 'stale_dataset',
        severity: 'medium',
        title: 'Interaction Dataset Revision Threshold Exceeded',
        description: `Current interaction rule dataset (v${evidenceMeta.version}) has not been updated in ${daysSinceRevision} days. Recent literature or FDA post-marketing warnings may be absent.`,
        affectedMedicationIds: activeMeds.map((m) => m.id),
        suggestedAction: 'Update interaction dataset from primary evidence provider.',
      });
    }

    // 3. Epistemic Assessment: Unverified Medicine Identity
    for (const med of activeMeds) {
      if (med.verificationStatus === 'unverified' || med.verificationStatus === 'unknown') {
        dataGaps.push({
          gapType: 'uncertain_medicine_identity',
          severity: 'medium',
          title: `Unverified Order Identity: "${med.brand}" (${med.genericName})`,
          description: `Medication record status is "${med.verificationStatus}". Pharmacological identity, strength, or salt form has not been confirmed by a clinician.`,
          affectedMedicationIds: [med.id],
          suggestedAction:
            'Confirm prescription order against original source document or dispense label before acting on interaction findings.',
        });
      }
    }

    // 4. Patient Context Assessment: Renal & Hepatic Laboratory Measurements
    const egfrLab = labs.find(
      (l) =>
        normalizeIngredientName(l.testName).includes('egfr') ||
        normalizeIngredientName(l.testName).includes('glomerular')
    );
    const crclLab = labs.find((l) => normalizeIngredientName(l.testName).includes('creatinine'));
    const patientEgfr = egfrLab ? egfrLab.value : crclLab ? crclLab.value : null;

    const altLab = labs.find((l) => normalizeIngredientName(l.testName).includes('alt'));
    const astLab = labs.find((l) => normalizeIngredientName(l.testName).includes('ast'));
    const patientAltAst = altLab && astLab ? `ALT ${altLab.value} / AST ${astLab.value}` : null;

    const patientAge = patient.dateOfBirth ? calculateAge(patient.dateOfBirth) : null;

    // Check if patient takes renally-cleared medications without renal function data
    const renallyClearedMeds: Medication[] = [];
    for (const med of activeMeds) {
      const ref = await this.drugReferenceProvider.lookupByIngredient(med.genericName || med.brand);
      if (ref && ref.primaryClearanceRoutes.includes('renal')) {
        renallyClearedMeds.push(med);
      }
    }

    if (patientEgfr === null && renallyClearedMeds.length > 0) {
      dataGaps.push({
        gapType: 'missing_renal_data',
        severity: 'high',
        title: 'Missing Renal Function Measurements (eGFR / Serum Creatinine)',
        description: `Patient is prescribed ${renallyClearedMeds.length} renally-eliminated medication(s) (${renallyClearedMeds.map((m) => m.brand).join(', ')}), but no current eGFR or serum creatinine measurement was provided.`,
        affectedMedicationIds: renallyClearedMeds.map((m) => m.id),
        suggestedAction:
          'Obtain basic metabolic panel (BMP) to establish baseline creatinine and calculate eGFR/CrCl before verifying clearance thresholds.',
      });
    }

    // Check if patient takes hepatically cleared NTI drugs without liver enzymes
    const hepaticNtiMeds: Medication[] = [];
    for (const med of activeMeds) {
      const ref = await this.drugReferenceProvider.lookupByIngredient(med.genericName || med.brand);
      if (ref && ref.narrowTherapeuticIndex && ref.primaryClearanceRoutes.some((r) => r.startsWith('hepatic'))) {
        hepaticNtiMeds.push(med);
      }
    }

    if (patientAltAst === null && hepaticNtiMeds.length > 0) {
      dataGaps.push({
        gapType: 'missing_hepatic_data',
        severity: 'medium',
        title: 'Missing Hepatic Transaminase Measurements (ALT / AST)',
        description: `Patient is prescribed narrow-therapeutic-index hepatically-metabolized agent(s) (${hepaticNtiMeds.map((m) => m.brand).join(', ')}), but no ALT/AST liver transaminases are on record.`,
        affectedMedicationIds: hepaticNtiMeds.map((m) => m.id),
        suggestedAction:
          'Review comprehensive metabolic panel (CMP) to rule out transaminitis or liver impairment affecting drug clearance.',
      });
    }

    // 5. Generate Duplicate-Therapy Findings
    for (const dup of duplicateGroups) {
      if (dup.medications.length >= 2) {
        const medA = dup.medications[0];
        const medB = dup.medications[1];

        findings.push({
          findingId: `dup-${dup.normalizedName}-${randomUUID().slice(0, 8)}`,
          category: 'duplicate_therapy',
          severity: dup.severity === 'high' ? 'major' : 'moderate',
          evidenceLevel: 'established_clinical',
          medicationA: {
            id: medA.id,
            brand: medA.brand,
            genericName: medA.genericName,
            ingredient: dup.normalizedName,
            verificationStatus: medA.verificationStatus,
          },
          medicationB: {
            id: medB.id,
            brand: medB.brand,
            genericName: medB.genericName,
            ingredient: dup.normalizedName,
            verificationStatus: medB.verificationStatus,
          },
          mechanism: `Co-prescription of duplicate active pharmaceutical ingredient (${dup.normalizedName}) across ${dup.medications.length} concurrent orders.`,
          clinicalImpact: dup.clinicalRationale,
          managementRecommendation:
            'Discontinue duplicate therapy. Verify total daily cumulative dose does not exceed established toxic thresholds.',
          sourceCitation:
            'ISMP Medication Safety Guidelines: Prevention of Unintentional Chemical Duplication; FDA Drug Safety Communications.',
          publicationDate: '2023-01-01',
          ruleId: 'rule-builtin-duplicate-ingredient',
          datasetVersion: evidenceMeta.version,
          datasetSource: evidenceMeta.sourceAuthority,
          patientContextApplied: {
            evaluatedRenal: false,
            evaluatedHepatic: false,
            evaluatedAge: false,
            meetsPrerequisites: true,
            notes: 'Duplicate chemical ingredient detected independently of organ status.',
          },
          requiredReview: 'urgent_physician_review',
          isTheoreticalOnly: false,
        });
      }
    }

    // 6. Systematic Drug-Pair Interaction Evaluation
    let pairsEvaluated = 0;

    for (let i = 0; i < activeMeds.length; i++) {
      for (let j = i + 1; j < activeMeds.length; j++) {
        pairsEvaluated++;
        const medA = activeMeds[i];
        const medB = activeMeds[j];

        // Gather all constituent ingredients for medA and medB
        const ingsA = this.getConstituentIngredients(medA);
        const ingsB = this.getConstituentIngredients(medB);

        for (const ingA of ingsA) {
          for (const ingB of ingsB) {
            // Query evidence provider for matching rules
            const rules = await this.evidenceProvider.findRulesForPair(ingA, ingB);

            for (const rule of rules) {
              const finding = this.evaluateRuleAgainstContext(
                rule,
                medA,
                medB,
                ingA,
                ingB,
                patientAge,
                patientEgfr,
                patientAltAst,
                evidenceMeta
              );

              // Avoid duplicate findings for the same pair and rule
              const alreadyFound = findings.some(
                (f) =>
                  f.ruleId === rule.ruleId &&
                  ((f.medicationA.id === medA.id && f.medicationB.id === medB.id) ||
                    (f.medicationA.id === medB.id && f.medicationB.id === medA.id))
              );

              if (!alreadyFound) {
                findings.push(finding);
              }
            }
          }
        }
      }
    }

    // 7. Clinical Disclaimer & Completeness Constraint
    // CLINICAL CONSTRAINT: "Never report that a regimen is safe solely because no interaction was found in an incomplete dataset."
    let clinicalDisclaimer =
      'DETERMINISTIC CLINICAL DECISION SUPPORT PROTOTYPE: Findings are derived strictly from validated, versioned interaction rules and normalized ingredient definitions. This tool does not substitute for comprehensive professional pharmacist review.';

    if (evidenceMeta.completeness !== 'comprehensive' || dataGaps.length > 0) {
      clinicalDisclaimer += ` INCOMPLETE REFERENCE WARNING: The reference database is a "${evidenceMeta.completeness}" dataset. Absence of reported interactions does NOT certify regimen safety. ${dataGaps.length} clinical data gap(s) require verification.`;
    }

    const executionTimeMs = Math.round(performance.now() - startTime);
    const summary = this.buildSummary(activeMeds.length, pairsEvaluated, findings, dataGaps.length, executionTimeMs);

    return {
      patientId: patient.id,
      evaluatedAt,
      engineVersion: this.version,
      isPrototype: true,
      providerStatus,
      findings,
      duplicateIngredients: duplicateGroups,
      dataGaps,
      summary,
      clinicalDisclaimer,
    };
  }

  private getConstituentIngredients(med: Medication): string[] {
    const ings: string[] = [];
    if (med.genericName) ings.push(normalizeIngredientName(med.genericName));
    if (med.brand) ings.push(normalizeIngredientName(med.brand));

    if (med.activeIngredients && Array.isArray(med.activeIngredients)) {
      for (const item of med.activeIngredients) {
        if (item.name) ings.push(normalizeIngredientName(item.name));
      }
    }
    return Array.from(new Set(ings));
  }

  private evaluateRuleAgainstContext(
    rule: InteractionRule,
    medA: Medication,
    medB: Medication,
    ingA: string,
    ingB: string,
    patientAge: number | null,
    patientEgfr: number | null,
    patientAltAst: string | null,
    metadata: { version: string; sourceAuthority: string }
  ): InteractionFinding {
    let evaluatedRenal = false;
    let evaluatedHepatic = false;
    let evaluatedAge = false;
    let meetsPrerequisites = true;
    const contextNotes: string[] = [];

    // Patient Context Prerequisite Evaluation
    if (rule.patientPrerequisites) {
      const prereqs = rule.patientPrerequisites;

      if (prereqs.requiresAgeThreshold !== undefined) {
        evaluatedAge = true;
        if (patientAge !== null) {
          if (patientAge >= prereqs.requiresAgeThreshold) {
            contextNotes.push(`Patient age ${patientAge} meets high-risk geriatric threshold (>= ${prereqs.requiresAgeThreshold}).`);
          } else {
            meetsPrerequisites = false;
            contextNotes.push(`Patient age ${patientAge} is below prerequisite threshold (${prereqs.requiresAgeThreshold}).`);
          }
        } else {
          contextNotes.push('Patient age unknown; assumed applicable for geriatric safety screening.');
        }
      }

      if (prereqs.requiresRenalData) {
        evaluatedRenal = true;
        if (patientEgfr !== null) {
          contextNotes.push(`Patient renal baseline eGFR is ${patientEgfr} mL/min/1.73m².`);
          if (prereqs.minEgfrThreshold && patientEgfr >= prereqs.minEgfrThreshold) {
            contextNotes.push(`eGFR is above critical threshold of ${prereqs.minEgfrThreshold} mL/min.`);
          }
        } else {
          contextNotes.push('Renal function measurements are missing from chart.');
        }
      }

      if (prereqs.requiresHepaticData) {
        evaluatedHepatic = true;
        if (patientAltAst !== null) {
          contextNotes.push(`Patient liver transaminases: ${patientAltAst}.`);
        } else {
          contextNotes.push('Hepatic transaminase labs are missing.');
        }
      }
    }

    const requiredReview: InteractionFinding['requiredReview'] =
      rule.severity === 'contraindicated' || rule.severity === 'major'
        ? 'urgent_physician_review'
        : rule.severity === 'moderate'
          ? 'pharmacist_reconciliation'
          : 'routine_monitoring';

    return {
      findingId: `finding-${rule.ruleId}-${randomUUID().slice(0, 8)}`,
      category: rule.category,
      severity: rule.severity,
      evidenceLevel: rule.evidenceLevel,
      medicationA: {
        id: medA.id,
        brand: medA.brand,
        genericName: medA.genericName,
        ingredient: ingA,
        verificationStatus: medA.verificationStatus,
      },
      medicationB: {
        id: medB.id,
        brand: medB.brand,
        genericName: medB.genericName,
        ingredient: ingB,
        verificationStatus: medB.verificationStatus,
      },
      mechanism: rule.mechanism,
      clinicalImpact: rule.clinicalImpact,
      managementRecommendation: rule.managementRecommendation,
      sourceCitation: rule.sourceCitation,
      publicationDate: rule.publicationDate,
      ruleId: rule.ruleId,
      datasetVersion: rule.datasetVersion || metadata.version,
      datasetSource: metadata.sourceAuthority,
      patientContextApplied: {
        evaluatedRenal,
        patientEgfr,
        evaluatedHepatic,
        patientAltAst,
        evaluatedAge,
        patientAge,
        meetsPrerequisites,
        notes: contextNotes.join(' ') || 'Standard pair matching applied without patient-specific lab preconditions.',
      },
      requiredReview,
      isTheoreticalOnly: rule.evidenceLevel === 'theoretical_mechanism',
    };
  }

  private buildSummary(
    medCount: number,
    pairsCount: number,
    findings: InteractionFinding[],
    gapsCount: number,
    executionTimeMs: number
  ): ConflictEngineSummary {
    const bySeverity: Record<InteractionSeverity, number> = {
      contraindicated: 0,
      major: 0,
      moderate: 0,
      minor: 0,
      unknown: 0,
    };

    const byCategory: Record<InteractionCategory, number> = {
      pharmacokinetic: 0,
      pharmacodynamic: 0,
      duplicate_therapy: 0,
      organ_clearance_conflict: 0,
      other: 0,
    };

    const byEvidenceLevel: Record<EvidenceLevel, number> = {
      established_clinical: 0,
      probable: 0,
      theoretical_mechanism: 0,
      unknown_evidence: 0,
    };

    let establishedClinicalCount = 0;
    let theoreticalCount = 0;

    for (const f of findings) {
      bySeverity[f.severity] = (bySeverity[f.severity] || 0) + 1;
      byCategory[f.category] = (byCategory[f.category] || 0) + 1;
      byEvidenceLevel[f.evidenceLevel] = (byEvidenceLevel[f.evidenceLevel] || 0) + 1;

      if (f.evidenceLevel === 'established_clinical') establishedClinicalCount++;
      if (f.evidenceLevel === 'theoretical_mechanism') theoreticalCount++;
    }

    return {
      totalMedicationsChecked: medCount,
      totalPairsEvaluated: pairsCount,
      findingsCount: findings.length,
      bySeverity,
      byCategory,
      byEvidenceLevel,
      establishedClinicalCount,
      theoreticalCount,
      criticalDataGapsCount: gapsCount,
      engineExecutionTimeMs: executionTimeMs,
    };
  }

  private buildEmptySummary(
    medCount: number,
    executionTimeMs: number,
    gapsCount: number
  ): ConflictEngineSummary {
    return {
      totalMedicationsChecked: medCount,
      totalPairsEvaluated: 0,
      findingsCount: 0,
      bySeverity: { contraindicated: 0, major: 0, moderate: 0, minor: 0, unknown: 0 },
      byCategory: {
        pharmacokinetic: 0,
        pharmacodynamic: 0,
        duplicate_therapy: 0,
        organ_clearance_conflict: 0,
        other: 0,
      },
      byEvidenceLevel: {
        established_clinical: 0,
        probable: 0,
        theoretical_mechanism: 0,
        unknown_evidence: 0,
      },
      establishedClinicalCount: 0,
      theoreticalCount: 0,
      criticalDataGapsCount: gapsCount,
      engineExecutionTimeMs: Math.round(executionTimeMs),
    };
  }
}
