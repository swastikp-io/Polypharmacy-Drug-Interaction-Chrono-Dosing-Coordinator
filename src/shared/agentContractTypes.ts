import { z } from 'zod';
import type { AgenticWorkflowState, ReviewRequest, StructuredError } from './orchestrationTypes.js';

// ==========================================
// 1. AGENT IDENTIFIERS & ROLES
// ==========================================

export type AgentId = 'prescription_agent' | 'interaction_agent' | 'scheduling_agent';

export const AgentIdSchema = z.enum([
  'prescription_agent',
  'interaction_agent',
  'scheduling_agent',
]);

// ==========================================
// 2. AGENT CAPABILITY DECLARATIONS
// ==========================================

export interface AgentCapabilityDeclaration {
  readonly agentId: AgentId;
  readonly name: string;
  readonly description: string;
  readonly permittedTools: readonly string[];
  readonly prohibitedTools: readonly string[];
  readonly preconditions: readonly string[];
  readonly postconditions: readonly string[];
  readonly humanApprovalPolicy: string;
  readonly evidenceAndProvenanceRequirements: readonly string[];
  readonly structuredFailureModes: readonly string[];
}

export const AgentCapabilityDeclarationSchema = z.object({
  agentId: AgentIdSchema,
  name: z.string().min(1),
  description: z.string().min(1),
  permittedTools: z.array(z.string()),
  prohibitedTools: z.array(z.string()),
  preconditions: z.array(z.string()),
  postconditions: z.array(z.string()),
  humanApprovalPolicy: z.string(),
  evidenceAndProvenanceRequirements: z.array(z.string()),
  structuredFailureModes: z.array(z.string()),
});

// ==========================================
// 3. TOOL EXECUTION RECORDS & AUDITING
// ==========================================

export type ToolExecutionStatus = 'success' | 'failed' | 'blocked';

export interface ToolExecutionRecord {
  readonly operationId: string;
  readonly workflowId: string;
  readonly agentId?: string;
  readonly toolName: string;
  readonly inputHash: string; // SHA-256 of sanitized input (no raw image/PII)
  readonly dependencyVersions: Record<string, string | number>;
  readonly status: ToolExecutionStatus;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly durationMs: number;
  readonly error?: StructuredError;
  readonly resultSummary?: string;
}

export const ToolExecutionRecordSchema = z.object({
  operationId: z.string().min(1),
  workflowId: z.string().min(1),
  agentId: z.string().optional(),
  toolName: z.string().min(1),
  inputHash: z.string().min(1),
  dependencyVersions: z.record(z.union([z.string(), z.number()])),
  status: z.enum(['success', 'failed', 'blocked']),
  startedAt: z.string().min(1),
  completedAt: z.string().min(1),
  durationMs: z.number().nonnegative(),
  error: z
    .object({
      code: z.string(),
      message: z.string(),
      isRecoverable: z.boolean(),
      timestamp: z.string(),
      details: z.record(z.any()).optional(),
    })
    .optional(),
  resultSummary: z.string().optional(),
});

// ==========================================
// 4. ORCHESTRATION DECISION
// ==========================================

export interface OrchestrationDecision {
  readonly workflowId: string;
  readonly currentState: AgenticWorkflowState;
  readonly nextOperation: string;
  readonly permittedAgent: AgentId | 'human_clinician' | 'none';
  readonly permittedTools: string[];
  readonly prohibitedTools: string[];
  readonly blockingDependencies: string[];
  readonly outstandingApprovals: ReviewRequest[];
  readonly canAutoAdvance: boolean;
  readonly reason: string;
}

export const OrchestrationDecisionSchema = z.object({
  workflowId: z.string().min(1),
  currentState: z.string().min(1),
  nextOperation: z.string().min(1),
  permittedAgent: z.enum([
    'prescription_agent',
    'interaction_agent',
    'scheduling_agent',
    'human_clinician',
    'none',
  ]),
  permittedTools: z.array(z.string()),
  prohibitedTools: z.array(z.string()),
  blockingDependencies: z.array(z.string()),
  outstandingApprovals: z.array(z.any()),
  canAutoAdvance: z.boolean(),
  reason: z.string(),
});

// ==========================================
// 5. TOOL CONTRACT SCHEMAS
// ==========================================

export const SubmitCandidateMedicationsInputSchema = z.object({
  workflowId: z.string().min(1, 'workflowId is required'),
  documentId: z.string().optional(),
  candidates: z.array(
    z.object({
      id: z.string().optional(),
      rawText: z.string().min(1, 'rawText is required'),
      brand: z.string().optional(),
      genericName: z.string().optional(),
      dose: z.string().optional(),
      frequency: z.string().optional(),
      route: z.string().optional(),
      confidence: z.number().min(0).max(1).default(0.5),
      status: z.literal('unverified').default('unverified'),
    })
  ).min(1, 'At least one candidate medication is required'),
});

export type SubmitCandidateMedicationsInput = z.infer<typeof SubmitCandidateMedicationsInputSchema>;

export const SubmitCandidateMedicationsOutputSchema = z.object({
  workflowId: z.string(),
  submittedCount: z.number(),
  unverifiedCandidateIds: z.array(z.string()),
  requiresClinicianConfirmation: z.literal(true),
  createdReviewRequestIds: z.array(z.string()),
});

export type SubmitCandidateMedicationsOutput = z.infer<typeof SubmitCandidateMedicationsOutputSchema>;

export const ProposeScheduleDraftInputSchema = z.object({
  workflowId: z.string().min(1, 'workflowId is required'),
  patientId: z.string().min(1, 'patientId is required'),
  allowTimingShifts: z.boolean().default(true),
});

export type ProposeScheduleDraftInput = z.infer<typeof ProposeScheduleDraftInputSchema>;

export const ProposeScheduleDraftOutputSchema = z.object({
  workflowId: z.string(),
  patientId: z.string(),
  totalSlots: z.number(),
  totalDoses: z.number(),
  prescribedDosesPreserved100Percent: z.literal(true),
  conflictsDetected: z.number(),
  requiresClinicianApproval: z.literal(true),
  scheduleDraft: z.any(),
});

export type ProposeScheduleDraftOutput = z.infer<typeof ProposeScheduleDraftOutputSchema>;
