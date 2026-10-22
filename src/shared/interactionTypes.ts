import type {
  DuplicateIngredientGroup,
  VerificationStatus,
} from './types.js';

// ==========================================
// 1. DATASET METADATA & EVIDENCE PROVENANCE
// ==========================================

export interface DatasetMetadata {
  datasetId: string;
  datasetName: string;
  version: string;
  publishedDate: string; // ISO 8601 YYYY-MM-DD
  revisionDate: string;
  sourceAuthority: string; // e.g., "FDA Structured Product Labeling", "CPIC Guidelines", "Synthetic Clinical Benchmark"
  license: string; // e.g., "Synthetic Academic Test License", "U.S. National Library of Medicine Terms"
  completeness: 'comprehensive' | 'curated_test_fixture' | 'sample_subset' | 'incomplete';
  maintenanceSchedule: string; // e.g., "Quarterly revision cycle"
  staleAfterDays: number;
}

export type EvidenceLevel =
  | 'established_clinical'     // Confirmed in controlled human clinical trials or black-box warnings
  | 'probable'                 // Substantial observational or consistent cohort evidence
  | 'theoretical_mechanism'    // In vitro enzyme affinity or shared pathway without proven outcome
  | 'unknown_evidence';        // Uncharacterized or conflicting documentation

export type InteractionCategory =
  | 'pharmacokinetic'          // Absorption, distribution, CYP/transporter metabolism, renal elimination
  | 'pharmacodynamic'          // Additive, synergistic, or antagonistic target receptor actions
  | 'duplicate_therapy'        // Redundant chemical entities or therapeutic class overlap
  | 'organ_clearance_conflict' // Renal or hepatic disease threshold impairment
  | 'other';

export type InteractionSeverity =
  | 'contraindicated'          // Concomitant use is strictly contraindicated
  | 'major'                    // Potentially life-threatening or requires immediate clinical intervention
  | 'moderate'                 // May cause deterioration; clinical monitoring or timing separation required
  | 'minor'                    // Minimal clinical significance; monitor routinely
  | 'unknown';                 // Incomplete source data; severity unassigned

export type EnzymeRole = 'substrate' | 'inhibitor' | 'inducer';
export type EnzymeStrength = 'strong' | 'moderate' | 'weak' | 'unspecified';

export interface EnzymeTransporterEffect {
  target: string; // e.g. "CYP3A4", "CYP2D6", "CYP2C9", "CYP2C19", "P-gp", "OATP1B1"
  role: EnzymeRole;
  strength: EnzymeStrength;
  clinicalRelevance: 'established' | 'theoretical' | 'minor';
  evidenceSource: string;
}

// ==========================================
// 2. DRUG REFERENCE MODEL
// ==========================================

export interface DrugReferenceEntry {
  ingredientId: string; // Canonical identifier (e.g. RxNorm IN / standard ID)
  canonicalName: string; // Normalized lowercase title
  displayName: string;
  aliases: string[]; // Brand and international synonyms
  pharmacologicalClass: string[]; // e.g. ["DOAC", "Factor Xa Inhibitor"], ["NSAID", "COX-1 Inhibitor"]
  narrowTherapeuticIndex: boolean; // NTI drug requiring intense plasma monitoring
  primaryClearanceRoutes: Array<'renal' | 'hepatic_cyp' | 'hepatic_biliary' | 'pulmonary' | 'other'>;
  enzymeTransporterProfile: EnzymeTransporterEffect[];
  blackBoxWarnings?: string[];
  referenceNotes?: string;
}

// ==========================================
// 3. INTERACTION EVIDENCE RULE MODEL
// ==========================================

export interface PatientContextPrerequisite {
  requiresRenalData?: boolean;
  minEgfrThreshold?: number; // e.g. Rule only triggers if eGFR < 45
  requiresHepaticData?: boolean;
  requiresAgeThreshold?: number; // e.g. >= 65 for Beers Criteria
  requiresConfirmedDiagnosis?: string[]; // e.g. ["Heart Failure", "CKD"]
}

