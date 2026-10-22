import type { VerificationStatus } from './types.js';

// ==========================================
// 1. PATIENT ROUTINE & CIRCADIAN SLOTS
// ==========================================

export interface PatientRoutine {
  patientId: string;
  wakeTime: string;      // e.g. "07:00"
  breakfastTime: string; // e.g. "08:00"
  lunchTime: string;     // e.g. "12:30"
  dinnerTime: string;    // e.g. "18:30"
  bedTime: string;       // e.g. "21:30"
  notes?: string;
  updatedAt: string;
}

export type FoodRelation =
  | 'empty_stomach' // >= 60 min before or >= 2h after food
  | 'before_meal'   // 15-30 min before meal
  | 'with_meal'     // during or immediately after meal
  | 'after_meal'    // 30-60 min after meal
  | 'independent'   // with or without food
  | 'unknown';

export type CircadianSlotId =
  | 'slot_wake_fasted'
  | 'slot_breakfast'
  | 'slot_midday_lunch'
  | 'slot_evening_dinner'
  | 'slot_bedtime'
  | 'slot_prn';

// ==========================================
// 2. SCHEDULING CONSTRAINTS & EVIDENCE
// ==========================================

export type ConstraintType =
  | 'meal_relation'
  | 'circadian_timing'
  | 'interval_separation'
  | 'prescribed_fixed_time'
  | 'food_avoidance';

export interface ConstraintParameter {
  targetSlot?: CircadianSlotId;
  foodRelation?: FoodRelation;
  offsetMinutes?: number;           // e.g. -60 for 60 min prior to breakfast
  windowDurationMinutes?: number;   // e.g. 45 or 60 min window
  otherMedicationIngredient?: string;
  minSeparationHours?: number;      // e.g. 4 hours
  maxSeparationHours?: number;
  timeUnit: 'minutes' | 'hours';
}

export interface ConstraintEvidence {
  sourceAuthority: string; // e.g. "FDA Approved Package Insert", "American Geriatrics Society Beers Criteria 2023"
  citation: string;
  evidenceStrength: 'established_clinical' | 'probable' | 'consensus_guideline';
  rationale: string;
  datasetVersion: string;
}

export interface SchedulingConstraint {
  id: string;
  medicationId: string;
  constraintType: ConstraintType;
  parameter: ConstraintParameter;
  evidence: ConstraintEvidence;
  isClinicianConfirmed: boolean;
  clinicianNotes?: string;
}

// ==========================================
// 3. SCHEDULED DOSE & DAILY TIMELINE
// ==========================================

export type SchedulingConfidence = 'high' | 'medium' | 'low';

export interface ScheduledDoseItem {
  doseId: string;
  medicationId: string;
  brand: string;
  genericName: string;
  strength: string;
  formulation: string;
  route: string;
  prescribedDose: string;        // SAFETY INVARIANT: Strictly matches prescriber's order
  prescribedFrequency: string;   // SAFETY INVARIANT: Strictly matches prescriber's order
  doseNumber: number;            // e.g. 1
  totalDosesPerDay: number;      // e.g. 2 for BID
  scheduledTime: string;         // e.g. "07:00"
  timeWindow: string;            // e.g. "06:30 - 07:30"
  slotId: CircadianSlotId;
  foodRelation: FoodRelation;
  foodInstruction: string;
  timingRationale: string;
  evidenceSources: Array<{
    sourceAuthority: string;
    citation: string;
    rationale: string;
  }>;
  administrationInstructions: string;
  specialPrecautions: string[];
  verificationStatus: VerificationStatus;
  confidence: SchedulingConfidence;
  uncertaintyReasons: string[];
}

export interface ScheduleTimeSlot {
  slotId: CircadianSlotId;
  slotName: string;
  targetTime: string;
  timeWindow: string;
  mealRelation: FoodRelation;
  description: string;
  doses: ScheduledDoseItem[];
}

// ==========================================
// 4. CONFLICTS & CLINICAL REVIEW ALERTS
// ==========================================

export type ScheduleConflictSeverity =
  | 'urgent_prescriber_review'
  | 'pharmacist_consult_needed'
  | 'routine_caution';

export type ScheduleConflictType =
  | 'impossible_constraint'
  | 'separation_violation'
  | 'bedtime_diuretic_hazard'
  | 'systemic_pk_unresolved_by_spacing'
  | 'unverified_prescription_gap'
  | 'meal_frequency_mismatch';

export interface ScheduleConflictItem {
  id: string;
  severity: ScheduleConflictSeverity;
  conflictType: ScheduleConflictType;
  title: string;
  description: string;
  medicationsInvolved: Array<{ id: string; name: string }>;
  clinicalRationale: string;
  recommendedAction: string;
  evidenceCitation: string;
}

// ==========================================
// 5. SIDE-BY-SIDE PRESCRIPTION COMPARISON
// ==========================================

export type ComparisonStatus =
  | 'aligned'
  | 'timing_optimized_for_safety'
  | 'conflict_flagged'
  | 'prn_flexible'
  | 'unverified_data_gap';

export interface PrescriptionComparisonItem {
  medicationId: string;
  brand: string;
  genericName: string;
  prescribedDose: string;
  prescribedFrequency: string;
  prescribedInstructions: string;
  proposedTimetable: string[];
  proposedMealRelation: FoodRelation;
  doseIntegrityStatus: 'strictly_preserved'; // Explicit guarantee that dose/freq were not changed
  comparisonStatus: ComparisonStatus;
  changeSummary: string;
  clinicalJustification: string;
}

export interface DraftScheduleComparison {
  patientId: string;
  generatedAt: string;
  totalMedications: number;
  unchangedDoseCount: number;
  alignedCount: number;
  optimizedCount: number;
  conflictCount: number;
  unverifiedCount: number;
  items: PrescriptionComparisonItem[];
}

// ==========================================
// 6. DAILY SCHEDULE TIMELINE & REVISIONS
// ==========================================

export type ScheduleStatus =
  | 'draft'
  | 'reviewed_accepted'
  | 'reviewed_rejected'
  | 'modified_by_clinician';

export interface ScheduleReviewMetadata {
  reviewedBy: string;
  reviewedAt: string;
  decision: 'accepted' | 'rejected' | 'modified';
  decisionRationale: string;
  clinicianNotes: string;
}

export interface DailyScheduleTimeline {
  scheduleId: string;
  patientId: string;
  generatedAt: string;
  version: string;
  isPrototype: boolean;
  status: ScheduleStatus;
  patientRoutine: PatientRoutine;
  slots: ScheduleTimeSlot[];
  prnDoses: ScheduledDoseItem[];
  unconfidentMedications: Array<{
    medicationId: string;
    brand: string;
    genericName: string;
    reason: string;
    confidence: SchedulingConfidence;
  }>;
  conflicts: ScheduleConflictItem[];
  comparison: DraftScheduleComparison;
  reviewMetadata?: ScheduleReviewMetadata;
  safetyNotice: string;
}

export interface ScheduleReviewSubmission {
  decision: 'accepted' | 'rejected' | 'modified';
  actor: string;
  rationale: string;
  clinicianNotes: string;
  modifiedSlots?: ScheduleTimeSlot[];
}
