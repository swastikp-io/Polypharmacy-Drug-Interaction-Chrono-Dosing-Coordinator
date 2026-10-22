import { randomUUID } from 'crypto';
import type {
  AgenticWorkflowFinalReport,
  AgenticWorkflowState,
  ApprovalRecord,
  ArtifactFreshnessStatus,
  ConsolidatedClinicalReport,
  HistoricalArtifactRecord,
  InteractionFinding,
  OperationRecord,
  PrescriptionSourceRef,
  RetryPolicy,
  ReviewCategory,
  ReviewRequest,
  ReviewResolution,
  SchedulingConstraint,
  StructuredError,
  UnverifiedMedicationCandidate,
  WorkflowArtifactType,
  WorkflowContext,
  WorkflowQuestion,
  WorkflowRecoveryReport,
} from '../../../shared/orchestrationTypes.js';
import { DEFAULT_RETRY_POLICY } from '../../../shared/orchestrationTypes.js';
import type {
  OrchestrationDecision,
  ToolExecutionRecord,
} from '../../../shared/agentContractTypes.js';
import type { WorkflowRepository } from '../../repositories/workflowRepository.js';
import type { PatientRepository } from '../../repositories/patientRepository.js';
import type { MedicationRepository } from '../../repositories/medicationRepository.js';
import type { LabMeasurementRepository } from '../../repositories/labMeasurementRepository.js';
import type { ToolExecutionRepository } from '../../repositories/toolExecutionRepository.js';
import type { ArtifactHistoryRepository } from '../../repositories/artifactHistoryRepository.js';
import type { ApprovalRecordRepository } from '../../repositories/approvalRecordRepository.js';
import type { AuditService } from '../auditService.js';
import { AgenticWorkflowStateMachine } from './stateMachine/workflowStateMachine.js';
import { ReviewRequestService } from './reviewRequestService.js';
import { FeedbackEngine, MAX_OPERATION_RETRIES } from './feedbackEngine.js';
import { ArtifactDependencyGraph } from './dependencyGraph.js';
import { ToolRegistry } from './tools/toolRegistry.js';
import {
  ApprovalVersionMismatchError,
  InvalidWorkflowTransitionError,
  OptimisticConcurrencyError,
  WorkflowPrerequisiteError,
} from './stateMachine/errors.js';

export interface CreateWorkflowOptions {
  patientId: string;
  prescriptionDocumentId?: string;
  prescriptionFilePath?: string;
  requireExplicitConfirmation?: boolean;
  actor: string;
}

export class AgenticWorkflowOrchestrator {
  public static readonly VERSION = '2026.3-Agentic-Phase3';

  private feedbackEngine: FeedbackEngine;
  private dependencyGraph: ArtifactDependencyGraph;

  constructor(
    private workflowRepo: WorkflowRepository,
    private reviewService: ReviewRequestService,
    private toolRegistry: ToolRegistry,
    private patientRepo: PatientRepository,
    private medRepo: MedicationRepository,
    private labRepo: LabMeasurementRepository,
    private auditService?: AuditService,
    private toolExecutionRepo?: ToolExecutionRepository,
    private artifactHistoryRepo?: ArtifactHistoryRepository,
    private retryPolicy: RetryPolicy = DEFAULT_RETRY_POLICY,
    private approvalRepo?: ApprovalRecordRepository
  ) {
    this.dependencyGraph = new ArtifactDependencyGraph(this.artifactHistoryRepo);
    this.feedbackEngine = new FeedbackEngine(
      this.reviewService,
      this.auditService,
      this.dependencyGraph,
      this.retryPolicy
    );
    if (this.approvalRepo) {
      this.reviewService.setApprovalRepository(this.approvalRepo);
    }
    if (this.toolExecutionRepo) {
      this.toolRegistry.setExecutionRepository(this.toolExecutionRepo);
    }
  }

  public getDependencyGraph(): ArtifactDependencyGraph {
    return this.dependencyGraph;
  }

  // ==========================================
  // 1. WORKFLOW CREATION
  // ==========================================

  public async createWorkflow(options: CreateWorkflowOptions): Promise<WorkflowContext> {
    const workflowId = `wf-${randomUUID()}`;
    const now = new Date().toISOString();

    const prescriptionRefs: PrescriptionSourceRef[] = [];
    if (options.prescriptionDocumentId) {
      prescriptionRefs.push({
        documentId: options.prescriptionDocumentId,
        filePath: options.prescriptionFilePath,
        filename: options.prescriptionFilePath
          ? options.prescriptionFilePath.split(/[\\/]/).pop() || 'prescription.png'
          : 'prescription.png',
        mimeType: 'image/png',
        uploadedAt: now,
      });
    }

    const context: WorkflowContext = {
      workflowId,
      patientId: options.patientId,
      state: 'CREATED',
      version: 1,
      confirmedMedicationRecordIds: [],
      unverifiedMedicationCandidates: [],
      prescriptionSourceReferences: prescriptionRefs,
      interactionFindings: [],
      evidenceReferences: [],
      schedulingConstraints: [],
      outstandingQuestions: [],
      pendingHumanApprovals: [],
      completedOperations: [],
      failedOperations: [],
      datasetVersions: {
        rxnorm: '2026.1',
        kdigo: '2024.1',
        fda_ddi: '2026-Q1',
        interactions: '2026.1',
      },
      workflowVersion: AgenticWorkflowOrchestrator.VERSION,
      createdAt: now,
      updatedAt: now,
      historicalArtifacts: [],
      approvalRecords: [],
    };

    this.dependencyGraph.ensureGraph(context);
    if (prescriptionRefs.length > 0) {
      this.dependencyGraph.recordArtifactNode(
        context,
        'prescription_image',
        prescriptionRefs[0]
      );
    }

    this.workflowRepo.create(context);

    if (this.auditService) {
      this.auditService.logEvent({
        patientId: options.patientId,
        entityType: 'workflow_context',
        entityId: workflowId,
        action: 'WORKFLOW_CREATED',
        actor: options.actor,
        summary: `Created agentic workflow ${workflowId} for patient ${options.patientId}.`,
        changedFields: { state: 'CREATED', version: 1 },
      });
    }

    return context;
  }

  public getWorkflow(workflowId: string): WorkflowContext | null {
    return this.workflowRepo.findById(workflowId);
  }

  public getToolExecutionHistory(workflowId: string): ToolExecutionRecord[] {
    if (this.toolExecutionRepo) {
      return this.toolExecutionRepo.findByWorkflowId(workflowId);
    }
    return [];
  }

  // ==========================================
  // 1.25. DEPENDENCY GRAPH & ARTIFACT QUERY GUARDS
  // ==========================================

  public getActiveFindings(workflowId: string): {
    isCurrent: boolean;
    findings: InteractionFinding[];
    status: ArtifactFreshnessStatus;
    invalidationReason?: string;
  } {
    const context = this.workflowRepo.findById(workflowId);
    if (!context) {
      throw new Error(`Workflow "${workflowId}" not found.`);
    }

    const artifactData = this.dependencyGraph.getArtifactData<InteractionFinding[]>(
      context,
      'interaction_findings'
    );
    const node = context.artifactGraph?.nodes['interaction_findings'];

    return {
      isCurrent: artifactData.isCurrent,
      findings: artifactData.data || [],
      status: artifactData.status,
      invalidationReason: node?.invalidationReason,
    };
  }

  public getActiveSchedule(workflowId: string): {
    isCurrent: boolean;
    schedule: any | null;
    status: ArtifactFreshnessStatus;
    invalidationReason?: string;
  } {
    const context = this.workflowRepo.findById(workflowId);
    if (!context) {
      throw new Error(`Workflow "${workflowId}" not found.`);
    }

    const artifactData = this.dependencyGraph.getArtifactData(
      context,
      'draft_schedule'
    );
    const node = context.artifactGraph?.nodes['draft_schedule'];

    return {
      isCurrent: artifactData.isCurrent,
      schedule: artifactData.data || null,
      status: artifactData.status,
      invalidationReason: node?.invalidationReason,
    };
  }

  public getArtifactGraph(workflowId: string) {
    const context = this.workflowRepo.findById(workflowId);
    return context?.artifactGraph;
  }

