import type {
  AgenticWorkflowState,
  WorkflowContext,
} from '../../../../shared/orchestrationTypes.js';
import {
  InvalidWorkflowTransitionError,
  WorkflowPrerequisiteError,
} from './errors.js';

export const VALID_AGENTIC_TRANSITIONS: Record<
  AgenticWorkflowState,
  readonly AgenticWorkflowState[]
> = {
  CREATED: ['RETRIEVING_PATIENT_CONTEXT', 'BLOCKED', 'FAILED', 'CANCELLED'],

  RETRIEVING_PATIENT_CONTEXT: [
    'AWAITING_PRESCRIPTION',
    'EXTRACTING_PRESCRIPTION',
    'AWAITING_MEDICATION_CONFIRMATION',
    'MEDICATIONS_CONFIRMED',
    'BLOCKED',
    'FAILED',
    'CANCELLED',
  ],

  AWAITING_PRESCRIPTION: [
    'EXTRACTING_PRESCRIPTION',
    'BLOCKED',
    'FAILED',
    'CANCELLED',
  ],

  EXTRACTING_PRESCRIPTION: [
    'AWAITING_MEDICATION_CONFIRMATION',
    'MEDICATIONS_CONFIRMED',
    'BLOCKED',
    'FAILED',
    'CANCELLED',
  ],

  AWAITING_MEDICATION_CONFIRMATION: [
    'MEDICATIONS_CONFIRMED',
    'BLOCKED',
    'FAILED',
    'CANCELLED',
  ],

  MEDICATIONS_CONFIRMED: [
    'CHECKING_INTERACTIONS',
    'AWAITING_MEDICATION_CONFIRMATION', // Feedback loop: if user marks an item unverified
    'BLOCKED',
    'FAILED',
    'CANCELLED',
  ],

  CHECKING_INTERACTIONS: [
    'AWAITING_CLINICAL_REVIEW',
    'PREPARING_SCHEDULE',
    'MEDICATIONS_CONFIRMED', // Feedback loop
    'BLOCKED',
    'FAILED',
    'CANCELLED',
  ],

  AWAITING_CLINICAL_REVIEW: [
    'PREPARING_SCHEDULE',
    'CHECKING_INTERACTIONS', // Re-evaluation after review
    'MEDICATIONS_CONFIRMED', // Regimen adjusted during review
    'BLOCKED',
    'FAILED',
    'CANCELLED',
  ],

  PREPARING_SCHEDULE: [
    'AWAITING_SCHEDULE_REVIEW',
    'COMPLETED',
    'CHECKING_INTERACTIONS', // Feedback loop
    'BLOCKED',
    'FAILED',
    'CANCELLED',
  ],

  AWAITING_SCHEDULE_REVIEW: [
    'COMPLETED',
    'PREPARING_SCHEDULE', // Re-schedule requested by clinician
    'AWAITING_CLINICAL_REVIEW',
    'CHECKING_INTERACTIONS',
    'MEDICATIONS_CONFIRMED', // Feedback loop: if medication is corrected during schedule review
    'BLOCKED',
    'FAILED',
    'CANCELLED',
  ],

  COMPLETED: [
    'CHECKING_INTERACTIONS', // Feedback loop: new lab or medication change
    'PREPARING_SCHEDULE',
    'MEDICATIONS_CONFIRMED',
  ],

  BLOCKED: [
    'RETRIEVING_PATIENT_CONTEXT',
    'AWAITING_PRESCRIPTION',
    'EXTRACTING_PRESCRIPTION',
    'AWAITING_MEDICATION_CONFIRMATION',
    'CHECKING_INTERACTIONS',
    'PREPARING_SCHEDULE',
    'FAILED',
    'CANCELLED',
  ],

  FAILED: [
    'CREATED',
    'RETRIEVING_PATIENT_CONTEXT',
    'AWAITING_PRESCRIPTION',
    'EXTRACTING_PRESCRIPTION',
    'CHECKING_INTERACTIONS',
    'PREPARING_SCHEDULE',
    'CANCELLED',
  ],

  CANCELLED: [], // Terminal
};

