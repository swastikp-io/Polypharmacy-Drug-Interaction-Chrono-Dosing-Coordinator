import { z } from 'zod';
import type { ClinicalEngineService } from '../services/clinicalEngineService.js';
import {
  AgentIdSchema,
  SubmitCandidateMedicationsInputSchema,
  ProposeScheduleDraftInputSchema,
} from '../../../src/shared/agentContractTypes.js';
import {
  ALL_AGENT_DECLARATIONS,
  getAgentDeclaration,
} from '../../../src/server/services/orchestration/agents/agentContracts.js';

// ==========================================
// 1. ORCHESTRATOR GET STATE
// ==========================================

const OrchestratorGetStateSchema = z.object({
  workflowId: z.string().min(1, 'workflowId is required'),
});

export async function handleOrchestratorGetState(
  args: unknown,
  engine: ClinicalEngineService
): Promise<Record<string, any>> {
  const { workflowId } = OrchestratorGetStateSchema.parse(args);

  const context = engine.agenticOrchestrator.getWorkflow(workflowId);
  if (!context) {
    throw new Error(`Workflow context "${workflowId}" was not found.`);
  }

  const nextOperation = engine.agenticOrchestrator.determineNextOperation(workflowId);
  const toolExecutions = engine.agenticOrchestrator.getToolExecutionHistory(workflowId);

  return {
    workflowId: context.workflowId,
    patientId: context.patientId,
    state: context.state,
    version: context.version,
    nextOperationDecision: nextOperation,
    confirmedMedicationCount: context.confirmedMedicationRecordIds.length,
    unverifiedCandidateCount: context.unverifiedMedicationCandidates.length,
    pendingHumanApprovals: context.pendingHumanApprovals.filter(
      (a) => a.status === 'pending'
    ),
    completedOperationsCount: context.completedOperations.length,
    failedOperationsCount: context.failedOperations.length,
    recentToolExecutions: toolExecutions.slice(-10),
    datasetVersions: context.datasetVersions,
    workflowVersion: context.workflowVersion,
    finalReportSummary: {
      technicalCompletion: {
        isTechnicallyComplete:
          context.state === 'COMPLETED' ||
          (context.completedOperations.some((o) => o.operationType === 'CHECK_INTERACTIONS') &&
            context.completedOperations.some((o) => o.operationType === 'COORDINATE_SCHEDULE')),
        state: context.state,
      },
      hasOutstandingClinicalReview: context.pendingHumanApprovals.some((a) => a.status === 'pending'),
      approvalStatus: {
        scheduleApproved: !!context.humanApprovedOutcomes?.scheduleApproved,
        approvedBy: context.humanApprovedOutcomes?.approvedBy,
      },
    },
    createdAt: context.createdAt,
    updatedAt: context.updatedAt,
  };
}

// ==========================================
// 2. ORCHESTRATOR STEP (Deterministic Advancement)
// ==========================================

const OrchestratorStepSchema = z.object({
  workflowId: z.string().min(1, 'workflowId is required'),
  actor: z.string().default('Claude Desktop MCP'),
});

export async function handleOrchestratorStep(
  args: unknown,
  engine: ClinicalEngineService
): Promise<Record<string, any>> {
  const { workflowId, actor } = OrchestratorStepSchema.parse(args);

  const updatedContext = await engine.agenticOrchestrator.advanceWorkflow(
    workflowId,
    actor
  );
  const nextOperation = engine.agenticOrchestrator.determineNextOperation(workflowId);

  return {
    workflowId: updatedContext.workflowId,
    state: updatedContext.state,
    version: updatedContext.version,
    nextOperationDecision: nextOperation,
    pendingApprovalsCount: updatedContext.pendingHumanApprovals.filter(
      (a) => a.status === 'pending'
    ).length,
    completedOperationsCount: updatedContext.completedOperations.length,
    failedOperationsCount: updatedContext.failedOperations.length,
  };
}

// ==========================================
// 3. GET TOOL EXECUTION HISTORY
// ==========================================

const GetToolExecutionHistorySchema = z.object({
  workflowId: z.string().min(1, 'workflowId is required'),
  limit: z.number().int().positive().optional().default(50),
});

export async function handleGetToolExecutionHistory(
  args: unknown,
  engine: ClinicalEngineService
): Promise<Record<string, any>> {
  const { workflowId, limit } = GetToolExecutionHistorySchema.parse(args);

  const history = engine.agenticOrchestrator.getToolExecutionHistory(workflowId);

  return {
    workflowId,
    totalRecords: history.length,
    executions: history.slice(0, limit),
  };
}

// ==========================================
// 4. GET AGENT CAPABILITIES
// ==========================================

const GetAgentCapabilitiesSchema = z.object({
  agentId: AgentIdSchema.optional(),
});

export async function handleGetAgentCapabilities(
  args: unknown,
  _engine: ClinicalEngineService
): Promise<Record<string, any>> {
  const { agentId } = GetAgentCapabilitiesSchema.parse(args || {});

  if (agentId) {
    return {
      agent: getAgentDeclaration(agentId),
    };
  }

  return {
    agents: Object.values(ALL_AGENT_DECLARATIONS),
  };
}

// ==========================================
// 5. SUBMIT CANDIDATE MEDICATIONS (Prescription Agent)
// ==========================================

export async function handleSubmitCandidateMedications(
  args: unknown,
  engine: ClinicalEngineService
): Promise<Record<string, any>> {
  const parsed = SubmitCandidateMedicationsInputSchema.parse(args);

  const result = await engine.toolRegistry.executeTool(
    'submit_candidate_medications',
    parsed,
    {
      actor: 'prescription_agent',
      actorRole: 'assistant',
      agentId: 'prescription_agent',
      workflowId: parsed.workflowId,
    }
  );

  if (!result.success) {
    throw new Error(result.error.message);
  }

  return result.data;
}