  public getHistoricalArtifacts(workflowId: string): HistoricalArtifactRecord[] {
    const context = this.workflowRepo.findById(workflowId);
    if (!context) return [];
    if (this.artifactHistoryRepo) {
      const dbRecords = this.artifactHistoryRepo.findByWorkflowId(workflowId);
      if (dbRecords.length > 0) return dbRecords;
    }
    return context.historicalArtifacts || [];
  }

  public getApprovalRecords(workflowId: string): ApprovalRecord[] {
    const context = this.workflowRepo.findById(workflowId);
    if (!context) return [];
    if (this.approvalRepo) {
      const dbRecords = this.approvalRepo.findByWorkflowId(workflowId);
      if (dbRecords.length > 0) return dbRecords;
    }
    return context.approvalRecords || [];
  }

  public getReviewQueue(workflowId?: string, status?: string): ReviewRequest[] {
    if (workflowId) {
      const context = this.workflowRepo.findById(workflowId);
      if (!context) return [];
      const items = context.pendingHumanApprovals || [];
      return status && status !== 'all' ? items.filter((r) => r.status === status) : items;
    }
    const items = this.reviewService.listAllPending();
    return status && status !== 'all' ? items.filter((r) => r.status === status) : items;
  }

  // ==========================================
  // 1.35. CONSOLIDATED FINAL REPORT SYNTHESIS
  // ==========================================

  /**
   * Generates a consolidated clinical and technical report for the workflow.
   * Explicitly distinguishes technical pipeline completion, outstanding clinical reviews,
   * and human approval status.
   */
  public generateFinalReport(workflowId: string): AgenticWorkflowFinalReport {
    const context = this.workflowRepo.findById(workflowId);
    if (!context) {
      throw new Error(`Workflow "${workflowId}" not found.`);
    }

    const patient = this.patientRepo.findById(context.patientId);
    const completedOps = context.completedOperations.map((o) => o.operationType);
    const failedOps = context.failedOperations.map((o) => ({
      operationType: o.operationType,
      code: o.error?.code,
      message: o.error?.message,
      isRecoverable: o.error?.isRecoverable,
    }));

    // Technical completion: true if in COMPLETED state, or if computational operations
    // have completed and no unrecoverable failure exists.
    const isTechnicallyComplete =
      context.state === 'COMPLETED' ||
      (completedOps.includes('CHECK_INTERACTIONS') &&
        completedOps.includes('COORDINATE_SCHEDULE') &&
        context.failedOperations.every((f) => f.error?.isRecoverable));

    const pendingReviews = (context.pendingHumanApprovals || []).filter(
      (r) => r.status === 'pending'
    );
    const resolvedReviews = (context.pendingHumanApprovals || []).filter(
      (r) => r.status === 'approved' || r.status === 'rejected' || r.status === 'modified'
    );

    const allApprovals = this.getApprovalRecords(workflowId);
    const activeApprovals = allApprovals.filter((a) => a.validUntilStale);
    const staleApprovals = allApprovals.filter((a) => !a.validUntilStale);

    const isFullyApproved =
      context.humanApprovedOutcomes?.scheduleApproved === true &&
      pendingReviews.length === 0 &&
      activeApprovals.some((a) => a.category === 'schedule_review');

    const medNode = context.artifactGraph?.nodes['confirmed_medications'];
    const ddiNode = context.artifactGraph?.nodes['interaction_findings'];
    const schedNode = context.artifactGraph?.nodes['draft_schedule'];

    return {
      reportId: `report-${randomUUID()}`,
      workflowId: context.workflowId,
      patientId: context.patientId,
      patientSummary: {
        id: patient?.id || context.patientId,
        name: patient?.name || 'Unknown Patient',
        mrn: patient?.mrn || 'UNKNOWN',
        age: patient?.dateOfBirth
          ? Math.floor(
              (Date.now() - new Date(patient.dateOfBirth).getTime()) /
                (365.25 * 24 * 60 * 60 * 1000)
            )
          : 75,
        careSetting: patient?.careSetting || 'Inpatient Geriatric Care',
      },
      generatedAt: new Date().toISOString(),
      isPrototype: true,
      clinicalDisclaimer:
        'PROTOTYPE SAFETY SYSTEM: Deterministic decision-support aid. Not certified as an autonomous medical device. All recommendations require licensed clinician review prior to administration.',
      evidenceIntegrityNotice:
        'SYNTHETIC TEST EVIDENCE: Interaction and circadian data derived from synthetic simulation fixtures [SYNTHETIC_TEST_DATA] and local reference data. Not verified clinical trial evidence.',

      // 1. Distinction: Technical Completion
      technicalCompletion: {
        isTechnicallyComplete,
        technicalState: context.state,
        completedOperationsCount: completedOps.length,
        completedOperations: completedOps,
        failedOperationsCount: failedOps.length,
        failedOperations: failedOps,
      },

      // 2. Distinction: Outstanding Clinical Review
      clinicalReviewStatus: {
        hasOutstandingReviews: pendingReviews.length > 0,
        pendingReviewCount: pendingReviews.length,
        pendingReviews: pendingReviews.map((r) => ({
          id: r.id,
          category: r.category,
          reason: r.reason,
          targetEntityType: r.targetEntityType,
          targetEntityId: r.targetEntityId,
          missingOrConflictingInfo: r.missingOrConflictingInfo,
        })),
        resolvedReviewCount: resolvedReviews.length,
      },

      // 3. Distinction: Approval Status
      approvalStatus: {
        isFullyApproved,
        scheduleApproved: !!context.humanApprovedOutcomes?.scheduleApproved,
        approvedBy: context.humanApprovedOutcomes?.approvedBy,
        approvedAt: context.humanApprovedOutcomes?.approvedAt,
        activeApprovalRecordsCount: activeApprovals.length,
        staleApprovalRecordsCount: staleApprovals.length,
        approvalRecords: allApprovals.map((a) => ({
          approvalId: a.approvalId,
          category: a.category,
          decision: a.decision,
          reviewerIdentity: a.reviewerIdentity,
          reviewerRole: a.reviewerRole,
          validUntilStale: a.validUntilStale,
          supersededBy: a.supersededBy,
        })),
      },

      confirmedMedicationsCount: context.confirmedMedicationRecordIds.length,
      unverifiedCandidatesCount: context.unverifiedMedicationCandidates.length,
      interactionFindingsCount: context.interactionFindings.length,
      interactionFindings: context.interactionFindings,
      proposedSchedule: context.proposedSchedules || null,
      artifactFreshness: {
        confirmedMedications: medNode?.status || 'not_generated',
        interactionFindings: ddiNode?.status || 'not_generated',
        draftSchedule: schedNode?.status || 'not_generated',
      },
      provenance: {
        orchestratorVersion: context.workflowVersion,
        datasetVersions: context.datasetVersions,
      },
    };
  }

  public generateConsolidatedReport(workflowId: string): AgenticWorkflowFinalReport {
    return this.generateFinalReport(workflowId);
  }

