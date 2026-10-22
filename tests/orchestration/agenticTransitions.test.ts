import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { initializeSchema } from '../../src/server/db/database.js';
import { AgenticWorkflowStateMachine } from '../../src/server/services/orchestration/stateMachine/workflowStateMachine.js';
import {
  InvalidWorkflowTransitionError,
  WorkflowPrerequisiteError,
} from '../../src/server/services/orchestration/stateMachine/errors.js';
import { isValidTransition } from '../../src/server/services/orchestration/stateMachine/transitions.js';
import type { WorkflowContext } from '../../src/shared/orchestrationTypes.js';

describe('Capability 1: State Machine & Transition Rules (Independent of LLM)', () => {
  let context: WorkflowContext;

  beforeEach(() => {
    context = {
      workflowId: 'wf-test-transitions',
      patientId: 'p2222222-2222-2222-2222-222222222222',
      state: 'CREATED',
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
      proposedSchedules: {
        scheduleTimeline: { slots: [] },
        conflicts: [],
        generatedAt: new Date().toISOString(),
      },
    };
  });

  describe('1. Valid State Transitions', () => {
    it('allows valid sequential pipeline progression', () => {
      const sm = new AgenticWorkflowStateMachine(context);

      expect(sm.getState()).toBe('CREATED');

      sm.transitionTo('RETRIEVING_PATIENT_CONTEXT');
      expect(sm.getState()).toBe('RETRIEVING_PATIENT_CONTEXT');

      sm.transitionTo('MEDICATIONS_CONFIRMED');
      expect(sm.getState()).toBe('MEDICATIONS_CONFIRMED');

      sm.transitionTo('CHECKING_INTERACTIONS');
      expect(sm.getState()).toBe('CHECKING_INTERACTIONS');

      sm.transitionTo('AWAITING_CLINICAL_REVIEW');
      expect(sm.getState()).toBe('AWAITING_CLINICAL_REVIEW');

      sm.transitionTo('PREPARING_SCHEDULE');
      expect(sm.getState()).toBe('PREPARING_SCHEDULE');

      sm.transitionTo('AWAITING_SCHEDULE_REVIEW');
      expect(sm.getState()).toBe('AWAITING_SCHEDULE_REVIEW');

      sm.transitionTo('COMPLETED');
      expect(sm.getState()).toBe('COMPLETED');
    });

    it('allows transition to BLOCKED and unblocking to an allowed recovery state', () => {
      const sm = new AgenticWorkflowStateMachine(context);

      sm.transitionTo('RETRIEVING_PATIENT_CONTEXT');
      sm.blockWorkflow('External database timeout', 'clinical_database');
      expect(sm.getState()).toBe('BLOCKED');

      sm.transitionTo('RETRIEVING_PATIENT_CONTEXT', { reason: 'Database reconnected' });
      expect(sm.getState()).toBe('RETRIEVING_PATIENT_CONTEXT');
    });

    it('allows cancelling a workflow from active states', () => {
      const sm = new AgenticWorkflowStateMachine(context);
      sm.transitionTo('RETRIEVING_PATIENT_CONTEXT');
      sm.cancelWorkflow('Patient transferred to ICU', 'Dr. OnCall');
      expect(sm.getState()).toBe('CANCELLED');
    });
  });

  describe('2. Invalid State Transitions (Rejections)', () => {
    it('strictly rejects jumping from CREATED to CHECKING_INTERACTIONS', () => {
      const sm = new AgenticWorkflowStateMachine(context);

      expect(() => {
        sm.transitionTo('CHECKING_INTERACTIONS');
      }).toThrow(InvalidWorkflowTransitionError);

      expect(sm.getState()).toBe('CREATED');
    });

    it('strictly rejects jumping from CREATED to COMPLETED', () => {
      const sm = new AgenticWorkflowStateMachine(context);

      expect(() => {
        sm.transitionTo('COMPLETED');
      }).toThrow(InvalidWorkflowTransitionError);
    });

    it('strictly rejects transitioning out of terminal CANCELLED state', () => {
      const sm = new AgenticWorkflowStateMachine(context);
      sm.cancelWorkflow('Cancelled order', 'Dr. Smith');
      expect(sm.getState()).toBe('CANCELLED');

      expect(() => {
        sm.transitionTo('RETRIEVING_PATIENT_CONTEXT');
      }).toThrow(InvalidWorkflowTransitionError);

      expect(() => {
        sm.transitionTo('COMPLETED');
      }).toThrow(InvalidWorkflowTransitionError);
    });

    it('strictly rejects jumping from AWAITING_MEDICATION_CONFIRMATION directly to PREPARING_SCHEDULE', () => {
      context.state = 'AWAITING_MEDICATION_CONFIRMATION';
      const sm = new AgenticWorkflowStateMachine(context);

      expect(() => {
        sm.transitionTo('PREPARING_SCHEDULE');
      }).toThrow(InvalidWorkflowTransitionError);
    });

    it('isValidTransition correctly classifies permitted and prohibited transitions', () => {
      expect(isValidTransition('CREATED', 'RETRIEVING_PATIENT_CONTEXT')).toBe(true);
      expect(isValidTransition('CREATED', 'CHECKING_INTERACTIONS')).toBe(false);
      expect(isValidTransition('EXTRACTING_PRESCRIPTION', 'AWAITING_MEDICATION_CONFIRMATION')).toBe(true);
      expect(isValidTransition('EXTRACTING_PRESCRIPTION', 'COMPLETED')).toBe(false);
      expect(isValidTransition('CHECKING_INTERACTIONS', 'AWAITING_CLINICAL_REVIEW')).toBe(true);
      expect(isValidTransition('CANCELLED', 'CREATED')).toBe(false);
    });
  });

  describe('3. Prerequisite Enforcement', () => {
    it('blocks transition to CHECKING_INTERACTIONS when unverified candidates exist', () => {
      context.state = 'MEDICATIONS_CONFIRMED';
      context.unverifiedMedicationCandidates = [
        {
          id: 'cand-unverified-1',
          rawText: 'Atorvastatin 40mg',
          brand: 'Lipitor',
          confidence: 0.6,
          status: 'unverified',
        },
      ];

      const sm = new AgenticWorkflowStateMachine(context);

      expect(() => {
        sm.transitionTo('CHECKING_INTERACTIONS');
      }).toThrow(WorkflowPrerequisiteError);
    });

    it('blocks transition to COMPLETED when human reviews are still pending', () => {
      context.state = 'AWAITING_SCHEDULE_REVIEW';
      context.pendingHumanApprovals = [
        {
          id: 'rev-pending-1',
          workflowId: context.workflowId,
          category: 'schedule_review',
          reason: 'Review required',
          supportingEvidenceReferences: [],
          requestedReviewerAction: 'Sign off',
          status: 'pending',
          itemVersion: 1,
          targetEntityType: 'schedule',
          targetEntityId: 'chrono-schedule',
          createdAt: new Date().toISOString(),
        },
      ];

      const sm = new AgenticWorkflowStateMachine(context);

      expect(() => {
        sm.transitionTo('COMPLETED');
      }).toThrow(WorkflowPrerequisiteError);
    });
  });
});