export interface InteractionRule {
  ruleId: string;
  datasetVersion: string;
  category: InteractionCategory;
  severity: InteractionSeverity;
  evidenceLevel: EvidenceLevel;

  // Exact matching pair (normalized ingredient IDs)
  ingredientA: string;
  ingredientB: string;

  // Pharmacological mechanism and clinical impact
  mechanism: string;
  clinicalImpact: string;
  managementRecommendation: string;
  sourceCitation: string;
  publicationDate: string;

  // Explicit patient context prerequisites (Rule only applies when explicitly supported)
  patientPrerequisites?: PatientContextPrerequisite;

  // Specific risk factors
  requiresClinicalReview: boolean;
  actionableWindowHours?: number; // e.g. 4-hour spacing window for chelation
}

// ==========================================
// 4. ENGINE FINDINGS & PROVENANCE
// ==========================================

export interface ClinicalDataGap {
  gapType:
    | 'missing_renal_data'
    | 'missing_hepatic_data'
    | 'uncertain_medicine_identity'
    | 'stale_dataset'
    | 'conflicting_evidence';
  severity: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  affectedMedicationIds: string[];
  suggestedAction: string;
}

export interface InteractionFinding {
  findingId: string;
  category: InteractionCategory;
  severity: InteractionSeverity;
  evidenceLevel: EvidenceLevel;

  // Medications involved
  medicationA: {
    id: string;
    brand: string;
    genericName: string;
    ingredient: string;
    verificationStatus: VerificationStatus;
  };
  medicationB: {
    id: string;
    brand: string;
    genericName: string;
    ingredient: string;
    verificationStatus: VerificationStatus;
  };

  // Scientific & Clinical details
  mechanism: string;
  clinicalImpact: string;
  managementRecommendation: string;
  sourceCitation: string;
  publicationDate: string;

  // Provenance & Versioning
  ruleId: string;
  datasetVersion: string;
  datasetSource: string;

  // Patient Context Evaluation
  patientContextApplied: {
    evaluatedRenal: boolean;
    patientEgfr?: number | null;
    evaluatedHepatic: boolean;
    patientAltAst?: string | null;
    evaluatedAge: boolean;
    patientAge?: number | null;
    meetsPrerequisites: boolean;
    notes: string;
  };

  // Safety & Review Requirements
  requiredReview: 'urgent_physician_review' | 'pharmacist_reconciliation' | 'routine_monitoring' | 'none';
  isTheoreticalOnly: boolean;
}

export interface ConflictEngineSummary {
  totalMedicationsChecked: number;
  totalPairsEvaluated: number;
  findingsCount: number;
  bySeverity: Record<InteractionSeverity, number>;
  byCategory: Record<InteractionCategory, number>;
  byEvidenceLevel: Record<EvidenceLevel, number>;
  establishedClinicalCount: number;
  theoreticalCount: number;
  criticalDataGapsCount: number;
  engineExecutionTimeMs: number;
}

export interface ProviderHealthStatus {
  providerName: string;
  isAvailable: boolean;
  isStale: boolean;
  lastCheckedAt: string;
  datasetMetadata: DatasetMetadata;
  warningNotice?: string;
}

export interface ConflictEngineResult {
  patientId: string;
  evaluatedAt: string;
  engineVersion: string;
  isPrototype: boolean;
  providerStatus: ProviderHealthStatus;
  findings: InteractionFinding[];
  duplicateIngredients: DuplicateIngredientGroup[];
  dataGaps: ClinicalDataGap[];
  summary: ConflictEngineSummary;
  clinicalDisclaimer: string;
}

export interface FindingExplanation {
  findingId: string;
  clinicianSummary: string;
  patientPlainLanguageExplanation: string;
  actionChecklist: string[];
  evidenceCitation: string;
}

export interface RegimenExplanationResult {
  patientId: string;
  executiveSummary: string;
  highPriorityAlerts: string[];
  findingsExplanations: FindingExplanation[];
  dataGapsChecklist: string[];
  llmScaffoldingPrompt: {
    systemPrompt: string;
    groundedContextJson: string;
    instruction: string;
  };
}

