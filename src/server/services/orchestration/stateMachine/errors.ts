import type { AgenticWorkflowState } from '../../../../shared/orchestrationTypes.js';

export class InvalidWorkflowTransitionError extends Error {
  constructor(
    public readonly fromState: AgenticWorkflowState,
    public readonly toState: AgenticWorkflowState,
    public readonly reason?: string
  ) {
    super(
      `Invalid workflow transition from "${fromState}" to "${toState}".${
        reason ? ` Reason: ${reason}` : ''
      }`
    );
    this.name = 'InvalidWorkflowTransitionError';
  }
}

export class WorkflowPrerequisiteError extends Error {
  constructor(
    public readonly targetState: AgenticWorkflowState,
    public readonly unmetPrerequisites: string[]
  ) {
    super(
      `Prerequisites not met for transition to "${targetState}": ${unmetPrerequisites.join(
        '; '
      )}`
    );
    this.name = 'WorkflowPrerequisiteError';
  }
}

export class OptimisticConcurrencyError extends Error {
  constructor(
    public readonly workflowId: string,
    public readonly expectedVersion: number,
    public readonly currentVersion?: number
  ) {
    super(
      `Optimistic concurrency conflict on workflow "${workflowId}". Expected version ${expectedVersion}${
        currentVersion !== undefined ? `, but found version ${currentVersion}` : ''
      }.`
    );
    this.name = 'OptimisticConcurrencyError';
  }
}

export class UnauthorizedToolExecutionError extends Error {
  constructor(
    public readonly toolName: string,
    public readonly requiredPolicy: string,
    public readonly actor: string,
    public readonly reason?: string
  ) {
    super(
      `Actor "${actor}" is unauthorized to execute tool "${toolName}" (policy: ${requiredPolicy}).${
        reason ? ` Reason: ${reason}` : ''
      }`
    );
    this.name = 'UnauthorizedToolExecutionError';
  }
}

export class ToolInputValidationError extends Error {
  constructor(
    public readonly toolName: string,
    public readonly issues: string[]
  ) {
    super(
      `Input validation failed for tool "${toolName}": ${issues.join(', ')}`
    );
    this.name = 'ToolInputValidationError';
  }
}

export class UnauthorizedReviewerError extends Error {
  constructor(
    public readonly reviewerIdentity: string,
    public readonly reason: string
  ) {
    super(`Unauthorized reviewer "${reviewerIdentity}": ${reason}`);
    this.name = 'UnauthorizedReviewerError';
  }
}

export class UnauthorizedReviewerRoleError extends Error {
  constructor(
    public readonly reviewerRole: string,
    public readonly category: string,
    public readonly allowedRoles: readonly string[]
  ) {
    super(
      `Reviewer role "${reviewerRole}" is unauthorized to resolve review category "${category}". Permitted roles: ${allowedRoles.join(', ')}.`
    );
    this.name = 'UnauthorizedReviewerRoleError';
  }
}

export class ApprovalVersionMismatchError extends Error {
  constructor(
    public readonly targetEntityId: string,
    public readonly targetEntityType: string,
    public readonly reviewItemVersion: number,
    public readonly currentItemVersion: number
  ) {
    super(
      `Cannot approve ${targetEntityType} "${targetEntityId}": Item version has changed (reviewed v${reviewItemVersion}, current v${currentItemVersion}). Approval invalidated.`
    );
    this.name = 'ApprovalVersionMismatchError';
  }
}

export class StructuredAgentError extends Error {
  constructor(
    public readonly code: string,
    public readonly agentName: string,
    message: string,
    public readonly isRecoverable: boolean = true,
    public readonly details?: Record<string, any>
  ) {
    super(`[${agentName}] ${code}: ${message}`);
    this.name = 'StructuredAgentError';
  }
}