// ==========================================
// 6. PROPOSE SCHEDULE DRAFT (Scheduling Agent)
// ==========================================

export async function handleProposeScheduleDraft(
  args: unknown,
  engine: ClinicalEngineService
): Promise<Record<string, any>> {
  const parsed = ProposeScheduleDraftInputSchema.parse(args);

  const result = await engine.toolRegistry.executeTool(
    'propose_schedule_draft',
    parsed,
    {
      actor: 'scheduling_agent',
      actorRole: 'assistant',
      agentId: 'scheduling_agent',
      workflowId: parsed.workflowId,
    }
  );

  if (!result.success) {
    throw new Error(result.error.message);
  }

  return result.data;
}

// ==========================================
// 7. RESOLVE REVIEW REQUEST (Human Clinician Signoff)
// ==========================================

const ResolveReviewRequestSchema = z.object({
  reviewId: z.string().min(1, 'reviewId is required'),
  status: z.enum(['approved', 'rejected', 'modified']),
  reviewerIdentity: z.string().min(1, 'reviewerIdentity is required'),
  reviewerRole: z
    .enum(['attending_physician', 'clinical_pharmacist', 'registered_nurse', 'medical_director'])
    .optional()
    .default('clinical_pharmacist'),
  reviewerNotes: z.string().optional(),
  targetVersion: z.number().int().positive('targetVersion must be a positive integer'),
});

export async function handleResolveReviewRequest(
  args: unknown,
  engine: ClinicalEngineService
): Promise<Record<string, any>> {
  const parsed = ResolveReviewRequestSchema.parse(args);

  const existing = engine.reviewRequestRepo.findById(parsed.reviewId);
  if (!existing) {
    throw new Error(`Review request "${parsed.reviewId}" was not found.`);
  }

  const wf = engine.workflowRepo.findById(existing.workflowId);
  const currentItemVersion = wf ? wf.version : existing.itemVersion;

  const { request, approvalRecord } = engine.reviewRequestService.resolveRequest(
    parsed.reviewId,
    {
      status: parsed.status,
      reviewerIdentity: parsed.reviewerIdentity,
      reviewerRole: parsed.reviewerRole,
      reviewerNotes: parsed.reviewerNotes,
      targetVersion: parsed.targetVersion,
    },
    currentItemVersion
  );

  return {
    reviewId: request.id,
    workflowId: request.workflowId,
    status: request.status,
    reviewerIdentity: request.reviewerIdentity,
    reviewerRole: request.reviewerRole,
    targetEntityType: request.targetEntityType,
    targetEntityId: request.targetEntityId,
    targetArtifactType: request.targetArtifactType,
    targetArtifactVersion: request.targetArtifactVersion,
    resolvedAt: request.resolvedAt,
    approvalRecord: approvalRecord
      ? {
          id: approvalRecord.approvalId,
          category: approvalRecord.category,
          decision: approvalRecord.decision,
          validUntilStale: approvalRecord.validUntilStale,
        }
      : null,
  };
}

// ==========================================
// 8. GET REVIEW QUEUE (Read-only MCP Tool)
// ==========================================

const GetReviewQueueSchema = z.object({
  workflowId: z.string().optional(),
  status: z
    .enum(['pending', 'approved', 'rejected', 'modified', 'invalidated', 'all'])
    .optional()
    .default('pending'),
});

export async function handleGetReviewQueue(
  args: unknown,
  engine: ClinicalEngineService
): Promise<Record<string, any>> {
  const { workflowId, status } = GetReviewQueueSchema.parse(args || {});

  let reviews: any[] = [];
  if (workflowId) {
    if (status === 'all') {
      reviews = engine.reviewRequestService.listAll(workflowId);
    } else if (status === 'pending') {
      reviews = engine.reviewRequestService.listPending(workflowId);
    } else {
      reviews = engine.reviewRequestService.listAll(workflowId).filter((r) => r.status === status);
    }
  } else {
    if (status === 'all') {
      reviews = engine.reviewRequestRepo.findAll();
    } else if (status === 'pending') {
      reviews = engine.reviewRequestService.listAllPending();
    } else {
      reviews = engine.reviewRequestRepo.findAll().filter((r) => r.status === status);
    }
  }

  return {
    workflowId: workflowId || null,
    filterStatus: status,
    totalCount: reviews.length,
    reviews,
  };
}

// ==========================================
// 9. GET APPROVAL RECORDS (Read-only MCP Tool)
// ==========================================

const GetApprovalRecordsSchema = z.object({
  workflowId: z.string().min(1, 'workflowId is required'),
});

export async function handleGetApprovalRecords(
  args: unknown,
  engine: ClinicalEngineService
): Promise<Record<string, any>> {
  const { workflowId } = GetApprovalRecordsSchema.parse(args);

  const approvals = engine.approvalRepo.findByWorkflowId(workflowId);
  const activeApprovals = engine.approvalRepo.findActiveByWorkflowId(workflowId);

  return {
    workflowId,
    totalCount: approvals.length,
    activeCount: activeApprovals.length,
    approvals,
  };
}

// ==========================================
// 10. GET FINAL REPORT (Phase 5)
// ==========================================

export async function handleOrchestratorGetFinalReport(
  args: unknown,
  engine: ClinicalEngineService
): Promise<Record<string, any>> {
  const { workflowId } = OrchestratorGetStateSchema.parse(args);
  return engine.agenticOrchestrator.generateFinalReport(workflowId);
}