  /**
   * Recompute ONLY affected operations based on the artifact dependency graph.
   * Skips upstream operations that remain fresh.
   */
  public async recomputeAffectedOperations(
    workflowId: string,
    actor: string = 'Clinical Feedback Engine'
  ): Promise<{
    workflowId: string;
    recomputedOperations: string[];
    skippedOperations: string[];
    currentState: AgenticWorkflowState;
  }> {
    const context = this.workflowRepo.findById(workflowId);
    if (!context) {
      throw new Error(`Workflow "${workflowId}" not found.`);
    }

    const opsToRecompute = this.dependencyGraph.getOperationsRequiringRecomputation(context);
    const recomputed: string[] = [];
    const skipped: string[] = [];

    const sm = new AgenticWorkflowStateMachine(context, this.auditService);

    // 1. Check if OCR extraction needs recomputation
    if (opsToRecompute.includes('EXTRACT_PRESCRIPTION')) {
      const docRef = context.prescriptionSourceReferences[0];
      if (docRef && docRef.filePath) {
        const parseResult = await this.toolRegistry.executeTool(
          'parse_prescription',
          { filePath: docRef.filePath, patientId: context.patientId },
          {
            actor,
            actorRole: 'clinician',
            workflowId: context.workflowId,
            agentId: 'prescription_agent',
            dependencyVersions: context.datasetVersions,
          }
        );
        if (parseResult.success) {
          this.dependencyGraph.recordArtifactNode(
            context,
            'ocr_extraction',
            parseResult.data
          );
          recomputed.push('EXTRACT_PRESCRIPTION');
        }
      }
    } else {
      skipped.push('EXTRACT_PRESCRIPTION');
    }

    // 2. Recompute interactions if needed
    if (opsToRecompute.includes('CHECK_INTERACTIONS')) {
      if (context.state === 'MEDICATIONS_CONFIRMED') {
        sm.transitionTo('CHECKING_INTERACTIONS', { actor });
      }
      await this.executeInteractionCheck(context, sm, actor);
      recomputed.push('CHECK_INTERACTIONS');
    } else {
      skipped.push('CHECK_INTERACTIONS');
    }

    // 3. Recompute schedule if needed
    if (opsToRecompute.includes('COORDINATE_SCHEDULE')) {
      if (context.state === 'PREPARING_SCHEDULE') {
        await this.executeSchedulePreparation(context, sm, actor);
        recomputed.push('COORDINATE_SCHEDULE');
      } else if (context.state === 'AWAITING_CLINICAL_REVIEW') {
        const hasPendingReviews = context.pendingHumanApprovals.some(
          (r) =>
            r.status === 'pending' &&
            (r.category === 'potentially_significant_interaction' ||
              r.category === 'insufficient_clinical_evidence')
        );
        if (!hasPendingReviews) {
          sm.transitionTo('PREPARING_SCHEDULE', {
            actor,
            reason: 'All clinical interaction reviews resolved by authorized clinician.',
          });
          await this.executeSchedulePreparation(context, sm, actor);
          recomputed.push('COORDINATE_SCHEDULE');
        } else {
          // Paused for clinical review: cannot generate final schedule draft until review resolves
          skipped.push('COORDINATE_SCHEDULE');
        }
      } else if (
        context.state === 'MEDICATIONS_CONFIRMED' ||
        context.state === 'CHECKING_INTERACTIONS'
      ) {
        sm.transitionTo('PREPARING_SCHEDULE', { actor });
        await this.executeSchedulePreparation(context, sm, actor);
        recomputed.push('COORDINATE_SCHEDULE');
      }
    } else {
      skipped.push('COORDINATE_SCHEDULE');
    }

    this.workflowRepo.update(context);

    if (this.auditService) {
      this.auditService.logEvent({
        patientId: context.patientId,
        entityType: 'workflow_context',
        entityId: workflowId,
        action: 'SELECTIVE_RECOMPUTATION_COMPLETE',
        actor,
        summary: `Selectively recomputed [${recomputed.join(', ')}]; skipped [${skipped.join(', ')}]`,
        changedFields: { recomputed, skipped, state: context.state },
      });
    }

    return {
      workflowId,
      recomputedOperations: recomputed,
      skippedOperations: skipped,
      currentState: context.state,
    };
  }

  /**
   * Recovers active workflows after application restart.
   * Deterministically validates fingerprints, reconciles interrupted transient states,
   * and preserves safety invariants.
   */
  public async recoverActiveWorkflows(): Promise<WorkflowRecoveryReport> {
    const activeWorkflows = this.workflowRepo.findActive();
    const recoveredList: WorkflowRecoveryReport['recoveredWorkflows'] = [];

    for (const context of activeWorkflows) {
      const previousState = context.state;
      this.dependencyGraph.ensureGraph(context);

      const { staleNodes } = this.dependencyGraph.validateGraphFingerprints(context);

      let reconciledState = context.state;

      // Handle transient in-flight states interrupted by application restart
      switch (context.state) {
        case 'RETRIEVING_PATIENT_CONTEXT':
          reconciledState = 'CREATED';
          context.state = 'CREATED';
          break;

        case 'EXTRACTING_PRESCRIPTION':
          reconciledState = context.prescriptionSourceReferences.length > 0
            ? 'EXTRACTING_PRESCRIPTION'
            : 'AWAITING_PRESCRIPTION';
          context.state = reconciledState;
          break;

        case 'CHECKING_INTERACTIONS':
          reconciledState = 'MEDICATIONS_CONFIRMED';
          context.state = 'MEDICATIONS_CONFIRMED';
          break;

        case 'PREPARING_SCHEDULE':
          reconciledState = context.pendingHumanApprovals.some((a) => a.status === 'pending')
            ? 'AWAITING_CLINICAL_REVIEW'
            : 'MEDICATIONS_CONFIRMED';
          context.state = reconciledState;
          break;

        default:
          break;
      }

      this.workflowRepo.update(context);

      if (this.auditService) {
        this.auditService.logEvent({
          patientId: context.patientId,
          entityType: 'workflow_context',
          entityId: context.workflowId,
          action: 'WORKFLOW_RECOVERED_AFTER_RESTART',
          actor: 'SystemRecovery',
          summary: `Recovered workflow ${context.workflowId} from ${previousState} to ${reconciledState}. Reconciled ${staleNodes.length} stale nodes.`,
          changedFields: { previousState, reconciledState, staleNodes },
        });
      }

      recoveredList.push({
        workflowId: context.workflowId,
        previousState,
        reconciledState,
        reconciledArtifactsCount: staleNodes.length,
      });
    }

    return {
      recoveredCount: recoveredList.length,
      recoveredWorkflows: recoveredList,
    };
  }

  // ==========================================
  // 1.5. DETERMINE NEXT OPERATION (Agentic Decision Engine)
  // ==========================================

