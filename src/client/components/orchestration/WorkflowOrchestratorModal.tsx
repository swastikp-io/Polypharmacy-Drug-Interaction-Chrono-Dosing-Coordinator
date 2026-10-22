import React, { useState, useEffect } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  FileCheck2,
  PauseCircle,
  RefreshCw,
  Sparkles,
  Terminal,
  X,
} from 'lucide-react';
import type {
  WorkflowRun,
  WorkflowStepResult,
} from '../../../shared/orchestrationTypes.js';
import { api } from '../../api/apiClient.js';

interface WorkflowOrchestratorModalProps {
  isOpen: boolean;
  patientId: string;
  patientName: string;
  onClose: () => void;
  onViewReport: () => void;
  onMedicationReconciled?: () => Promise<void>;
}

export const WorkflowOrchestratorModal: React.FC<WorkflowOrchestratorModalProps> = ({
  isOpen,
  patientId,
  patientName,
  onClose,
  onViewReport,
  onMedicationReconciled,
}) => {
  const [run, setRun] = useState<WorkflowRun | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requireConfirmedOnly, setRequireConfirmedOnly] = useState(true);
  const [showLogs, setShowLogs] = useState(false);
  const [resuming, setResuming] = useState(false);

  // Start workflow on first open or manual trigger
  const handleStartWorkflow = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.startWorkflow({
        patientId,
        requireConfirmedOnly,
        actor: 'Clinical Pharmacist Coordinator',
      });
      setRun(data);
      if (onMedicationReconciled) {
        await onMedicationReconciled();
      }
    } catch (err: any) {
      setError(err.message || 'Failed to start multi-agent workflow');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      handleStartWorkflow();
    }
  }, [isOpen, patientId]);

  // Resume paused workflow after confirming medications
  const handleConfirmAndResume = async (medicationIds: string[]) => {
    if (!run) return;
    setResuming(true);
    setError(null);
    try {
      const updated = await api.resumeWorkflow(run.runId, {
        confirmedMedicationIds: medicationIds,
        actor: 'Clinical Pharmacist Reviewer',
        notes: 'Confirmed epistemic truth during multi-agent orchestration checkpoint.',
      });
      setRun(updated);
      if (onMedicationReconciled) {
        await onMedicationReconciled();
      }
    } catch (err: any) {
      setError(err.message || 'Failed to resume workflow');
    } finally {
      setResuming(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="orchestrator-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4"
    >
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <header className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-clinical-100 text-clinical-700">
              <Sparkles className="w-5 h-5" aria-hidden="true" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 id="orchestrator-modal-title" className="text-base font-bold text-slate-900">
                  Multi-Agent Workflow Coordinator
                </h2>
                <span className="px-2 py-0.5 rounded text-2xs font-mono font-bold bg-clinical-100 text-clinical-800 border border-clinical-200">
                  Phase 5
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Coordinating OCR Normalization &bull; PK Conflict Engine &bull; Circadian Timetable for {patientName}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleStartWorkflow}
              disabled={loading || resuming}
              className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 rounded-lg transition-colors flex items-center gap-1.5 shadow-2xs disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
              <span>Rerun Pipeline</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close dialog"
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition-colors"
            >
              <X className="w-5 h-5" aria-hidden="true" />
            </button>
          </div>
        </header>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {error && (
            <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-xs text-red-800">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 text-red-600" aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}

          {/* Pipeline Status Banner */}
          {run && (
            <div className="p-4 rounded-xl border bg-slate-50 border-slate-200 shadow-xs flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <WorkflowStatusIcon state={run.state} />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                      Workflow Status:
                    </span>
                    <span className="text-xs font-bold text-slate-900">{run.state.replace(/_/g, ' ')}</span>
                  </div>
                  <p className="text-2xs text-slate-500 font-mono mt-0.5">
                    Run ID: {run.runId} &bull; Started: {new Date(run.startedAt).toLocaleTimeString()}
                    {run.totalDurationMs ? ` (${run.totalDurationMs}ms)` : ''}
                  </p>
                </div>
              </div>

              {run.state === 'COMPLETED' && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onViewReport();
                  }}
                  className="px-3.5 py-2 text-xs font-bold text-white bg-clinical-600 hover:bg-clinical-700 rounded-lg transition-colors flex items-center gap-1.5 shadow-xs"
                >
                  <FileCheck2 className="w-4 h-4" aria-hidden="true" />
                  <span>View Consolidated Dossier &rarr;</span>
                </button>
              )}
            </div>
          )}

          {/* Checkpoint Callout: Paused for Confirmation */}
          {run && run.state === 'PAUSED_FOR_CLINICAL_REVIEW' && run.pendingAction && (
            <aside
              aria-label="Clinical Epistemic Checkpoint"
              className="p-4 bg-amber-50 border-l-4 border-amber-500 text-amber-950 rounded-r-xl shadow-xs space-y-3"
            >
              <div className="flex items-center gap-2 font-bold text-xs">
                <PauseCircle className="w-4 h-4 text-amber-600 flex-shrink-0" aria-hidden="true" />
                <span>Epistemic Safety Checkpoint: Unverified Medications Detected</span>
              </div>
              <p className="text-2xs text-amber-900 leading-relaxed">
                {run.checkpointReason} Clinical safety rules prohibit assuming unverified preliminary orders are
                confirmed truth before running pharmacokinetic conflict analysis.
              </p>

              <div className="space-y-2 pt-1">
                {run.pendingAction.unconfirmedMedications.map((u) => (
                  <div
                    key={u.id}
                    className="p-3 bg-white border border-amber-200 rounded-lg flex items-center justify-between gap-3 text-xs"
                  >
                    <div>
                      <div className="font-bold text-slate-900">{u.brand} ({u.genericName})</div>
                      <div className="text-2xs text-slate-500">{u.reason}</div>
                    </div>
                    <button
                      type="button"
                      disabled={resuming}
                      onClick={() => handleConfirmAndResume([u.id])}
                      className="px-3 py-1.5 text-2xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-md transition-colors flex items-center gap-1 disabled:opacity-50"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Confirm Truth &amp; Resume</span>
                    </button>
                  </div>
                ))}
              </div>

              <div className="pt-2 flex items-center justify-between text-2xs">
                <span className="text-amber-800">Or confirm all {run.pendingAction.unconfirmedMedications.length} orders simultaneously:</span>
                <button
                  type="button"
                  disabled={resuming}
                  onClick={() =>
                    handleConfirmAndResume(run.pendingAction!.unconfirmedMedications.map((u) => u.id))
                  }
                  className="px-3 py-1.5 font-bold text-emerald-900 bg-emerald-100 hover:bg-emerald-200 rounded-md border border-emerald-300 transition-colors"
                >
                  Confirm All &amp; Continue Pipeline &rarr;
                </button>
              </div>
            </aside>
          )}

          {/* Stepper Stages Display */}
          {run && (
            <div className="space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Pipeline Stages Execution
              </h3>

              <div className="space-y-2.5">
                {Object.values(run.steps).map((step) => (
                  <WorkflowStepCard key={step.stepName} step={step} />
                ))}
              </div>
            </div>
          )}

          {/* Execution Logs Drawer Toggle */}
          {run && run.logs.length > 0 && (
            <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
              <button
                type="button"
                onClick={() => setShowLogs(!showLogs)}
                className="w-full px-4 py-2.5 bg-slate-50 hover:bg-slate-100 text-left text-xs font-semibold text-slate-700 flex items-center justify-between transition-colors"
              >
                <span className="flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-slate-500" aria-hidden="true" />
                  <span>Sanitized Workflow Execution Logs ({run.logs.length} events)</span>
                </span>
                <span className="text-2xs text-slate-400">
                  {showLogs ? 'Hide Logs ▲' : 'Show Logs ▼'}
                </span>
              </button>

              {showLogs && (
                <div className="p-3 bg-slate-900 text-slate-100 text-2xs font-mono max-h-48 overflow-y-auto space-y-1">
                  {run.logs.map((log) => (
                    <div key={log.id} className="flex items-start gap-2">
                      <span className="text-slate-500 flex-shrink-0">
                        {new Date(log.timestamp).toLocaleTimeString()}
                      </span>
                      <span
                        className={`font-bold flex-shrink-0 ${
                          log.level === 'ERROR'
                            ? 'text-red-400'
                            : log.level === 'WARN'
                              ? 'text-amber-400'
                              : log.level === 'CHECKPOINT'
                                ? 'text-cyan-400'
                                : 'text-emerald-400'
                        }`}
                      >
                        [{log.level}]
                      </span>
                      <span className="text-slate-400 flex-shrink-0">{log.step}:</span>
                      <span className="text-slate-200">{log.message}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <footer className="px-6 py-3.5 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
          <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
            <input
              type="checkbox"
              checked={requireConfirmedOnly}
              onChange={(e) => setRequireConfirmedOnly(e.target.checked)}
              className="rounded text-clinical-600 focus:ring-clinical-500"
            />
            <span>Require clinical confirmation for unverified preliminary orders (Safety Checkpoint)</span>
          </label>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200/60 rounded-lg transition-colors"
          >
            Close
          </button>
        </footer>
      </div>
    </div>
  );
};

// ==========================================
// SUBCOMPONENTS
// ==========================================

const WorkflowStepCard: React.FC<{ step: WorkflowStepResult }> = ({ step }) => {
  return (
    <div
      className={`p-3.5 rounded-xl border text-xs transition-all flex items-start gap-3 ${
        step.status === 'completed'
          ? 'bg-emerald-50/40 border-emerald-200'
          : step.status === 'running'
            ? 'bg-clinical-50/60 border-clinical-300 ring-2 ring-clinical-500/20'
            : step.status === 'paused'
              ? 'bg-amber-50/60 border-amber-300 ring-2 ring-amber-500/20'
              : step.status === 'failed'
                ? 'bg-red-50 border-red-300'
                : 'bg-white border-slate-200 opacity-60'
      }`}
    >
      <div className="mt-0.5">
        <StepStatusIcon status={step.status} />
      </div>

      <div className="flex-1 space-y-1">
        <div className="flex items-center justify-between">
          <div className="font-bold text-slate-900 text-xs flex items-center gap-2">
            <span>Stage {step.stageIndex}: {formatStepTitle(step.stepName)}</span>
          </div>

          <div className="flex items-center gap-2">
            {step.durationMs !== undefined && (
              <span className="text-2xs font-mono text-slate-400">{step.durationMs}ms</span>
            )}
            <span
              className={`px-2 py-0.5 rounded text-3xs font-bold uppercase tracking-wider ${
                step.status === 'completed'
                  ? 'bg-emerald-100 text-emerald-800'
                  : step.status === 'running'
                    ? 'bg-clinical-100 text-clinical-800 animate-pulse'
                    : step.status === 'paused'
                      ? 'bg-amber-100 text-amber-800'
                      : step.status === 'failed'
                        ? 'bg-red-100 text-red-800'
                        : 'bg-slate-100 text-slate-600'
              }`}
            >
              {step.status}
            </span>
          </div>
        </div>

        <p className="text-2xs text-slate-600 leading-relaxed">{step.summary}</p>
      </div>
    </div>
  );
};

const WorkflowStatusIcon: React.FC<{ state: string }> = ({ state }) => {
  switch (state) {
    case 'COMPLETED':
      return <CheckCircle2 className="w-6 h-6 text-emerald-600" aria-hidden="true" />;
    case 'PAUSED_FOR_CLINICAL_REVIEW':
      return <PauseCircle className="w-6 h-6 text-amber-600" aria-hidden="true" />;
    case 'FAILED_RECOVERABLE':
    case 'ABORTED':
      return <AlertTriangle className="w-6 h-6 text-red-600" aria-hidden="true" />;
    default:
      return <RefreshCw className="w-6 h-6 text-clinical-600 animate-spin" aria-hidden="true" />;
  }
};

const StepStatusIcon: React.FC<{ status: string }> = ({ status }) => {
  switch (status) {
    case 'completed':
      return <CheckCircle2 className="w-4 h-4 text-emerald-600" aria-hidden="true" />;
    case 'running':
      return <RefreshCw className="w-4 h-4 text-clinical-600 animate-spin" aria-hidden="true" />;
    case 'paused':
      return <PauseCircle className="w-4 h-4 text-amber-600" aria-hidden="true" />;
    case 'failed':
      return <AlertTriangle className="w-4 h-4 text-red-600" aria-hidden="true" />;
    case 'skipped':
      return <ArrowRight className="w-4 h-4 text-slate-400" aria-hidden="true" />;
    default:
      return <Clock className="w-4 h-4 text-slate-300" aria-hidden="true" />;
  }
};

function formatStepTitle(stepName: string): string {
  switch (stepName) {
    case 'FETCHING_PATIENT_RECORDS':
      return 'Patient Chart & Order Intake';
    case 'OCR_INTAKE':
      return 'Prescription OCR Normalization';
    case 'AWAITING_MEDICATION_CONFIRMATION':
      return 'Epistemic Truth Checkpoint';
    case 'EVALUATING_INTERACTIONS':
      return 'Pharmacokinetic Conflict Engine';
    case 'COORDINATING_SCHEDULE':
      return 'Circadian Timetable Coordination';
    case 'GENERATING_CONSOLIDATED_REPORT':
      return 'Consolidated Clinical Dossier';
    default:
      return stepName.replace(/_/g, ' ');
  }
}
