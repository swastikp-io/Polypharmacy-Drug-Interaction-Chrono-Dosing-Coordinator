import { randomUUID } from 'crypto';
import type {
  DEFAULT_RETRY_POLICY,
  OperationRecord,
  RetryPolicy,
  StructuredError,
  WorkflowArtifactType,
  WorkflowContext,
} from '../../../shared/orchestrationTypes.js';
import type { ReviewRequestService } from './reviewRequestService.js';
import type { AuditService } from '../auditService.js';
import { ArtifactDependencyGraph } from './dependencyGraph.js';

export const MAX_OPERATION_RETRIES = 3;

export interface InvalidationResult {
  invalidatedOperations: string[];
  invalidatedFindingsCount: number;
  scheduleInvalidated: boolean;
  reason: string;
  staleArtifacts?: WorkflowArtifactType[];
}

export class FeedbackEngine {
  private dependencyGraph: ArtifactDependencyGraph;

  constructor(
    private reviewService?: ReviewRequestService,
    private auditService?: AuditService,
    dependencyGraph?: ArtifactDependencyGraph,
    private retryPolicy: RetryPolicy = {
      maxRetries: MAX_OPERATION_RETRIES,
      initialBackoffMs: 100,
      backoffMultiplier: 2,
      maxBackoffMs: 1000,
    }
  ) {
    this.dependencyGraph = dependencyGraph || new ArtifactDependencyGraph();
  }

  public getDependencyGraph(): ArtifactDependencyGraph {
    return this.dependencyGraph;
  }

  public getRetryPolicy(): RetryPolicy {
    return this.retryPolicy;
  }

  /**
   * Record operation execution in workflow context with input/output version and dependencies
   */
  public recordOperation(
    context: WorkflowContext,
    operation: {
      operationType: string;
      inputVersion: number;
      outputVersion: number;
      dependencies: string[];
      executionStatus: 'success' | 'failed' | 'invalidated';
      error?: StructuredError;
    }
  ): OperationRecord {
    // Find prior attempts of this operation to compute retryCount
    const priorAttempts = context.completedOperations
      .concat(context.failedOperations)
      .filter((o) => o.operationType === operation.operationType);

    const record: OperationRecord = {
      operationId: `op-${randomUUID()}`,
      operationType: operation.operationType,
      inputVersion: operation.inputVersion,
      outputVersion: operation.outputVersion,
      dependencies: [...operation.dependencies],
      executionStatus: operation.executionStatus,
      executedAt: new Date().toISOString(),
      retryCount: priorAttempts.length,
      error: operation.error,
    };

    if (operation.executionStatus === 'success') {
      context.completedOperations.push(record);
    } else {
      context.failedOperations.push(record);
    }

    return record;
  }

  /**
   * Deduplication check: prevent running identical operation when dependencies and input version have not changed
   */
  public isDuplicateOperation(
    context: WorkflowContext,
    operationType: string,
    dependencies: string[],
    inputVersion: number
  ): boolean {
    const sortedDeps = [...dependencies].sort().join('|');

    return context.completedOperations.some((op) => {
      if (op.operationType !== operationType) return false;
      if (op.executionStatus !== 'success') return false;
      if (op.inputVersion !== inputVersion) return false;

      const opDeps = [...op.dependencies].sort().join('|');
      return opDeps === sortedDeps;
    });
  }

  /**
   * Retry limit verification and exponential backoff computation
   */
  public canRetryOperation(
    context: WorkflowContext,
    operationType: string
  ): { canRetry: boolean; retryCount: number; reason?: string; backoffMs?: number } {
    const priorFailures = context.failedOperations.filter(
      (o) => o.operationType === operationType
    );
    const retryCount = priorFailures.length;

    // Check if the most recent failure was classified as non-recoverable
    const lastFailure = priorFailures[priorFailures.length - 1];
    if (lastFailure?.error && !lastFailure.error.isRecoverable) {
      return {
        canRetry: false,
        retryCount,
        reason: `Operation "${operationType}" failed with non-recoverable error [${lastFailure.error.code}]: ${lastFailure.error.message}`,
      };
    }

    if (retryCount >= this.retryPolicy.maxRetries) {
      return {
        canRetry: false,
        retryCount,
        reason: `Maximum retry limit (${this.retryPolicy.maxRetries}) exceeded for operation "${operationType}".`,
      };
    }

    const backoffMs = Math.min(
      this.retryPolicy.initialBackoffMs *
        Math.pow(this.retryPolicy.backoffMultiplier, Math.max(0, retryCount - 1)),
      this.retryPolicy.maxBackoffMs
    );

    return { canRetry: true, retryCount, backoffMs };
  }

