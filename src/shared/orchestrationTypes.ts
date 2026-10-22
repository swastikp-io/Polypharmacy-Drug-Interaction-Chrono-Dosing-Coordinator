import type { Medication } from './types.js';
import type {
  ClinicalDataGap,
  InteractionFinding,
  ProviderHealthStatus,
} from './interactionTypes.js';
import type { ScheduleConflictItem } from './chronoTypes.js';
import type {
  AgentId,
  AgentCapabilityDeclaration,
  ToolExecutionRecord,
  ToolExecutionStatus,
  OrchestrationDecision,
} from './agentContractTypes.js';

export type { Medication };
export type {
  ClinicalDataGap,
  InteractionFinding,
  ProviderHealthStatus,
};
export type { ScheduleConflictItem };
export type {
  AgentId,
  AgentCapabilityDeclaration,
  ToolExecutionRecord,
  ToolExecutionStatus,
  OrchestrationDecision,
};

// ==========================================
// 1. WORKFLOW STATE MACHINE STATES
// ==========================================

export type AgenticWorkflowState =
  | 'CREATED'
  | 'RETRIEVING_PATIENT_CONTEXT'
  | 'AWAITING_PRESCRIPTION'
  | 'EXTRACTING_PRESCRIPTION'
  | 'AWAITING_MEDICATION_CONFIRMATION'
  | 'MEDICATIONS_CONFIRMED'
  | 'CHECKING_INTERACTIONS'
  | 'AWAITING_CLINICAL_REVIEW'
  | 'PREPARING_SCHEDULE'
  | 'AWAITING_SCHEDULE_REVIEW'
  | 'COMPLETED'
  | 'BLOCKED'
  | 'FAILED'
  | 'CANCELLED';

export type WorkflowState =
  | AgenticWorkflowState
  | 'IDLE'
  | 'INITIALIZING'
  | 'FETCHING_PATIENT_RECORDS'
  | 'OCR_INTAKE'
  | 'EVALUATING_INTERACTIONS'
  | 'COORDINATING_SCHEDULE'
  | 'GENERATING_CONSOLIDATED_REPORT'
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
// 3. WORKFLOW RUN INSTANCE (Legacy / Compatibility)
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

// ==========================================
// 4. AGENTIC ARCHITECTURE: REVIEWS & HUMAN-IN-THE-LOOP
// ==========================================

export type ReviewCategory =
  | 'medication_identity_clarification'
  | 'missing_prescription_instructions'
  | 'potentially_significant_interaction'
  | 'insufficient_clinical_evidence'
  | 'conflicting_scheduling_constraints'
  | 'schedule_review';

export type ReviewStatus = 'pending' | 'approved' | 'rejected' | 'modified' | 'invalidated';

export type ReviewerRole =
  | 'attending_physician'
  | 'clinical_pharmacist'
  | 'registered_nurse'
  | 'medical_director';

export interface ReviewRequest {
  id: string;
  workflowId: string;
  category: ReviewCategory;
  reason: string;
  supportingEvidenceReferences: string[];
  missingOrConflictingInfo?: string;
  requestedReviewerAction: string;
  status: ReviewStatus;
  itemVersion: number;
  targetEntityType: 'medication' | 'schedule' | 'interaction' | 'ocr_candidate' | 'evidence' | 'constraint';
  targetEntityId: string;
  targetArtifactType?: WorkflowArtifactType;
  targetArtifactVersion?: number;
  reviewerIdentity?: string;
  reviewerRole?: ReviewerRole;
  reviewerNotes?: string;
  createdAt: string;
  resolvedAt?: string;
}

export interface ReviewResolution {
  status: 'approved' | 'rejected' | 'modified';
  reviewerIdentity: string;
  reviewerRole?: ReviewerRole;
  reviewerNotes?: string;
  targetVersion: number;
}

export interface ApprovalRecord {
  readonly approvalId: string;
  readonly workflowId: string;
  readonly reviewRequestId: string;
  readonly category: ReviewCategory;
  readonly targetEntityType: string;
  readonly targetEntityId: string;
  readonly targetArtifactType: WorkflowArtifactType;
  readonly targetArtifactVersion: number;
  readonly reviewerIdentity: string;
  readonly reviewerRole: ReviewerRole;
  readonly decision: 'approved' | 'rejected' | 'modified';
  readonly rationale: string;
  readonly decidedAt: string;
  readonly validUntilStale: boolean;
  readonly supersededBy?: string;
}