export function isValidTransition(
  fromState: AgenticWorkflowState,
  toState: AgenticWorkflowState
): boolean {
  if (fromState === toState) {
    return true; // Idempotent re-entry allowed
  }
  const allowed = VALID_AGENTIC_TRANSITIONS[fromState];
  return allowed ? allowed.includes(toState) : false;
}

export function checkPrerequisites(
  context: WorkflowContext,
  targetState: AgenticWorkflowState
): { allowed: boolean; unmet: string[] } {
  const unmet: string[] = [];

  switch (targetState) {
    case 'CHECKING_INTERACTIONS': {
      // Must not have unverified candidates
      const pendingCandidates = context.unverifiedMedicationCandidates.filter(
        (c) => c.status === 'unverified'
      );
      if (pendingCandidates.length > 0) {
        unmet.push(
          `Cannot check interactions: ${pendingCandidates.length} unverified medication candidate(s) await clinical confirmation.`
        );
      }
      break;
    }

    case 'PREPARING_SCHEDULE': {
      // Must have confirmed medications
      const pendingCandidates = context.unverifiedMedicationCandidates.filter(
        (c) => c.status === 'unverified'
      );
      if (pendingCandidates.length > 0) {
        unmet.push(
          `Cannot prepare schedule: unverified medication candidate(s) exist.`
        );
      }
      // Must not have unresolved blocking clinical review items
      const blockingClinicalReviews = context.pendingHumanApprovals.filter(
        (r) =>
          r.status === 'pending' &&
          (r.category === 'potentially_significant_interaction' ||
            r.category === 'medication_identity_clarification' ||
            r.category === 'missing_prescription_instructions')
      );
      if (blockingClinicalReviews.length > 0) {
        unmet.push(
          `Cannot prepare schedule: ${blockingClinicalReviews.length} blocking clinical review request(s) are pending approval.`
        );
      }
      break;
    }

    case 'AWAITING_SCHEDULE_REVIEW': {
      // Must have a proposed draft schedule
      if (!context.proposedSchedules) {
        unmet.push('Cannot await schedule review: no proposed draft schedule exists.');
      }
      break;
    }

    case 'COMPLETED': {
      // All human review items must be resolved
      const pendingReviews = context.pendingHumanApprovals.filter(
        (r) => r.status === 'pending'
      );
      if (pendingReviews.length > 0) {
        unmet.push(
          `Cannot complete workflow: ${pendingReviews.length} human review item(s) remain pending.`
        );
      }
      // Proposed schedule must exist if patient has medications
      if (
        context.confirmedMedicationRecordIds.length > 0 &&
        !context.proposedSchedules
      ) {
        unmet.push(
          'Cannot complete workflow: proposed schedule has not been coordinated.'
        );
      }
      // Explicit human clinical approval must be recorded if tracked (Rule 6: separate from workflow completion)
      if (
        context.humanApprovedOutcomes !== undefined &&
        context.humanApprovedOutcomes.scheduleApproved === false
      ) {
        unmet.push(
          'Cannot complete workflow: proposed diurnal schedule has not received explicit human clinical signoff.'
        );
      }

      // Phase 3 Deterministic Guard: Cannot complete if clinical artifacts are stale
      if (context.artifactGraph) {
        if (
          context.artifactGraph.nodes.interaction_findings &&
          context.artifactGraph.nodes.interaction_findings.status !== 'current'
        ) {
          unmet.push('Cannot complete workflow: interaction findings are stale.');
        }
        if (
          context.artifactGraph.nodes.draft_schedule &&
          context.artifactGraph.nodes.draft_schedule.status !== 'current'
        ) {
          unmet.push('Cannot complete workflow: proposed draft schedule is stale.');
        }
      }
      break;
    }

    default:
      break;
  }

  return {
    allowed: unmet.length === 0,
    unmet,
  };
}

export function assertValidTransition(
  fromState: AgenticWorkflowState,
  toState: AgenticWorkflowState,
  context?: WorkflowContext
): void {
  if (!isValidTransition(fromState, toState)) {
    throw new InvalidWorkflowTransitionError(
      fromState,
      toState,
      `Transition from "${fromState}" to "${toState}" is not permitted by the workflow state machine.`
    );
  }

  if (context) {
    const prereqs = checkPrerequisites(context, toState);
    if (!prereqs.allowed) {
      throw new WorkflowPrerequisiteError(toState, prereqs.unmet);
    }
  }
}