  public determineNextOperation(workflowId: string): OrchestrationDecision {
    const context = this.workflowRepo.findById(workflowId);
    if (!context) {
      throw new Error(`Workflow "${workflowId}" not found.`);
    }

    const pendingApprovals = context.pendingHumanApprovals.filter(
      (a) => a.status === 'pending'
    );

    switch (context.state) {
      case 'CREATED':
        return {
          workflowId,
          currentState: 'CREATED',
          nextOperation: 'RETRIEVE_PATIENT_CONTEXT',
          permittedAgent: 'prescription_agent',
          permittedTools: ['get_patient_context', 'get_workflow_status'],
          prohibitedTools: ['confirm_medication', 'propose_schedule_draft', 'check_interactions'],
          blockingDependencies: [],
          outstandingApprovals: [],
          canAutoAdvance: true,
          reason: 'Ready to retrieve patient clinical chart, baseline lab values, and chronic diagnoses.',
        };

      case 'RETRIEVING_PATIENT_CONTEXT':
        if (context.prescriptionSourceReferences && context.prescriptionSourceReferences.length > 0) {
          return {
            workflowId,
            currentState: 'RETRIEVING_PATIENT_CONTEXT',
            nextOperation: 'EXTRACT_PRESCRIPTION',
            permittedAgent: 'prescription_agent',
            permittedTools: ['parse_prescription', 'submit_candidate_medications', 'get_workflow_status'],
            prohibitedTools: ['confirm_medication', 'check_interactions', 'propose_schedule_draft'],
            blockingDependencies: [],
            outstandingApprovals: [],
            canAutoAdvance: true,
            reason: 'Prescription document is attached. Ready to extract and normalize candidate medication orders.',
          };
        }
        if (context.unverifiedMedicationCandidates.length > 0) {
          return {
            workflowId,
            currentState: 'RETRIEVING_PATIENT_CONTEXT',
            nextOperation: 'CONFIRM_MEDICATIONS',
            permittedAgent: 'human_clinician',
            permittedTools: ['confirm_medication', 'create_review_request', 'get_workflow_status'],
            prohibitedTools: ['check_interactions', 'propose_schedule_draft'],
            blockingDependencies: ['Unverified medication orders in chart require confirmation'],
            outstandingApprovals: pendingApprovals,
            canAutoAdvance: false,
            reason: 'Unverified medications found in patient chart. Clinician verification required.',
          };
        }
        return {
          workflowId,
          currentState: 'RETRIEVING_PATIENT_CONTEXT',
          nextOperation: 'CHECK_INTERACTIONS',
          permittedAgent: 'interaction_agent',
          permittedTools: ['check_interactions', 'get_interaction_evidence', 'get_confirmed_medications', 'get_workflow_status'],
          prohibitedTools: ['confirm_medication', 'propose_schedule_draft'],
          blockingDependencies: [],
          outstandingApprovals: [],
          canAutoAdvance: true,
          reason: 'Patient chart contains verified medications. Proceeding to interaction evaluation.',
        };

      case 'AWAITING_PRESCRIPTION':
        return {
          workflowId,
          currentState: 'AWAITING_PRESCRIPTION',
          nextOperation: 'UPLOAD_PRESCRIPTION',
          permittedAgent: 'human_clinician',
          permittedTools: ['parse_prescription', 'get_workflow_status'],
          prohibitedTools: ['check_interactions', 'propose_schedule_draft'],
          blockingDependencies: ['Prescription intake file required'],
          outstandingApprovals: pendingApprovals,
          canAutoAdvance: false,
          reason: 'Workflow is paused waiting for clinician to upload a prescription image or document.',
        };

      case 'EXTRACTING_PRESCRIPTION':
        return {
          workflowId,
          currentState: 'EXTRACTING_PRESCRIPTION',
          nextOperation: 'SUBMIT_CANDIDATE_MEDICATIONS',
          permittedAgent: 'prescription_agent',
          permittedTools: ['parse_prescription', 'submit_candidate_medications', 'get_workflow_status'],
          prohibitedTools: ['confirm_medication', 'check_interactions', 'propose_schedule_draft'],
          blockingDependencies: [],
          outstandingApprovals: [],
          canAutoAdvance: true,
          reason: 'Extracting candidate orders and terminology matching against RxNorm standard entities.',
        };

      case 'AWAITING_MEDICATION_CONFIRMATION':
        return {
          workflowId,
          currentState: 'AWAITING_MEDICATION_CONFIRMATION',
          nextOperation: 'CONFIRM_MEDICATIONS',
          permittedAgent: 'human_clinician',
          permittedTools: ['confirm_medication', 'create_review_request', 'get_workflow_status'],
          prohibitedTools: ['check_interactions', 'propose_schedule_draft', 'evaluate_schedule_constraints'],
          blockingDependencies: [
            `Unconfirmed medication orders pending verification (${pendingApprovals.length} item(s))`,
          ],
          outstandingApprovals: pendingApprovals,
          canAutoAdvance: false,
          reason: 'Prescription orders must be verified by a licensed clinician before safety-critical interaction screening.',
        };

      case 'MEDICATIONS_CONFIRMED':
        return {
          workflowId,
          currentState: 'MEDICATIONS_CONFIRMED',
          nextOperation: 'CHECK_INTERACTIONS',
          permittedAgent: 'interaction_agent',
          permittedTools: ['check_interactions', 'get_interaction_evidence', 'get_confirmed_medications', 'get_workflow_status'],
          prohibitedTools: ['confirm_medication', 'submit_candidate_medications', 'propose_schedule_draft'],
          blockingDependencies: [],
          outstandingApprovals: [],
          canAutoAdvance: true,
          reason: 'All active medications confirmed. Ready for deterministic conflict engine evaluation.',
        };

      case 'CHECKING_INTERACTIONS':
        if (pendingApprovals.length > 0) {
          return {
            workflowId,
            currentState: 'CHECKING_INTERACTIONS',
            nextOperation: 'RESOLVE_CLINICAL_REVIEW',
            permittedAgent: 'human_clinician',
            permittedTools: ['create_review_request', 'get_workflow_status', 'confirm_medication'],
            prohibitedTools: ['propose_schedule_draft'],
            blockingDependencies: ['Clinical review required for severe interactions or data gaps'],
            outstandingApprovals: pendingApprovals,
            canAutoAdvance: false,
            reason: 'Interaction screening detected potential severe conflicts or data gaps requiring pharmacist signoff.',
          };
        }
        return {
          workflowId,
          currentState: 'CHECKING_INTERACTIONS',
          nextOperation: 'PREPARE_SCHEDULE',
          permittedAgent: 'scheduling_agent',
          permittedTools: ['evaluate_schedule_constraints', 'propose_schedule_draft', 'get_workflow_status'],
          prohibitedTools: ['confirm_medication'],
          blockingDependencies: [],
          outstandingApprovals: [],
          canAutoAdvance: true,
          reason: 'Interaction screening complete. Ready to proceed to circadian scheduling draft.',
        };

      case 'AWAITING_CLINICAL_REVIEW':
        return {
          workflowId,
          currentState: 'AWAITING_CLINICAL_REVIEW',
          nextOperation: 'RESOLVE_CLINICAL_REVIEW',
          permittedAgent: 'human_clinician',
          permittedTools: ['confirm_medication', 'create_review_request', 'get_workflow_status'],
          prohibitedTools: ['propose_schedule_draft', 'evaluate_schedule_constraints'],
          blockingDependencies: [
            `Pharmacist review required for ${pendingApprovals.length} item(s)`,
          ],
          outstandingApprovals: pendingApprovals,
          canAutoAdvance: false,
          reason: 'Interaction findings or clinical data gaps require explicit human clinician signoff.',
        };

      case 'PREPARING_SCHEDULE':
        return {
          workflowId,
          currentState: 'PREPARING_SCHEDULE',
          nextOperation: 'PROPOSE_SCHEDULE_DRAFT',
          permittedAgent: 'scheduling_agent',
          permittedTools: ['evaluate_schedule_constraints', 'propose_schedule_draft', 'get_workflow_status'],
          prohibitedTools: ['confirm_medication', 'submit_candidate_medications'],
          blockingDependencies: [],
          outstandingApprovals: [],
          canAutoAdvance: true,
          reason: 'Evaluating diurnal routine constraints and proposing 24-hour administration timetable.',
        };

      case 'AWAITING_SCHEDULE_REVIEW': {
        const pendingConstraints = context.pendingHumanApprovals.filter(
          (a) => a.category === 'conflicting_scheduling_constraints' && a.status === 'pending'
        );
        if (pendingConstraints.length > 0) {
          return {
            workflowId,
            currentState: 'AWAITING_SCHEDULE_REVIEW',
            nextOperation: 'RESOLVE_SCHEDULING_CONFLICT',
            permittedAgent: 'human_clinician',
            permittedTools: ['get_workflow_status'],
            prohibitedTools: ['propose_schedule_draft', 'submit_candidate_medications'],
            blockingDependencies: [
              `Unresolved mandatory scheduling constraint(s) (${pendingConstraints.length}) require clinician resolution before schedule approval.`,
            ],
            outstandingApprovals: pendingApprovals,
            canAutoAdvance: false,
            reason:
              'Mandatory diurnal scheduling constraints conflict. Clinician must resolve or waive constraints before schedule can be marked ready for approval.',
          };
        }

        return {
          workflowId,
          currentState: 'AWAITING_SCHEDULE_REVIEW',
          nextOperation: 'APPROVE_SCHEDULE',
          permittedAgent: 'human_clinician',
          permittedTools: ['get_workflow_status'],
          prohibitedTools: ['propose_schedule_draft', 'submit_candidate_medications'],
          blockingDependencies: ['Draft diurnal schedule requires human pharmacist or physician signoff'],
          outstandingApprovals: pendingApprovals,
          canAutoAdvance: false,
          reason: 'Proposed 24-hour schedule draft requires human approval before clinical administration.',
        };
      }

      case 'COMPLETED':
        return {
          workflowId,
          currentState: 'COMPLETED',
          nextOperation: 'NONE',
          permittedAgent: 'none',
          permittedTools: ['get_patient_context', 'get_confirmed_medications', 'get_workflow_status'],
          prohibitedTools: ['parse_prescription', 'submit_candidate_medications', 'propose_schedule_draft'],
          blockingDependencies: [],
          outstandingApprovals: [],
          canAutoAdvance: false,
          reason: 'Agentic workflow completed successfully. All steps evaluated and approved.',
        };

      case 'BLOCKED':
        return {
          workflowId,
          currentState: 'BLOCKED',
          nextOperation: 'REMEDY_BLOCKING_ERROR',
          permittedAgent: 'human_clinician',
          permittedTools: ['get_workflow_status'],
          prohibitedTools: ['check_interactions', 'propose_schedule_draft'],
          blockingDependencies: ['Workflow blocked due to missing evidence or clinical halt'],
          outstandingApprovals: pendingApprovals,
          canAutoAdvance: false,
          reason: 'Workflow is blocked. Clinician intervention or evidence restoration required.',
        };

      case 'FAILED':
      case 'CANCELLED':
      default:
        return {
          workflowId,
          currentState: context.state,
          nextOperation: 'TERMINAL_STATE',
          permittedAgent: 'none',
          permittedTools: ['get_workflow_status'],
          prohibitedTools: ['parse_prescription', 'check_interactions', 'propose_schedule_draft'],
          blockingDependencies: ['Workflow is in a terminal error or cancelled state'],
          outstandingApprovals: [],
          canAutoAdvance: false,
          reason: `Workflow is in terminal state: ${context.state}`,
        };
    }
  }

