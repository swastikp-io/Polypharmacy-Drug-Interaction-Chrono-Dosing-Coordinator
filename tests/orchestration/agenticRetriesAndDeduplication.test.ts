import { describe, it, expect, beforeEach } from 'vitest';
import { FeedbackEngine, MAX_OPERATION_RETRIES } from '../../src/server/services/orchestration/feedbackEngine.js';
import type { WorkflowContext } from '../../src/shared/orchestrationTypes.js';

describe('Capability 4: Retry Limits & Duplicate Operation Prevention', () => {
  let feedbackEngine: FeedbackEngine;
  let context: WorkflowContext;

  beforeEach(() => {
    feedbackEngine = new FeedbackEngine();
    context = {
      workflowId: 'wf-test-retries',
      patientId: 'p2222222-2222-2222-2222-222222222222',
      state: 'CHECKING_INTERACTIONS',
      version: 1,
      confirmedMedicationRecordIds: ['med-1', 'med-2'],
      unverifiedMedicationCandidates: [],
      prescriptionSourceReferences: [],
      interactionFindings: [],
      evidenceReferences: [],
      schedulingConstraints: [],
      outstandingQuestions: [],
      pendingHumanApprovals: [],
      completedOperations: [],
      failedOperations: [],
      datasetVersions: { rxnorm: '2026.1' },
      workflowVersion: '2026.1-Agentic-Phase1',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  });

  describe('9. Retry Limits & Duplicate Prevention', () => {
    it('detects duplicate operations when inputs, dependencies, and versions have not changed', () => {
      const dependencies = ['medication:med-1', 'medication:med-2'];

      // Initially no duplicate
      expect(
        feedbackEngine.isDuplicateOperation(context, 'CHECK_INTERACTIONS', dependencies, 1)
      ).toBe(false);

      // Record successful operation
      feedbackEngine.recordOperation(context, {
        operationType: 'CHECK_INTERACTIONS',
        inputVersion: 1,
        outputVersion: 1,
        dependencies,
        executionStatus: 'success',
      });

      // Now detects duplicate!
      expect(
        feedbackEngine.isDuplicateOperation(context, 'CHECK_INTERACTIONS', dependencies, 1)
      ).toBe(true);

      // If dependencies change, not a duplicate
      expect(
        feedbackEngine.isDuplicateOperation(
          context,
          'CHECK_INTERACTIONS',
          ['medication:med-1', 'medication:med-3'],
          1
        )
      ).toBe(false);

      // If input version changes, not a duplicate
      expect(
        feedbackEngine.isDuplicateOperation(context, 'CHECK_INTERACTIONS', dependencies, 2)
      ).toBe(false);
    });

    it('permits retries for recoverable errors up to MAX_OPERATION_RETRIES, then blocks further retries', () => {
      const opType = 'CHECK_INTERACTIONS';

      // 0 failures -> can retry
      expect(feedbackEngine.canRetryOperation(context, opType).canRetry).toBe(true);

      // 1st failure (recoverable)
      feedbackEngine.recordOperation(context, {
        operationType: opType,
        inputVersion: 1,
        outputVersion: 1,
        dependencies: ['med:1'],
        executionStatus: 'failed',
        error: {
          code: 'TIMEOUT',
          message: 'Network socket timeout',
          isRecoverable: true,
          timestamp: new Date().toISOString(),
        },
      });

      expect(feedbackEngine.canRetryOperation(context, opType).canRetry).toBe(true);
      expect(feedbackEngine.canRetryOperation(context, opType).retryCount).toBe(1);

      // 2nd failure
      feedbackEngine.recordOperation(context, {
        operationType: opType,
        inputVersion: 1,
        outputVersion: 1,
        dependencies: ['med:1'],
        executionStatus: 'failed',
        error: {
          code: 'TIMEOUT',
          message: 'Network socket timeout',
          isRecoverable: true,
          timestamp: new Date().toISOString(),
        },
      });

      expect(feedbackEngine.canRetryOperation(context, opType).canRetry).toBe(true);
      expect(feedbackEngine.canRetryOperation(context, opType).retryCount).toBe(2);

      // 3rd failure (hits limit)
      feedbackEngine.recordOperation(context, {
        operationType: opType,
        inputVersion: 1,
        outputVersion: 1,
        dependencies: ['med:1'],
        executionStatus: 'failed',
        error: {
          code: 'TIMEOUT',
          message: 'Network socket timeout',
          isRecoverable: true,
          timestamp: new Date().toISOString(),
        },
      });

      const retryCheck = feedbackEngine.canRetryOperation(context, opType);
      expect(retryCheck.canRetry).toBe(false);
      expect(retryCheck.retryCount).toBe(MAX_OPERATION_RETRIES);
      expect(retryCheck.reason).toContain('Maximum retry limit');
    });

    it('immediately blocks retry if error is classified as non-recoverable', () => {
      const opType = 'PARSE_PRESCRIPTION';

      feedbackEngine.recordOperation(context, {
        operationType: opType,
        inputVersion: 1,
        outputVersion: 1,
        dependencies: ['doc:1'],
        executionStatus: 'failed',
        error: {
          code: 'CORRUPTED_FILE',
          message: 'Document format invalid or unreadable',
          isRecoverable: false, // Non-recoverable!
          timestamp: new Date().toISOString(),
        },
      });

      const retryCheck = feedbackEngine.canRetryOperation(context, opType);
      expect(retryCheck.canRetry).toBe(false);
      expect(retryCheck.reason).toContain('non-recoverable error');
    });
  });
});
