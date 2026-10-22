import type {
  AgenticWorkflowState,
  StructuredError,
  WorkflowContext,
} from '../../../../shared/orchestrationTypes.js';
import {
  assertValidTransition,
  checkPrerequisites,
  isValidTransition,
} from './transitions.js';
import {
  InvalidWorkflowTransitionError,
  WorkflowPrerequisiteError,
} from './errors.js';
import type { AuditService } from '../../auditService.js';

export class AgenticWorkflowStateMachine {
  constructor(
    private context: WorkflowContext,
    private auditService?: AuditService
  ) {}

  public getState(): AgenticWorkflowState {
    return this.context.state;
  }

  public getContext(): WorkflowContext {
    return this.context;
  }

  public canTransitionTo(targetState: AgenticWorkflowState): boolean {
    if (!isValidTransition(this.context.state, targetState)) {
      return false;
    }
    const prereqs = checkPrerequisites(this.context, targetState);
    return prereqs.allowed;
  }

  public transitionTo(
    targetState: AgenticWorkflowState,
    options?: {
      reason?: string;
      actor?: string;
      bypassPrerequisites?: boolean;
    }
  ): void {
    const fromState = this.context.state;

    // Reject invalid transition
    if (!isValidTransition(fromState, targetState)) {
      throw new InvalidWorkflowTransitionError(
        fromState,
        targetState,
        options?.reason
      );
    }

    // Check prerequisites
    if (!options?.bypassPrerequisites) {
      const prereqs = checkPrerequisites(this.context, targetState);
      if (!prereqs.allowed) {
        throw new WorkflowPrerequisiteError(targetState, prereqs.unmet);
      }
    }

    // Apply state change
    this.context.state = targetState;
    this.context.updatedAt = new Date().toISOString();

    if (this.auditService) {
      this.auditService.logEvent({
        patientId: this.context.patientId,
        entityType: 'workflow_state_machine',
        entityId: this.context.workflowId,
        action: `TRANSITION_${targetState}`,
        actor: options?.actor || 'AgenticWorkflowStateMachine',
        summary: `State transition: ${fromState} -> ${targetState}${
          options?.reason ? `. Reason: ${options.reason}` : ''
        }`,
        changedFields: {
          previousState: fromState,
          newState: targetState,
          reason: options?.reason || null,
        },
      });
    }
  }

  public blockWorkflow(reason: string, missingDependency?: string): void {
    this.transitionTo('BLOCKED', {
      reason: `Workflow blocked: ${reason}${
        missingDependency ? ` (Missing dependency: ${missingDependency})` : ''
      }`,
    });
  }

  public failWorkflow(error: StructuredError): void {
    // Record error in failedOperations if not already present
    this.transitionTo('FAILED', {
      reason: `Workflow failed: [${error.code}] ${error.message}`,
      bypassPrerequisites: true,
    });
  }

  public cancelWorkflow(reason: string, actor: string): void {
    this.transitionTo('CANCELLED', {
      reason,
      actor,
      bypassPrerequisites: true,
    });
  }
}