  // ==========================================
  // 2. ADVANCE WORKFLOW (Conditional Orchestration)
  // ==========================================

  public async advanceWorkflow(
    workflowId: string,
    actor: string = 'Clinical Orchestrator',
    targetState?: AgenticWorkflowState
  ): Promise<WorkflowContext> {
    const context = this.workflowRepo.findById(workflowId);
    if (!context) {
      throw new Error(`Workflow "${workflowId}" not found.`);
    }

    const sm = new AgenticWorkflowStateMachine(context, this.auditService);

    if (targetState && targetState !== context.state) {
      sm.transitionTo(targetState, {
        actor,
        reason: `Explicit transition requested to ${targetState}`,
      });
      this.workflowRepo.update(context);
      return context;
    }

    switch (context.state) {
      // ----------------------------------------------------
      // STATE: CREATED -> RETRIEVING_PATIENT_CONTEXT
      // ----------------------------------------------------
      case 'CREATED': {
        sm.transitionTo('RETRIEVING_PATIENT_CONTEXT', { actor });

        const toolResult = await this.toolRegistry.executeTool(
          'get_patient_context',
          { patientId: context.patientId },
          {
            actor,
            actorRole: 'clinician',
            workflowId: context.workflowId,
            agentId: 'prescription_agent',
            dependencyVersions: context.datasetVersions,
          }
        );

        if (!toolResult.success) {
          const err: StructuredError = {
            code: toolResult.error.code,
            message: toolResult.error.message,
            isRecoverable: false,
            timestamp: new Date().toISOString(),
          };
          this.feedbackEngine.recordOperation(context, {
            operationType: 'RETRIEVE_PATIENT_CONTEXT',
            inputVersion: context.version,
            outputVersion: context.version,
            dependencies: [`patient:${context.patientId}`],
            executionStatus: 'failed',
            error: err,
          });
          sm.failWorkflow(err);
          this.workflowRepo.update(context);
          return context;
        }

        // Identify confirmed active medications vs unverified medications in chart
        const allMeds = this.medRepo.findByPatientId(context.patientId);
        const activeMeds = allMeds.filter(
          (m) => m.status === 'active' || m.status === 'prn'
        );
        const confirmedMeds = activeMeds.filter(
          (m) => m.verificationStatus === 'confirmed'
        );
        const unverifiedMeds = activeMeds.filter(
          (m) => m.verificationStatus !== 'confirmed'
        );

        context.confirmedMedicationRecordIds = confirmedMeds.map((m) => m.id);
        context.userConfirmedData = {
          confirmedMedications: confirmedMeds,
          confirmedBy: 'Patient Chart',
          confirmedAt: new Date().toISOString(),
        };

        if (confirmedMeds.length > 0) {
          this.dependencyGraph.recordArtifactNode(
            context,
            'confirmed_medications',
            confirmedMeds
          );
        }

        if (unverifiedMeds.length > 0) {
          context.unverifiedMedicationCandidates = unverifiedMeds.map((u) => ({
            id: u.id,
            rawText: `${u.brand} ${u.strength} ${u.frequency}`,
            brand: u.brand,
            genericName: u.genericName,
            dose: u.prescribedDose,
            frequency: u.frequency,
            route: u.route,
            confidence: 0.5,
            status: 'unverified',
          }));
        }

        this.feedbackEngine.recordOperation(context, {
          operationType: 'RETRIEVE_PATIENT_CONTEXT',
          inputVersion: context.version,
          outputVersion: context.version,
          dependencies: [`patient:${context.patientId}`],
          executionStatus: 'success',
        });

        // Determine next state
        if (context.prescriptionSourceReferences.length > 0) {
          sm.transitionTo('EXTRACTING_PRESCRIPTION', { actor });
        } else if (context.unverifiedMedicationCandidates.length > 0) {
          // Unverified medications in chart need confirmation
          this.createMedicationReviewRequests(context);
          sm.transitionTo('AWAITING_MEDICATION_CONFIRMATION', {
            actor,
            reason: `${context.unverifiedMedicationCandidates.length} unverified medication(s) require chart verification.`,
          });
        } else if (context.confirmedMedicationRecordIds.length > 0) {
          sm.transitionTo('MEDICATIONS_CONFIRMED', { actor });
        } else {
          sm.transitionTo('AWAITING_PRESCRIPTION', { actor });
        }

        this.workflowRepo.update(context);
        return context;
      }

      // ----------------------------------------------------
      // STATE: EXTRACTING_PRESCRIPTION
      // ----------------------------------------------------
      case 'EXTRACTING_PRESCRIPTION': {
        const docRef = context.prescriptionSourceReferences[0];
        if (!docRef || !docRef.filePath) {
          sm.blockWorkflow('No prescription document file path provided for extraction.');
          this.workflowRepo.update(context);
          return context;
        }

        const parseResult = await this.toolRegistry.executeTool(
          'parse_prescription',
          { filePath: docRef.filePath, patientId: context.patientId },
          {
            actor,
            actorRole: 'clinician',
            workflowId: context.workflowId,
            agentId: 'prescription_agent',
            dependencyVersions: context.datasetVersions,
          }
        );

        if (!parseResult.success) {
          const err: StructuredError = {
            code: parseResult.error.code,
            message: parseResult.error.message,
            isRecoverable: true,
            timestamp: new Date().toISOString(),
          };
          this.feedbackEngine.recordOperation(context, {
            operationType: 'EXTRACT_PRESCRIPTION',
            inputVersion: context.version,
            outputVersion: context.version,
            dependencies: [`document:${docRef.documentId}`],
            executionStatus: 'failed',
            error: err,
          });
          sm.failWorkflow(err);
          this.workflowRepo.update(context);
          return context;
        }

        const extractedData = parseResult.data;
        context.rawExtractedData = {
          documentId: docRef.documentId,
          rawText: extractedData.rawText,
          candidates: extractedData.candidateMedications.map((c: any) => ({
            id: c.candidateId || `cand-${randomUUID()}`,
            rawText: c.rawText,
            brand: c.brand,
            genericName: c.genericName,
            dose: c.dose,
            frequency: c.frequency,
            route: c.route,
            confidence: c.confidenceScore ?? 0.5,
            status: c.confidenceScore >= 0.85 ? 'confirmed' : 'unverified',
          })),
        };

        // Classify extracted candidates
        const newUnverified = context.rawExtractedData.candidates.filter(
          (c) => c.status === 'unverified'
        );
        const newConfirmed = context.rawExtractedData.candidates.filter(
          (c) => c.status === 'confirmed'
        );

        context.unverifiedMedicationCandidates.push(...newUnverified);
        for (const c of newConfirmed) {
          if (!context.confirmedMedicationRecordIds.includes(c.id)) {
            context.confirmedMedicationRecordIds.push(c.id);
          }
        }

        this.dependencyGraph.recordArtifactNode(
          context,
          'ocr_extraction',
          parseResult.data
        );

        this.feedbackEngine.recordOperation(context, {
          operationType: 'EXTRACT_PRESCRIPTION',
          inputVersion: context.version,
          outputVersion: context.version,
          dependencies: [`document:${docRef.documentId}`],
          executionStatus: 'success',
        });

        // If uncertain medication identity or dose returned, halt and await confirmation!
        if (newUnverified.length > 0 || parseResult.data.ambiguityCount > 0) {
          this.createMedicationReviewRequests(context);
          sm.transitionTo('AWAITING_MEDICATION_CONFIRMATION', {
            actor,
            reason: `OCR returned ${newUnverified.length} ambiguous/uncertain candidate(s). Epistemic truth verification required before conflict analysis.`,
          });
        } else {
          sm.transitionTo('MEDICATIONS_CONFIRMED', { actor });
        }

        this.workflowRepo.update(context);
        return context;
      }

      // ----------------------------------------------------
      // STATE: AWAITING_MEDICATION_CONFIRMATION
      // ----------------------------------------------------
      case 'AWAITING_MEDICATION_CONFIRMATION': {
        const remainingUnverified = context.unverifiedMedicationCandidates.filter(
          (c) => c.status === 'unverified'
        );

        if (remainingUnverified.length > 0) {
          // Cannot proceed: unverified candidates exist
          return context;
        }

        // All confirmed! Transition to MEDICATIONS_CONFIRMED
        sm.transitionTo('MEDICATIONS_CONFIRMED', {
          actor,
          reason: 'All medication identities and doses explicitly verified as confirmed truth.',
        });
        this.workflowRepo.update(context);
        return context;
      }

      // ----------------------------------------------------
      // STATE: MEDICATIONS_CONFIRMED & CHECKING_INTERACTIONS
      // ----------------------------------------------------
      case 'MEDICATIONS_CONFIRMED':
      case 'CHECKING_INTERACTIONS': {
        const unverifiedCandidates = context.unverifiedMedicationCandidates.filter(
          (c) => c.status === 'unverified'
        );
        if (unverifiedCandidates.length > 0) {
          throw new WorkflowPrerequisiteError('CHECKING_INTERACTIONS', [
            `Cannot evaluate interactions: ${unverifiedCandidates.length} unverified medication candidate(s) exist. Candidate orders cannot be treated as confirmed ingredients without clinician verification.`,
          ]);
        }
        if (context.state === 'MEDICATIONS_CONFIRMED') {
          sm.transitionTo('CHECKING_INTERACTIONS', { actor });
        }
        return await this.executeInteractionCheck(context, sm, actor);
      }

      // ----------------------------------------------------
      // STATE: AWAITING_CLINICAL_REVIEW
      // ----------------------------------------------------
      case 'AWAITING_CLINICAL_REVIEW': {
        const pendingClinicalReviews = context.pendingHumanApprovals.filter(
          (r) =>
            r.status === 'pending' &&
            (r.category === 'potentially_significant_interaction' ||
              r.category === 'insufficient_clinical_evidence')
        );

        if (pendingClinicalReviews.length > 0) {
          // Cannot proceed until clinician assesses and resolves
          return context;
        }

        // All clinical reviews resolved: advance to PREPARING_SCHEDULE & execute schedule
        sm.transitionTo('PREPARING_SCHEDULE', {
          actor,
          reason: 'All clinical interaction reviews resolved by authorized clinician.',
        });
        return await this.executeSchedulePreparation(context, sm, actor);
      }

      // ----------------------------------------------------
      // STATE: PREPARING_SCHEDULE
      // ----------------------------------------------------
      case 'PREPARING_SCHEDULE': {
        return await this.executeSchedulePreparation(context, sm, actor);
      }

      // ----------------------------------------------------
      // STATE: AWAITING_SCHEDULE_REVIEW
      // ----------------------------------------------------
      case 'AWAITING_SCHEDULE_REVIEW': {
        const pendingScheduleReviews = context.pendingHumanApprovals.filter(
          (r) =>
            r.status === 'pending' &&
            (r.category === 'schedule_review' ||
              r.category === 'conflicting_scheduling_constraints')
        );

        if (pendingScheduleReviews.length > 0) {
          // Cannot complete until clinician explicitly approves
          return context;
        }

        // Check if schedule is approved in humanApprovedOutcomes
        if (!context.humanApprovedOutcomes?.scheduleApproved) {
          return context;
        }

        // All human signoffs satisfied: transition to COMPLETED
        sm.transitionTo('COMPLETED', {
          actor,
          reason: `All workflow operations and human clinical approvals completed successfully. Approved by ${context.humanApprovedOutcomes.approvedBy}.`,
        });

        this.workflowRepo.update(context);
        return context;
      }

      case 'BLOCKED': {
        const lastFailure = context.failedOperations[context.failedOperations.length - 1];
        if (lastFailure?.error?.code === 'EVIDENCE_PROVIDER_UNAVAILABLE') {
          // Attempt retry if evidence provider is available now
          const toolResult = await this.toolRegistry.executeTool(
            'get_interaction_evidence',
            { ingredientA: 'apixaban', ingredientB: 'naproxen' },
            {
              actor,
              actorRole: 'clinician',
              workflowId: context.workflowId,
              agentId: 'interaction_agent',
              dependencyVersions: context.datasetVersions,
            }
          );
          if (toolResult.success) {
            sm.transitionTo('CHECKING_INTERACTIONS', {
              actor,
              reason: 'Unblocking workflow: evidence provider restored to healthy status.',
              bypassPrerequisites: true,
            });
            return await this.executeInteractionCheck(context, sm, actor);
          }
        }
        return context;
      }

      case 'COMPLETED':
      case 'FAILED':
      case 'CANCELLED':
      default:
        return context;
    }
  }

