import type {
  Allergy,
  DuplicateIngredientGroup,
  LabMeasurement,
  Medication,
  Patient,
  VerificationStatus,
} from '../../../shared/types.js';

// ==========================================
// 1. DRUG INTERACTION AGENT INTERFACES
// ==========================================

export type InteractionSeverity = 'contraindicated' | 'major' | 'moderate' | 'minor' | 'unknown';

export interface InteractionItem {
  id: string;
  medicationA: {
    id: string;
    brand: string;
    genericName: string;
  };
  medicationB: {
    id: string;
    brand: string;
    genericName: string;
  };
  severity: InteractionSeverity;
  mechanism: string;
  clinicalImpact: string;
  managementRecommendation: string;
  evidenceSource: string;
  verificationStatus: VerificationStatus;
}

export interface AllergyConflictItem {
  id: string;
  medicationId: string;
  medicationName: string;
  allergenId: string;
  allergenName: string;
  reactionType: string;
  severity: InteractionSeverity;
  clinicalWarning: string;
}

export interface DrugInteractionAgentRequest {
  patient: Patient;
  medications: Medication[];
  allergies: Allergy[];
}

export interface DrugInteractionAgentResponse {
  patientId: string;
  timestamp: string;
  agentVersion: string;
  isPrototype: boolean;
  duplicateIngredients: DuplicateIngredientGroup[];
  drugInteractions: InteractionItem[];
  allergyConflicts: AllergyConflictItem[];
  summary: {
    totalChecked: number;
    contraindicatedCount: number;
    majorCount: number;
    moderateCount: number;
    duplicateIngredientCount: number;
    allergyConflictCount: number;
  };
  clinicalDisclaimer: string;
}

export interface IDrugInteractionAgentService {
  analyzeInteractions(request: DrugInteractionAgentRequest): Promise<DrugInteractionAgentResponse>;
}

// ==========================================
// 2. CHRONO-DOSING AGENT INTERFACES
// ==========================================

export type TimeOfDaySlot = 'morning' | 'noon' | 'evening' | 'bedtime' | 'prn_only';

export type FoodRelation = 'before_meal' | 'with_meal' | 'after_meal' | 'empty_stomach' | 'independent' | 'unknown';

export interface ChronoDosingSlotItem {
  slot: TimeOfDaySlot;
  timeWindow: string; // e.g. "07:00 - 08:30"
  targetMedications: Array<{
    medicationId: string;
    brand: string;
    genericName: string;
    prescribedDose: string;
    frequency: string;
    foodRelation: FoodRelation;
    administrationNotes: string;
    circadianRationale: string;
  }>;
}

export interface ChronoConflictItem {
  id: string;
  medicationAId: string;
  medicationAName: string;
  medicationBId: string;
  medicationBName: string;
  conflictType: 'absorption_chelation' | 'circadian_inversion' | 'fall_risk_nocturia' | 'sedative_timing';
  description: string;
  recommendedSeparationHours: number;
  managementGuidance: string;
}

export interface ChronoDosingRequest {
  patient: Patient;
  medications: Medication[];
  preferredWakeTime?: string; // e.g. "07:00"
  preferredBedTime?: string; // e.g. "22:00"
}

export interface ChronoDosingResponse {
  patientId: string;
  timestamp: string;
  agentVersion: string;
  isPrototype: boolean;
  proposedSchedule: ChronoDosingSlotItem[];
  chronoConflicts: ChronoConflictItem[];
  circadianInsights: string[];
  clinicalDisclaimer: string;
}

export interface IChronoDosingAgentService {
  generateSchedule(request: ChronoDosingRequest): Promise<ChronoDosingResponse>;
}

// ==========================================
// 3. RENAL & HEPATIC DOSING AGENT INTERFACES
// ==========================================

export type OrganRiskLevel = 'contraindicated' | 'dose_reduction_required' | 'caution_monitoring' | 'safe' | 'insufficient_data';

export interface OrganDosingAlert {
  id: string;
  medicationId: string;
  brand: string;
  genericName: string;
  organSystem: 'renal' | 'hepatic';
  riskLevel: OrganRiskLevel;
  triggerMeasurement: {
    testName: string;
    value: number | null;
    unit: string;
    collectionDate: string;
    status: VerificationStatus;
  } | null;
  guidelineThreshold: string;
  adjustmentRecommendation: string;
  evidenceSource: string;
}

export interface DeprescribingOpportunity {
  id: string;
  medicationId: string;
  brand: string;
  genericName: string;
  beersCriteriaCategory?: string;
  rationale: string;
  potentialHarm: string;
  deprescribingApproach: string;
  priority: 'high' | 'medium' | 'low';
}

export interface RenalHepaticDosingRequest {
  patient: Patient;
  medications: Medication[];
  labMeasurements: LabMeasurement[];
}

export interface RenalHepaticDosingResponse {
  patientId: string;
  timestamp: string;
  agentVersion: string;
  isPrototype: boolean;
  renalFunction: {
    latestEGFR: number | null;
    estimatedCrCl: number | null;
    stage: string;
    status: VerificationStatus;
  };
  hepaticFunction: {
    latestALT: number | null;
    latestAST: number | null;
    latestBilirubin: number | null;
    status: VerificationStatus;
  };
  organAlerts: OrganDosingAlert[];
  deprescribingOpportunities: DeprescribingOpportunity[];
  clinicalDisclaimer: string;
}

export interface IRenalHepaticDosingAgentService {
  evaluateClearanceAndDosing(request: RenalHepaticDosingRequest): Promise<RenalHepaticDosingResponse>;
}