  /**
   * Controlled re-evaluation: Medication identity/dose correction
   * Invalidates dependent interaction results, draft schedule, and marks downstream artifact graph nodes stale.
   */
  public invalidateOnMedicationCorrection(
    context: WorkflowContext,
    medicationId: string,
    reason: string
  ): InvalidationResult {
    const medDep = `medication:${medicationId}`;
    const invalidatedOps: string[] = [];

    // 1. Invalidate dependent operations in execution ledger
    for (const op of context.completedOperations) {
      if (op.dependencies.includes(medDep) || op.operationType === 'COORDINATE_SCHEDULE') {
        op.executionStatus = 'invalidated';
        invalidatedOps.push(op.operationId);
      }
    }

    // 2. Mark dependent nodes in the artifact dependency graph stale & preserve historical outputs
    const { staleArtifacts } = this.dependencyGraph.markArtifactStale(
      context,
      'confirmed_medications',
      `Medication "${medicationId}" corrected: ${reason}`
    );

    // 3. Invalidate findings involving this medication
    const priorFindingCount = context.interactionFindings.length;
    context.interactionFindings = [];
    context.derivedFindings = undefined;

    // 4. Invalidate proposed schedule
    const scheduleInvalidated = !!context.proposedSchedules;
    context.proposedSchedules = undefined;

    // 5. Invalidate human approved outcomes for schedule
    if (context.humanApprovedOutcomes?.scheduleApproved) {
      context.humanApprovedOutcomes.scheduleApproved = false;
      context.humanApprovedOutcomes.decisionRationale = `Schedule approval invalidated: underlying medication "${medicationId}" was corrected. (${reason})`;
    }

    // Invalidate in-context approval records
    if (context.approvalRecords) {
      for (const rec of context.approvalRecords) {
        if (
          rec.targetEntityType === 'schedule' ||
          rec.targetEntityId === medicationId ||
          rec.targetArtifactType === 'draft_schedule' ||
          rec.targetArtifactType === 'interaction_findings'
        ) {
          (rec as any).validUntilStale = false;
          (rec as any).supersededBy = `Medication "${medicationId}" corrected: ${reason}`;
        }
      }
    }

    // 6. Invalidate review requests for schedule or this medication
    if (this.reviewService) {
      this.reviewService.invalidateApprovalsForEntity(
        context.workflowId,
        'schedule',
        'chrono-schedule',
        `Medication "${medicationId}" corrected: ${reason}`
      );
      this.reviewService.invalidateApprovalsForEntity(
        context.workflowId,
        'medication',
        medicationId,
        `Medication identity/order modified: ${reason}`
      );
      this.reviewService.invalidateApprovalsForArtifact(
        context.workflowId,
        'draft_schedule',
        `Medication "${medicationId}" corrected: ${reason}`
      );
      this.reviewService.invalidateApprovalsForArtifact(
        context.workflowId,
        'interaction_findings',
        `Medication "${medicationId}" corrected: ${reason}`
      );
    }

    if (this.auditService) {
      this.auditService.logEvent({
        patientId: context.patientId,
        entityType: 'workflow_context',
        entityId: context.workflowId,
        action: 'FEEDBACK_INVALIDATION_MEDICATION_CHANGE',
        actor: 'FeedbackEngine',
        summary: `Invalidated ${invalidatedOps.length} operations and ${priorFindingCount} findings due to change in medication "${medicationId}".`,
        changedFields: {
          invalidatedMedication: medicationId,
          reason,
          invalidatedOperations: invalidatedOps,
          staleArtifacts,
        },
      });
    }

    return {
      invalidatedOperations: invalidatedOps,
      invalidatedFindingsCount: priorFindingCount,
      scheduleInvalidated,
      reason,
      staleArtifacts,
    };
  }