  private async executeInteractionCheck(
    context: WorkflowContext,
    sm: AgenticWorkflowStateMachine,
    actor: string
  ): Promise<WorkflowContext> {
    // RULE 1: An unverified medication cannot be treated as a confirmed ingredient.
    const unverifiedCandidates = context.unverifiedMedicationCandidates.filter(
      (c) => c.status === 'unverified'
    );
    if (unverifiedCandidates.length > 0) {
      throw new WorkflowPrerequisiteError('CHECKING_INTERACTIONS', [
        `Cannot evaluate interactions: ${unverifiedCandidates.length} unverified medication candidate(s) exist. Candidate orders cannot be treated as confirmed ingredients without clinician verification.`,
      ]);
    }

    const interactionResult = await this.toolRegistry.executeTool(
      'check_interactions',
      { patientId: context.patientId },
      {
        actor,
        actorRole: 'clinician',
        workflowId: context.workflowId,
        agentId: 'interaction_agent',
        dependencyVersions: context.datasetVersions,
      }
    );

    // Check if evidence provider failed or is offline
    if (
      !interactionResult.success ||
      (interactionResult.data?.providerStatus && !interactionResult.data.providerStatus.isAvailable)
    ) {
      const errMsg = interactionResult.success
        ? interactionResult.data.providerStatus.warningNotice || 'Evidence provider is offline or degraded.'
        : interactionResult.error.message;
      const errCode = interactionResult.success
        ? 'EVIDENCE_PROVIDER_UNAVAILABLE'
        : interactionResult.error.code;

      const err: StructuredError = {
        code: errCode,
        message: errMsg,
        isRecoverable: true,
        timestamp: new Date().toISOString(),
      };
      this.feedbackEngine.recordOperation(context, {
        operationType: 'CHECK_INTERACTIONS',
        inputVersion: context.version,
        outputVersion: context.version,
        dependencies: context.confirmedMedicationRecordIds.map((id) => `medication:${id}`),
        executionStatus: 'failed',
        error: err,
      });

      // Block conclusions that depend on evidence!
      context.interactionFindings = [];
      context.derivedFindings = undefined;
      sm.blockWorkflow(
        `Interaction analysis failed or evidence provider unavailable: ${errMsg}`,
        'interaction_evidence_provider'
      );
      this.workflowRepo.update(context);
      return context;
    }

    const data = interactionResult.data;
    context.interactionFindings = data.findings;
    context.derivedFindings = {
      findings: data.findings,
      dataGaps: data.dataGaps,
      providerHealth: data.providerStatus,
    };

    this.dependencyGraph.recordArtifactNode(
      context,
      'interaction_findings',
      data.findings
    );

    const dependencies: string[] = [
      ...context.confirmedMedicationRecordIds.map((id) => `medication:${id}`),
      'lab:*',
      `dataset:interactions:${context.datasetVersions.interactions || '2026.1'}`,
    ];

    this.feedbackEngine.recordOperation(context, {
      operationType: 'CHECK_INTERACTIONS',
      inputVersion: context.version,
      outputVersion: context.version,
      dependencies,
      executionStatus: 'success',
    });

    // Determine if clinical review is required
    const severeFindings = data.findings.filter(
      (f: InteractionFinding) =>
        f.severity === 'contraindicated' || f.severity === 'major'
    );
    const dataGaps = data.dataGaps || [];

    if (severeFindings.length > 0 || dataGaps.length > 0) {
      for (const finding of severeFindings) {
        this.createReviewRequestIfNotExist(context, {
          category: 'potentially_significant_interaction',
          reason: `Severe Interaction: ${finding.medicationA.brand} & ${finding.medicationB.brand}. ${finding.clinicalImpact}`,
          supportingEvidenceReferences: [finding.sourceCitation],
          requestedReviewerAction: finding.managementRecommendation,
          targetEntityType: 'interaction',
          targetEntityId: finding.findingId,
          itemVersion: context.version,
        });
      }

      for (const gap of dataGaps) {
        this.createReviewRequestIfNotExist(context, {
          category: 'insufficient_clinical_evidence',
          reason: `Clinical Data Gap: ${gap.title}. ${gap.description}`,
          supportingEvidenceReferences: [],
          requestedReviewerAction: gap.suggestedAction,
          targetEntityType: 'evidence',
          targetEntityId: gap.gapType,
          itemVersion: context.version,
        });
      }

      sm.transitionTo('AWAITING_CLINICAL_REVIEW', {
        actor,
        reason: `Found ${severeFindings.length} severe interaction(s) and ${dataGaps.length} clinical data gap(s) requiring professional assessment.`,
      });
      this.workflowRepo.update(context);
      return context;
    }

    // No severe interaction blocking: can proceed to schedule preparation
    sm.transitionTo('PREPARING_SCHEDULE', { actor });
    return await this.executeSchedulePreparation(context, sm, actor);
  }

