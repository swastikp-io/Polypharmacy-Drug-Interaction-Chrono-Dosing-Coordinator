import { randomUUID } from 'crypto';
import type {
  LogLevel,
  WorkflowExecutionLog,
  WorkflowRun,
  WorkflowRunOptions,
  WorkflowState,
  WorkflowStepResult,
  WorkflowStepStatus,
} from '../../../shared/orchestrationTypes.js';

export class WorkflowStateMachine {
  private run: WorkflowRun;

  constructor(patientId: string, options: WorkflowRunOptions, customRunId?: string) {
    const runId = customRunId || `wf-run-${randomUUID()}`;
    const now = new Date().toISOString();

    this.run = {
      runId,
      patientId,
      state: 'IDLE',
      startedAt: now,
      steps: {
        FETCHING_PATIENT_RECORDS: {
          stepName: 'FETCHING_PATIENT_RECORDS',
          stageIndex: 1,
          status: 'pending',
          summary: 'Retrieve confirmed patient chart, active medication orders, and renal/hepatic labs.',
        },
        OCR_INTAKE: {
          stepName: 'OCR_INTAKE',
          stageIndex: 2,
          status: options.ocrDocumentId ? 'pending' : 'skipped',
          summary: options.ocrDocumentId
            ? 'Process uploaded prescription source image/PDF and extract candidate entities.'
            : 'No unprocessed prescription document supplied; skipping OCR intake.',
        },
        AWAITING_MEDICATION_CONFIRMATION: {
          stepName: 'AWAITING_MEDICATION_CONFIRMATION',
          stageIndex: 3,
          status: 'pending',
          summary: 'Verify epistemic status of all active medications prior to clinical conflict calculation.',
        },
        EVALUATING_INTERACTIONS: {
          stepName: 'EVALUATING_INTERACTIONS',
          stageIndex: 4,
          status: 'pending',
          summary: 'Run deterministic pharmacokinetic and pharmacodynamic conflict engine.',
        },
        COORDINATING_SCHEDULE: {
          stepName: 'COORDINATING_SCHEDULE',
          stageIndex: 5,
          status: 'pending',
          summary: 'Generate 24-hour diurnal dosing timetable based on patient routine and absorption kinetics.',
        },
        GENERATING_CONSOLIDATED_REPORT: {
          stepName: 'GENERATING_CONSOLIDATED_REPORT',
          stageIndex: 6,
          status: 'pending',
          summary: 'Synthesize consolidated clinical dossier with prioritized pharmacist action checklist.',
        },
      },
      logs: [],
      options,
    };

    this.log('INFO', 'INITIALIZING', `Initialized workflow run ${runId} for patient ${patientId}`);
  }

  public getSnapshot(): WorkflowRun {
    return JSON.parse(JSON.stringify(this.run));
  }

  public getState(): WorkflowState {
    return this.run.state;
  }

  public transitionTo(newState: WorkflowState, logMessage?: string): void {
    const prevState = this.run.state;
    this.run.state = newState;
    const msg = logMessage || `Workflow state transitioned from ${prevState} to ${newState}`;
    this.log('INFO', newState, msg);
  }

  public startStep(stepName: string, summary?: string): void {
    const step = this.run.steps[stepName];
    if (step) {
      step.status = 'running';
      step.startedAt = new Date().toISOString();
      if (summary) step.summary = summary;
    }
    this.log('INFO', stepName, `Started step: ${stepName}`);
  }

  public completeStep(stepName: string, summary: string, details?: Record<string, any>): void {
    const step = this.run.steps[stepName];
    if (step) {
      step.status = 'completed';
      step.completedAt = new Date().toISOString();
      if (step.startedAt) {
        step.durationMs = new Date(step.completedAt).getTime() - new Date(step.startedAt).getTime();
      }
      step.summary = summary;
      step.details = details;
    }
    this.log('INFO', stepName, `Completed step: ${stepName} (${step?.durationMs || 0}ms)`);
  }

  public pauseForCheckpoint(
    stepName: string,
    reason: string,
    pendingAction: WorkflowRun['pendingAction']
  ): void {
    const step = this.run.steps[stepName];
    if (step) {
      step.status = 'paused';
      step.summary = reason;
    }
    this.run.state = 'PAUSED_FOR_CLINICAL_REVIEW';
    this.run.checkpointReason = reason;
    this.run.pendingAction = pendingAction;
    this.log('CHECKPOINT', stepName, `Workflow paused: ${reason}`);
  }

  public failStep(stepName: string, code: string, message: string, recoverable: boolean = true): void {
    const step = this.run.steps[stepName];
    if (step) {
      step.status = 'failed';
      step.completedAt = new Date().toISOString();
      if (step.startedAt) {
        step.durationMs = new Date(step.completedAt).getTime() - new Date(step.startedAt).getTime();
      }
      step.error = { code, message, recoverable };
      step.summary = `Failed: ${message}`;
    }
    this.run.state = recoverable ? 'FAILED_RECOVERABLE' : 'ABORTED';
    this.log('ERROR', stepName, `Step ${stepName} failed: [${code}] ${message}`);
  }

  public completeWorkflow(report: any): void {
    this.run.report = report;
    this.run.completedAt = new Date().toISOString();
    this.run.totalDurationMs =
      new Date(this.run.completedAt).getTime() - new Date(this.run.startedAt).getTime();
    this.run.state = 'COMPLETED';
    this.log(
      'INFO',
      'COMPLETED',
      `Workflow completed successfully in ${this.run.totalDurationMs}ms. Report generated.`
    );
  }

  // Sanitized logging: Scrubs personal data and strips raw prescription image data
  public log(
    level: LogLevel,
    step: string,
    message: string,
    metadata?: Record<string, string | number | boolean | null>
  ): void {
    // Sanitize message: remove potential base64 strings or private identifiers
    const sanitizedMsg = message
      .replace(/data:image\/[a-zA-Z]+;base64,[^"\s]+/g, '[IMAGE_DATA_REDACTED]')
      .replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[SSN_REDACTED]');

    const entry: WorkflowExecutionLog = {
      id: `log-${randomUUID()}`,
      timestamp: new Date().toISOString(),
      level,
      step,
      message: sanitizedMsg,
      metadata,
    };

    this.run.logs.push(entry);
  }
}