// ==========================================
// 5. AGENTIC ARCHITECTURE: OPERATIONS & TRACKING
// ==========================================

export interface StructuredError {
  code: string;
  message: string;
  isRecoverable: boolean;
  timestamp: string;
  details?: Record<string, any>;
}

export interface OperationRecord {
  operationId: string;
  operationType: string;
  inputVersion: number;
  outputVersion: number;
  dependencies: string[];
  executionStatus: 'success' | 'failed' | 'invalidated';
  executedAt: string;
  retryCount: number;
  error?: StructuredError;
}

export interface UnverifiedMedicationCandidate {
  id: string;
  rawText: string;
  brand?: string;
  genericName?: string;
  dose?: string;
  frequency?: string;
  route?: string;
  confidence: number;
  status: 'unverified' | 'confirmed' | 'rejected';
  rejectionReason?: string;
  verificationSource?: string;
}

export interface PrescriptionSourceRef {
  documentId: string;
  filename: string;
  filePath?: string;
  mimeType: string;
  uploadedAt: string;
}

export interface SchedulingConstraint {
  constraintId: string;
  ruleType: string;
  description: string;
  isHardConstraint: boolean;
  affectedMedicationIds: string[];
  status: 'satisfied' | 'conflicted' | 'waived';
}

export interface WorkflowQuestion {
  id: string;
  question: string;
  category: string;
  askedAt: string;
  answeredAt?: string;
  answer?: string;
  answeredBy?: string;
}

// ==========================================
// 5.5. PHASE 3: DEPENDENCY GRAPH & ARTIFACT TYPES
// ==========================================

export type WorkflowArtifactType =
  | 'prescription_image'
  | 'ocr_extraction'
  | 'confirmed_medications'
  | 'interaction_findings'
  | 'scheduling_constraints'
  | 'draft_schedule'
  | 'human_approval';

export type ArtifactFreshnessStatus = 'current' | 'stale' | 'invalidated';

export interface WorkflowArtifactNode<TData = any> {
  readonly artifactId: string;
  readonly artifactType: WorkflowArtifactType;
  readonly version: number;
  readonly status: ArtifactFreshnessStatus;
  readonly dependencyFingerprint: string;
  readonly contentHash: string;
  readonly upstreamArtifactIds: string[];
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly invalidatedAt?: string;
  readonly invalidationReason?: string;
  readonly data?: TData;
}

export interface HistoricalArtifactRecord {
  readonly historyId: string;
  readonly workflowId: string;
  readonly artifactId: string;
  readonly artifactType: WorkflowArtifactType;
  readonly version: number;
  readonly archivedAt: string;
  readonly reasonArchived: string;
  readonly contentHash: string;
  readonly dependencyFingerprint: string;
  readonly data: any;
}

export interface ArtifactDependencyGraphState {
  nodes: Record<string, WorkflowArtifactNode>;
  rootArtifactIds: string[];
  lastEvaluatedAt: string;
}

export interface RetryPolicy {
  readonly maxRetries: number;
  readonly initialBackoffMs: number;
  readonly backoffMultiplier: number;
  readonly maxBackoffMs: number;
}

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxRetries: 3,
  initialBackoffMs: 100,
  backoffMultiplier: 2,
  maxBackoffMs: 1000,
};

export interface WorkflowRecoveryReport {
  recoveredCount: number;
  recoveredWorkflows: Array<{
    workflowId: string;
    previousState: AgenticWorkflowState;
    reconciledState: AgenticWorkflowState;
    reconciledArtifactsCount: number;
  }>;
}

// ==========================================
// 6. AGENTIC ARCHITECTURE: TYPED WORKFLOW CONTEXT
// ==========================================