  private async executeSchedulePreparation(
    context: WorkflowContext,
    sm: AgenticWorkflowStateMachine,
    actor: string
  ): Promise<WorkflowContext> {
    const scheduleResult = await this.toolRegistry.executeTool(
      'evaluate_schedule_constraints',
      { patientId: context.patientId },
      {
        actor,
        actorRole: 'clinician',
        workflowId: context.workflowId,
        agentId: 'scheduling_agent',
        dependencyVersions: context.datasetVersions,
      }
    );

    if (!scheduleResult.success) {
      const err: StructuredError = {
        code: scheduleResult.error.code,
        message: scheduleResult.error.message,
        isRecoverable: true,
        timestamp: new Date().toISOString(),
      };
      this.feedbackEngine.recordOperation(context, {
        operationType: 'COORDINATE_SCHEDULE',
        inputVersion: context.version,
        outputVersion: context.version,
        dependencies: [`patient:${context.patientId}`],
        executionStatus: 'failed',
        error: err,
      });
      sm.failWorkflow(err);
      this.workflowRepo.update(context);
      return context;
    }

    const timetable = scheduleResult.data;
    context.proposedSchedules = {
      scheduleTimeline: timetable,
      conflicts: timetable.conflicts || [],
      generatedAt: new Date().toISOString(),
    };

    this.dependencyGraph.recordArtifactNode(
      context,
      'scheduling_constraints',
      timetable.conflicts || []
    );
    this.dependencyGraph.recordArtifactNode(
      context,
      'draft_schedule',
      timetable
    );

    const dependencies: string[] = [
      ...context.confirmedMedicationRecordIds.map((id) => `medication:${id}`),
      `routine:${context.patientId}`,
    ];

    this.feedbackEngine.recordOperation(context, {
      operationType: 'COORDINATE_SCHEDULE',
      inputVersion: context.version,
      outputVersion: context.version,
      dependencies,
      executionStatus: 'success',
    });

    // Preserve conflicts and create human review rather than inventing a solution!
    if (timetable.conflicts && timetable.conflicts.length > 0) {
      for (const conflict of timetable.conflicts) {
        const isMandatory =
          conflict.severity === 'urgent_prescriber_review' ||
          conflict.conflictType === 'impossible_constraint';
        this.createReviewRequestIfNotExist(context, {
          category: 'conflicting_scheduling_constraints',
          reason: `${isMandatory ? '[MANDATORY_CONSTRAINT] ' : ''}Circadian Timing Conflict: ${conflict.title}. ${conflict.description}`,
          supportingEvidenceReferences: [conflict.evidenceCitation],
          missingOrConflictingInfo: isMandatory
            ? 'Mandatory Constraint: Unresolved conflict blocks schedule draft approval until resolved.'
            : conflict.warning,
          requestedReviewerAction: conflict.recommendedAction,
          targetEntityType: 'schedule',
          targetEntityId: conflict.id,
          targetArtifactType: 'draft_schedule',
          targetArtifactVersion: context.version,
          itemVersion: context.version,
        });
      }
    }

    // Schedule always requires human signoff
    this.createReviewRequestIfNotExist(context, {
      category: 'schedule_review',
      reason:
        '24-hour diurnal medication schedule generated; requires clinical pharmacist signoff prior to administration.',
      supportingEvidenceReferences: [],
      requestedReviewerAction:
        'Review and approve proposed diurnal administration schedule.',
      targetEntityType: 'schedule',
      targetEntityId: 'chrono-schedule',
      itemVersion: context.version,
    });

    sm.transitionTo('AWAITING_SCHEDULE_REVIEW', {
      actor,
      reason: `Diurnal schedule coordinated across ${timetable.slots.length} time slots. Preserved ${timetable.conflicts.length} conflict(s) for clinical review.`,
    });

    this.workflowRepo.update(context);
    return context;
  }

  // ==========================================
  // 3. HUMAN-IN-THE-LOOP ACTIONS
  // ==========================================

  public async confirmMedicationCandidate(
    workflowId: string,
    candidateId: string,
    actor: string,
    justification: string
  ): Promise<WorkflowContext> {
    const context = this.workflowRepo.findById(workflowId);
    if (!context) {
      throw new Error(`Workflow "${workflowId}" not found.`);
    }

    const candidate = context.unverifiedMedicationCandidates.find(
      (c) => c.id === candidateId
    );
    if (!candidate) {
      throw new Error(`Candidate medication "${candidateId}" not found in workflow.`);
    }

    // Mark candidate confirmed
    candidate.status = 'confirmed';
    candidate.verificationSource = `Confirmed by ${actor}: ${justification}`;

    if (!context.confirmedMedicationRecordIds.includes(candidate.id)) {
      context.confirmedMedicationRecordIds.push(candidate.id);
    }

    // Resolve corresponding review request if present
    const matchingReview = context.pendingHumanApprovals.find(
      (r) =>
        r.targetEntityType === 'ocr_candidate' &&
        r.targetEntityId === candidateId &&
        r.status === 'pending'
    );
    if (matchingReview) {
      this.reviewService.resolveRequest(
        matchingReview.id,
        {
          status: 'approved',
          reviewerIdentity: actor,
          reviewerNotes: justification,
          targetVersion: matchingReview.itemVersion,
        },
        matchingReview.itemVersion
      );
      matchingReview.status = 'approved';
      matchingReview.reviewerIdentity = actor;
    }

    // If database medication exists with this ID, update verificationStatus
    const dbMed = this.medRepo.findById(candidateId);
    if (dbMed && dbMed.verificationStatus !== 'confirmed') {
      this.medRepo.updateVerificationStatus(candidateId, 'confirmed');
      if (this.auditService) {
        this.auditService.logUpdate(
          context.patientId,
          'medication',
          candidateId,
          actor,
          `Medication confirmed: ${dbMed.brand}. ${justification}`,
          { verificationStatus: dbMed.verificationStatus },
          { verificationStatus: 'confirmed' }
        );
      }
    }

    this.workflowRepo.update(context);
    return context;
  }