  /**
   * Controlled re-evaluation: New laboratory data entered
   * Invalidates findings that explicitly depend on that measurement.
   */
  public invalidateOnLabMeasurementChange(
    context: WorkflowContext,
    testName: string,
    reason: string
  ): InvalidationResult {
    const labDep = `lab:${testName}`;
    const genericLabDep = 'lab:*';
    const invalidatedOps: string[] = [];

    // Invalidate operations that evaluated this lab
    for (const op of context.completedOperations) {
      if (
        op.dependencies.includes(labDep) ||
        op.dependencies.includes(genericLabDep) ||
        op.operationType === 'CHECK_INTERACTIONS'
      ) {
        op.executionStatus = 'invalidated';
        invalidatedOps.push(op.operationId);
      }
    }

    // Mark interaction findings in dependency graph as stale
    const { staleArtifacts } = this.dependencyGraph.markArtifactStale(
      context,
      'interaction_findings',
      `New laboratory data for "${testName}": ${reason}`
    );

    // Filter out data gaps or findings specific to this lab measurement
    let invalidatedCount = 0;
    if (context.derivedFindings?.dataGaps) {
      const remainingGaps = context.derivedFindings.dataGaps.filter((gap) => {
        const matches =
          gap.description.toLowerCase().includes(testName.toLowerCase()) ||
          gap.title.toLowerCase().includes(testName.toLowerCase());
        if (matches) invalidatedCount++;
        return !matches;
      });
      context.derivedFindings.dataGaps = remainingGaps;
    }

    // Invalidate interaction findings that depend on renal/hepatic clearance
    const priorFindingCount = context.interactionFindings.length;
    context.interactionFindings = [];
    context.derivedFindings = undefined;

    // Invalidate in-context approvals for findings and draft schedule
    if (context.approvalRecords) {
      for (const rec of context.approvalRecords) {
        if (
          rec.targetArtifactType === 'interaction_findings' ||
          rec.targetArtifactType === 'draft_schedule' ||
          rec.category === 'potentially_significant_interaction' ||
          rec.category === 'schedule_review'
        ) {
          (rec as any).validUntilStale = false;
          (rec as any).supersededBy = `Lab measurement "${testName}" updated: ${reason}`;
        }
      }
    }

    if (this.reviewService) {
      this.reviewService.invalidateApprovalsForArtifact(
        context.workflowId,
        'interaction_findings',
        `Lab measurement "${testName}" updated: ${reason}`
      );
      this.reviewService.invalidateApprovalsForArtifact(
        context.workflowId,
        'draft_schedule',
        `Lab measurement "${testName}" updated: ${reason}`
      );
    }

    if (this.auditService) {
      this.auditService.logEvent({
        patientId: context.patientId,
        entityType: 'workflow_context',
        entityId: context.workflowId,
        action: 'FEEDBACK_INVALIDATION_LAB_CHANGE',
        actor: 'FeedbackEngine',
        summary: `Invalidated interaction analysis due to new lab measurement for "${testName}".`,
        changedFields: {
          testName,
          reason,
          invalidatedOperations: invalidatedOps,
          staleArtifacts,
        },
      });
    }

    return {
      invalidatedOperations: invalidatedOps,
      invalidatedFindingsCount: priorFindingCount,
      scheduleInvalidated: false,
      reason,
      staleArtifacts,
    };
  }

  /**
   * Controlled re-evaluation: Clinical reference dataset changes
   * Identifies which findings were calculated using the old dataset and invalidates them.
   */
  public invalidateOnReferenceDatasetChange(
    context: WorkflowContext,
    newDatasetVersions: Record<string, string>
  ): InvalidationResult {
    const invalidatedOps: string[] = [];
    let invalidatedCount = 0;

    for (const [datasetName, newVersion] of Object.entries(newDatasetVersions)) {
      const currentVersion = context.datasetVersions[datasetName];
      if (currentVersion && currentVersion !== newVersion) {
        const oldDep = `dataset:${datasetName}:${currentVersion}`;

        for (const op of context.completedOperations) {
          if (op.dependencies.includes(oldDep)) {
            op.executionStatus = 'invalidated';
            invalidatedOps.push(op.operationId);
          }
        }

        context.interactionFindings = [];
        context.derivedFindings = undefined;
        invalidatedCount++;

        // Update dataset version in context
        context.datasetVersions[datasetName] = newVersion;
      }
    }

    const { staleArtifacts } = this.dependencyGraph.markArtifactStale(
      context,
      'interaction_findings',
      'Reference dataset version updated'
    );

    return {
      invalidatedOperations: invalidatedOps,
      invalidatedFindingsCount: invalidatedCount,
      scheduleInvalidated: false,
      reason: 'Reference dataset version updated',
      staleArtifacts,
    };
  }
}
