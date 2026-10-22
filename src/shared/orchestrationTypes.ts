import type { Medication } from './types.js';
import type {
  ClinicalDataGap,
  InteractionFinding,
  ProviderHealthStatus,
} from './interactionTypes.js';
import type { ScheduleConflictItem } from './chronoTypes.js';

// ==========================================
// 1. WORKFLOW STATE MACHINE STATES
// ==========================================

export type WorkflowState =
  | 'IDLE'
  | 'INITIALIZING'
  | 'FETCHING_PATIENT_RECORDS'
  | 'OCR_INTAKE'
  | 'AWAITING_MEDICATION_CONFIRMATION'
  | 'EVALUATING_INTERACTIONS'
  | 'COORDINATING_SCHEDULE'
  | 'GENERATING_CONSOLIDATED_REPORT'
  | 'COMPLETED'
  | 'PAUSED_FOR_CLINICAL_REVIEW'
  | 'FAILED_RECOVERABLE'
  | 'ABORTED';

export type WorkflowStepStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'paused'
  | 'failed'
  | 'skipped';

export interface WorkflowStepResult {
  stepName: string;
  stageIndex: number;
  status: WorkflowStepStatus;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  summary: string;
  details?: Record<string, any>;
  error?: {
    code: string;
    message: string;
    recoverable: boolean;
  };
}

export type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'CHECKPOINT' | 'AUDIT';

export interface WorkflowExecutionLog {
  id: string;
  timestamp: string;
  level: LogLevel;
  step: string;
  message: string; // Sanitized: No PII, no raw prescription images, no unhashed credentials
  metadata?: Record<string, string | number | boolean | null>;
}

// ==========================================
// 2. CONSOLIDATED CLINICAL REPORT
// ==========================================

export type ReviewItemUrgency = 'immediate_action' | 'pre_administration_signoff' | 'routine_monitoring';

export type ReviewItemCategory =
  | 'uncertain_identity'
  | 'severe_ddi'
  | 'timing_conflict'
  | 'duplicate_ingredient'
  | 'clearance_gap'
  | 'fall_hazard';

export interface PharmacistReviewItem {
  id: string;
  category: ReviewItemCategory;
  urgency: ReviewItemUrgency;
  title: string;
  description: string;
  medicationsInvolved: Array<{ id: string; name: string }>;
  actionableRecommendation: string;
  evidenceCitation: string;
}

export interface ConsolidatedClinicalReport {
  reportId: string;
  workflowRunId: string;
  patientId: string;
  patientSummary: {
    id: string;
    name: string;
    mrn: string;
    age: number;
    careSetting: string;
  };
  generatedAt: string;
  isPrototype: boolean;
  confirmedMedicationCount: number;
  unconfirmedMedicationCount: number;
  activeMedications: Medication[];
  ocrExtractionSummary?: {
    documentId: string;
    extractedCount: number;
    reconciledCount: number;
    unresolvedCount: number;
  };
  interactionAnalysis: {
    totalEvaluated: number;
    contraindicatedCount: number;
    majorCount: number;
    moderateCount: number;
    duplicateIngredientsCount: number;
    findings: InteractionFinding[];
    dataGaps: ClinicalDataGap[];
    providerHealth: ProviderHealthStatus;
  };
  circadianCoordination: {
    scheduleId: string;
    totalSlots: number;
    totalDoses: number;
    prescribedDosesPreserved100Percent: boolean;
    unresolvedTimingConflicts: ScheduleConflictItem[];
    slotsSummary: Array<{
      slotName: string;
      targetTime: string;
      mealRelation: string;
      doseCount: number;
    }>;
  };
  itemsRequiringPharmacistReview: PharmacistReviewItem[];
  provenance: {
    orchestratorVersion: string;
    conflictEngineVersion: string;
    chronoCoordinatorVersion: string;
    referenceDatasetVersion: string;
    totalExecutionDurationMs: number;
  };
  clinicalDisclaimer: string;
}

// ==========================================
// 3. WORKFLOW RUN INSTANCE
// ==========================================

export interface WorkflowCheckpointAction {
  type: 'confirm_medications' | 'confirm_ocr' | 'resolve_conflict';
  message: string;
  unconfirmedMedications: Array<{
    id: string;
    brand: string;
    genericName: string;
    reason: string;
  }>;
}

export interface WorkflowRun {
  runId: string;
  patientId: string;
  state: WorkflowState;
  startedAt: string;
  completedAt?: string;
  totalDurationMs?: number;
  steps: Record<string, WorkflowStepResult>;
  logs: WorkflowExecutionLog[];
  report?: ConsolidatedClinicalReport;
  checkpointReason?: string;
  pendingAction?: WorkflowCheckpointAction;
  options: WorkflowRunOptions;
}

export interface WorkflowRunOptions {
  patientId: string;
  requireConfirmedOnly?: boolean; // Pause workflow if unverified medications exist
  ocrDocumentId?: string;          // If supplied, runs OCR intake stage
  timeoutMs?: number;              // Overall or step timeout (default: 8000ms)
  actor: string;
}

export interface WorkflowResumeRequest {
  confirmedMedicationIds?: string[];
  actor: string;
  notes?: string;
}