  public async resolveHumanReview(
    workflowId: string,
    reviewId: string,
    resolution: ReviewResolution
  ): Promise<WorkflowContext> {
    const context = this.workflowRepo.findById(workflowId);
    if (!context) {
      throw new Error(`Workflow "${workflowId}" not found.`);
    }

    const review = context.pendingHumanApprovals.find((r) => r.id === reviewId);
    if (!review) {
      throw new Error(`Review request "${reviewId}" not found in workflow.`);
    }

    // RULE 3: A schedule with unresolved mandatory constraints cannot be marked ready for approval.
    if (review.category === 'schedule_review' && resolution.status === 'approved') {
      const pendingMandatoryConstraints = context.pendingHumanApprovals.filter(
        (r) =>
          r.category === 'conflicting_scheduling_constraints' &&
          r.status === 'pending' &&
          (r.reason.startsWith('[MANDATORY_CONSTRAINT]') ||
            r.missingOrConflictingInfo?.includes('unresolved_mandatory_constraint'))
      );
      if (pendingMandatoryConstraints.length > 0) {
        throw new WorkflowPrerequisiteError('AWAITING_SCHEDULE_REVIEW', [
          `Cannot approve draft schedule: ${pendingMandatoryConstraints.length} mandatory scheduling constraint conflict(s) are unresolved. Conflicting constraints must be reviewed, resolved, or explicitly waived before schedule approval can be granted.`,
        ]);
      }
    }

    // Resolve via review service (checks version, human reviewer identity, and role permissions)
    const { request: updatedReq, approvalRecord } = this.reviewService.resolveRequest(
      reviewId,
      resolution,
      review.itemVersion
    );

    // Update in-memory context review
    review.status = resolution.status;
    review.reviewerIdentity = resolution.reviewerIdentity;
    review.reviewerRole = resolution.reviewerRole || 'clinical_pharmacist';
    review.reviewerNotes = resolution.reviewerNotes;
    review.resolvedAt = updatedReq.resolvedAt;

    if (!context.approvalRecords) {
      context.approvalRecords = [];
    }
    context.approvalRecords.push(approvalRecord);

    // If approving schedule_review, record humanApprovedOutcomes (Rule 6: separate from workflow completion)
    if (review.category === 'schedule_review' && resolution.status === 'approved') {
      context.humanApprovedOutcomes = {
        scheduleApproved: true,
        approvedBy: resolution.reviewerIdentity,
        approvedAt: new Date().toISOString(),
        approvedScheduleVersion: review.itemVersion,
        decisionRationale:
          resolution.reviewerNotes ||
          'Clinician approved diurnal schedule timetable.',
      };
    }

    // If resolving medication identity review:
    if (review.category === 'medication_identity_clarification') {
      if (resolution.status === 'approved') {
        const candidate = context.unverifiedMedicationCandidates.find(
          (c) => c.id === review.targetEntityId
        );
        if (candidate) {
          candidate.status = 'confirmed';
          candidate.verificationSource = `Confirmed by ${resolution.reviewerIdentity} (${resolution.reviewerRole || 'clinical_pharmacist'}): ${resolution.reviewerNotes || 'Approved'}`;
          if (!context.confirmedMedicationRecordIds.includes(candidate.id)) {
            context.confirmedMedicationRecordIds.push(candidate.id);
          }
        }
      } else if (resolution.status === 'rejected') {
        const candidate = context.unverifiedMedicationCandidates.find(
          (c) => c.id === review.targetEntityId
        );
        if (candidate) {
          candidate.status = 'rejected';
          candidate.rejectionReason =
            resolution.reviewerNotes || 'Rejected during clinical review';
        }
      }
    }

    this.dependencyGraph.recordArtifactNode(
      context,
      'human_approval',
      {
        reviewId,
        category: review.category,
        status: resolution.status,
        reviewerIdentity: resolution.reviewerIdentity,
        reviewerRole: resolution.reviewerRole || 'clinical_pharmacist',
        approvalId: approvalRecord.approvalId,
        resolvedAt: review.resolvedAt,
      }
    );

    this.workflowRepo.update(context);
    return context;
  }

  // ==========================================
  // 4. FEEDBACK LOOPS & INVALIDATION
  // ==========================================

  public async correctMedication(
    workflowId: string,
    medicationId: string,
    actor: string,
    justification: string
  ): Promise<WorkflowContext> {
    const context = this.workflowRepo.findById(workflowId);
    if (!context) {
      throw new Error(`Workflow "${workflowId}" not found.`);
    }

    // Trigger feedback invalidation
    this.feedbackEngine.invalidateOnMedicationCorrection(
      context,
      medicationId,
      justification
    );

    // Transition back to MEDICATIONS_CONFIRMED or CHECKING_INTERACTIONS
    const sm = new AgenticWorkflowStateMachine(context, this.auditService);
    if (
      [
        'COMPLETED',
        'AWAITING_SCHEDULE_REVIEW',
        'PREPARING_SCHEDULE',
        'AWAITING_CLINICAL_REVIEW',
        'CHECKING_INTERACTIONS',
      ].includes(context.state)
    ) {
      sm.transitionTo('MEDICATIONS_CONFIRMED', {
        actor,
        reason: `Medication "${medicationId}" corrected. Invalidated dependent interaction findings and draft schedule.`,
      });
    }

    this.workflowRepo.update(context);
    return context;
  }

  public async recordNewLabData(
    workflowId: string,
    testName: string,
    actor: string
  ): Promise<WorkflowContext> {
    const context = this.workflowRepo.findById(workflowId);
    if (!context) {
      throw new Error(`Workflow "${workflowId}" not found.`);
    }

    this.feedbackEngine.invalidateOnLabMeasurementChange(
      context,
      testName,
      `New laboratory data entered for "${testName}"`
    );

    const sm = new AgenticWorkflowStateMachine(context, this.auditService);
    if (
      [
        'COMPLETED',
        'AWAITING_SCHEDULE_REVIEW',
        'PREPARING_SCHEDULE',
        'AWAITING_CLINICAL_REVIEW',
      ].includes(context.state)
    ) {
      sm.transitionTo('CHECKING_INTERACTIONS', {
        actor,
        reason: `Re-evaluating interaction profile due to new lab measurement: ${testName}.`,
      });
    }

    this.workflowRepo.update(context);
    return context;
  }

  // ==========================================
  // 5. HELPER METHODS
  // ==========================================

  private createMedicationReviewRequests(context: WorkflowContext): void {
    const unverified = context.unverifiedMedicationCandidates.filter(
      (c) => c.status === 'unverified'
    );

    for (const cand of unverified) {
      this.createReviewRequestIfNotExist(context, {
        category: 'medication_identity_clarification',
        reason: `Uncertain medication order: ${cand.brand || cand.rawText}. Prescribed dose: ${cand.dose || 'unspecified'}.`,
        supportingEvidenceReferences: [],
        missingOrConflictingInfo: `Confidence score: ${cand.confidence}. Requires verification against clinical chart.`,
        requestedReviewerAction: 'Verify medication brand, generic entity, and prescribed dose.',
        targetEntityType: 'ocr_candidate',
        targetEntityId: cand.id,
        targetArtifactType: 'confirmed_medications',
        targetArtifactVersion: context.version,
        itemVersion: context.version,
      });
    }
  }

  private createReviewRequestIfNotExist(
    context: WorkflowContext,
    params: {
      category: ReviewCategory;
      reason: string;
      supportingEvidenceReferences: string[];
      missingOrConflictingInfo?: string;
      requestedReviewerAction: string;
      targetEntityType: 'medication' | 'schedule' | 'interaction' | 'ocr_candidate' | 'evidence' | 'constraint';
      targetEntityId: string;
      targetArtifactType?: WorkflowArtifactType;
      targetArtifactVersion?: number;
      itemVersion: number;
    }
  ): void {
    const exists = context.pendingHumanApprovals.some(
      (r) =>
        r.targetEntityType === params.targetEntityType &&
        r.targetEntityId === params.targetEntityId &&
        r.status === 'pending'
    );

    if (!exists) {
      const review = this.reviewService.createRequest({
        workflowId: context.workflowId,
        ...params,
      });
      context.pendingHumanApprovals.push(review);
    }
  }
}