export interface WorkflowContext {
  workflowId: string;
  patientId: string;
  state: AgenticWorkflowState;
  version: number;
  confirmedMedicationRecordIds: string[];
  unverifiedMedicationCandidates: UnverifiedMedicationCandidate[];
  prescriptionSourceReferences: PrescriptionSourceRef[];
  interactionFindings: InteractionFinding[];
  evidenceReferences: Array<{ findingId: string; citation: string; levelOfEvidence?: string }>;
  schedulingConstraints: SchedulingConstraint[];
  outstandingQuestions: WorkflowQuestion[];
  pendingHumanApprovals: ReviewRequest[];
  completedOperations: OperationRecord[];
  failedOperations: OperationRecord[];
  datasetVersions: Record<string, string>;
  workflowVersion: string;
  createdAt: string;
  updatedAt: string;

  // Phase 3: Persistent Dependency Graph & Historical Outputs
  artifactGraph?: ArtifactDependencyGraphState;
  historicalArtifacts?: HistoricalArtifactRecord[];

  // Clear data distinctions
  rawExtractedData?: {
    documentId?: string;
    rawText?: string;
    candidates: UnverifiedMedicationCandidate[];
  };
  userConfirmedData?: {
    confirmedMedications: Medication[];
    confirmedBy: string;
    confirmedAt: string;
  };
  verifiedReferenceData?: {
    terminologyLookups?: Record<string, any>;
    monographs?: Record<string, any>;
  };
  derivedFindings?: {
    findings: InteractionFinding[];
    dataGaps: ClinicalDataGap[];
    providerHealth: ProviderHealthStatus;
  };
  proposedSchedules?: {
    scheduleTimeline: any;
    conflicts: ScheduleConflictItem[];
    generatedAt: string;
  };
  humanApprovedOutcomes?: {
    scheduleApproved: boolean;
    approvedBy?: string;
    approvedAt?: string;
    approvedScheduleVersion?: number;
    decisionRationale?: string;
  };
  // Phase 4: Explicit Approval Records & Audit Gates
  approvalRecords?: ApprovalRecord[];
}

// ==========================================
// 7. PHASE 5: AGENTIC WORKFLOW FINAL REPORT
// ==========================================

export interface AgenticWorkflowFinalReport {
  reportId: string;
  workflowId: string;
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
  clinicalDisclaimer: string;
  evidenceIntegrityNotice: string;

  // 1. Distinction: Technical Completion
  technicalCompletion: {
    isTechnicallyComplete: boolean;
    technicalState: AgenticWorkflowState;
    completedOperationsCount: number;
    completedOperations: string[];
    failedOperationsCount: number;
    failedOperations: Array<{
      operationType: string;
      code?: string;
      message?: string;
      isRecoverable?: boolean;
    }>;
  };

  // 2. Distinction: Outstanding Clinical Review
  clinicalReviewStatus: {
    hasOutstandingReviews: boolean;
    pendingReviewCount: number;
    pendingReviews: Array<{
      id: string;
      category: ReviewCategory;
      reason: string;
      targetEntityType: string;
      targetEntityId: string;
      missingOrConflictingInfo?: string;
    }>;
    resolvedReviewCount: number;
  };

  // 3. Distinction: Approval Status
  approvalStatus: {
    isFullyApproved: boolean;
    scheduleApproved: boolean;
    approvedBy?: string;
    approvedAt?: string;
    activeApprovalRecordsCount: number;
    staleApprovalRecordsCount: number;
    approvalRecords: Array<{
      approvalId: string;
      category: ReviewCategory;
      decision: string;
      reviewerIdentity: string;
      reviewerRole: string;
      validUntilStale: boolean;
      supersededBy?: string;
    }>;
  };

  // Clinical artifacts & freshness
  confirmedMedicationsCount: number;
  unverifiedCandidatesCount: number;
  interactionFindingsCount: number;
  interactionFindings: InteractionFinding[];
  proposedSchedule: any | null;
  artifactFreshness: {
    confirmedMedications: ArtifactFreshnessStatus | 'not_generated';
    interactionFindings: ArtifactFreshnessStatus | 'not_generated';
    draftSchedule: ArtifactFreshnessStatus | 'not_generated';
  };

  provenance: {
    orchestratorVersion: string;
    datasetVersions: Record<string, string>;
  };
}
