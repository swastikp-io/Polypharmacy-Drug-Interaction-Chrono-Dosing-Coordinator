import React, { useState, useEffect } from 'react';
import {
  AlertTriangle,
  Beaker,
  CheckCircle,
  Database,
  FileScan,
  FlaskConical,
  Play,
  RefreshCw,
  RotateCcw,
  Shield,
  X,
} from 'lucide-react';
import { api } from '../../api/apiClient.js';
import type { Patient } from '../../../shared/types.js';

interface SyntheticDataPanelProps {
  isOpen: boolean;
  onClose: () => void;
  patients: Patient[];
  selectedPatientId: string | null;
  onSelectPatient: (patientId: string) => void;
  onDataChanged: () => void;
}

export const SyntheticDataPanel: React.FC<SyntheticDataPanelProps> = ({
  isOpen,
  onClose,
  patients,
  selectedPatientId,
  onSelectPatient,
  onDataChanged,
}) => {
  const [stats, setStats] = useState<any>(null);
  const [isLoadingStats, setIsLoadingStats] = useState(false);
  const [activeTab, setActiveTab] = useState<'scenarios' | 'ocr' | 'interactions' | 'schedules'>('scenarios');
  const [feedbackMessage, setFeedbackMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  // Fixture states
  const [ocrFixtures, setOcrFixtures] = useState<any[]>([]);
  const [interactionFixtures, setInteractionFixtures] = useState<any[]>([]);
  const [scheduleFixtures, setScheduleFixtures] = useState<any[]>([]);
  const [activeFixtureResult, setActiveFixtureResult] = useState<any>(null);
  const [runningFixtureId, setRunningFixtureId] = useState<string | null>(null);

  // Reset modal state
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [resetConfirmationInput, setResetConfirmationInput] = useState('');
  const [isResetting, setIsResetting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadStats();
      loadFixtures();
    }
  }, [isOpen]);

  const loadStats = async () => {
    try {
      setIsLoadingStats(true);
      const data = await api.getDevStats();
      setStats(data);
    } catch (err: any) {
      setFeedbackMessage({ type: 'error', text: err.message || 'Failed to fetch dataset stats' });
    } finally {
      setIsLoadingStats(false);
    }
  };

  const loadFixtures = async () => {
    try {
      const [ocr, ix, sched] = await Promise.all([
        api.getOcrFixtures(),
        api.getInteractionFixtures(),
        api.getScheduleFixtures(),
      ]);
      setOcrFixtures(ocr);
      setInteractionFixtures(ix);
      setScheduleFixtures(sched);
    } catch (err: any) {
      console.error('Failed to load fixtures:', err);
    }
  };

  const handleSeed = async () => {
    try {
      setIsLoadingStats(true);
      setFeedbackMessage(null);
      const res = await api.seedDevDataset();
      await loadStats();
      onDataChanged();
      setFeedbackMessage({
        type: 'success',
        text: `Idempotent seed completed: ${res.patientsSeeded} new patients, ${res.medicationsSeeded} new medications. Total: ${res.totalSyntheticPatients} patients in DB.`,
      });
    } catch (err: any) {
      setFeedbackMessage({ type: 'error', text: err.message || 'Seed operation failed' });
    } finally {
      setIsLoadingStats(false);
    }
  };

  const handleReset = async () => {
    if (resetConfirmationInput !== 'CONFIRM_RESET_TEST_DATASET') {
      setFeedbackMessage({ type: 'error', text: 'You must type CONFIRM_RESET_TEST_DATASET exactly to reset.' });
      return;
    }

    try {
      setIsResetting(true);
      setFeedbackMessage(null);
      const res = await api.resetDevDataset(resetConfirmationInput);
      setIsResetModalOpen(false);
      setResetConfirmationInput('');
      await loadStats();
      onDataChanged();
      setFeedbackMessage({
        type: 'success',
        text: `Test dataset reset: ${res.deletedPatientsCount} synthetic patient records cleanly purged and re-seeded.`,
      });
    } catch (err: any) {
      setFeedbackMessage({ type: 'error', text: err.message || 'Reset failed' });
    } finally {
      setIsResetting(false);
    }
  };

  const runOcrTest = async (fixtureId: string) => {
    try {
      setRunningFixtureId(fixtureId);
      setActiveFixtureResult(null);
      const result = await api.runOcrFixture(fixtureId);
      setActiveFixtureResult({ type: 'ocr', data: result });
    } catch (err: any) {
      setFeedbackMessage({ type: 'error', text: err.message || 'OCR test failed' });
    } finally {
      setRunningFixtureId(null);
    }
  };

  const runInteractionTest = async (fixtureId: string) => {
    try {
      setRunningFixtureId(fixtureId);
      setActiveFixtureResult(null);
      const result = await api.runInteractionFixture(fixtureId);
      setActiveFixtureResult({ type: 'interaction', data: result });
    } catch (err: any) {
      setFeedbackMessage({ type: 'error', text: err.message || 'Interaction test failed' });
    } finally {
      setRunningFixtureId(null);
    }
  };

  const runScheduleTest = async (scenarioId: string) => {
    try {
      setRunningFixtureId(scenarioId);
      setActiveFixtureResult(null);
      const result = await api.runScheduleFixture(scenarioId);
      setActiveFixtureResult({ type: 'schedule', data: result });
    } catch (err: any) {
      setFeedbackMessage({ type: 'error', text: err.message || 'Schedule test failed' });
    } finally {
      setRunningFixtureId(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-3">
            <span className="p-2 bg-indigo-500/20 text-indigo-400 rounded-lg border border-indigo-500/30">
              <Beaker className="w-5 h-5" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white tracking-tight">
                  Synthetic Dataset &amp; Clinical Test Lab
                </h2>
                <span className="px-2 py-0.5 rounded text-3xs font-black tracking-wider uppercase bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  DEVELOPER / QA ONLY
                </span>
              </div>
              <p className="text-2xs text-slate-400">
                Idempotent synthetic patient cohort (8 profiles), 42 medications, 27 labs, and automated test scenario runners.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close synthetic dataset panel"
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Feedback Alert */}
        {feedbackMessage && (
          <div
            className={`px-6 py-3 text-xs flex items-center justify-between ${
              feedbackMessage.type === 'success'
                ? 'bg-emerald-50 text-emerald-900 border-b border-emerald-200'
                : feedbackMessage.type === 'error'
                  ? 'bg-rose-50 text-rose-900 border-b border-rose-200'
                  : 'bg-indigo-50 text-indigo-900 border-b border-indigo-200'
            }`}
          >
            <span>{feedbackMessage.text}</span>
            <button
              type="button"
              onClick={() => setFeedbackMessage(null)}
              className="text-xs font-bold underline ml-4 hover:opacity-80"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Metric Badges & Action Bar */}
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2 text-2xs">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-200 font-semibold text-slate-700 shadow-2xs">
              <Database className="w-3.5 h-3.5 text-indigo-600" />
              <span>Patients:</span>
              <strong className="text-slate-900">{stats?.syntheticPatients ?? patients.length}</strong>
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-200 font-semibold text-slate-700 shadow-2xs">
              <FlaskConical className="w-3.5 h-3.5 text-emerald-600" />
              <span>Medications:</span>
              <strong className="text-slate-900">{stats?.syntheticMedications ?? '...'}</strong>
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-200 font-semibold text-slate-700 shadow-2xs">
              <FileScan className="w-3.5 h-3.5 text-amber-600" />
              <span>OCR Fixtures:</span>
              <strong className="text-slate-900">{ocrFixtures.length || 8}</strong>
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-200 font-semibold text-slate-700 shadow-2xs">
              <Shield className="w-3.5 h-3.5 text-purple-600" />
              <span>Interaction Rules:</span>
              <strong className="text-slate-900">{interactionFixtures.length || 12}</strong>
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSeed}
              disabled={isLoadingStats}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-xs transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingStats ? 'animate-spin' : ''}`} />
              Re-seed (Idempotent)
            </button>

            <button
              type="button"
              onClick={() => setIsResetModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-semibold transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset Test Dataset...
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-200 px-6 bg-white gap-2">
          <button
            type="button"
            onClick={() => {
              setActiveTab('scenarios');
              setActiveFixtureResult(null);
            }}
            className={`py-3 px-3 text-xs font-bold border-b-2 transition-colors ${
              activeTab === 'scenarios'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            Clinical Patient Scenarios (8)
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('ocr');
              setActiveFixtureResult(null);
            }}
            className={`py-3 px-3 text-xs font-bold border-b-2 transition-colors ${
              activeTab === 'ocr'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            Prescription OCR Fixtures (8)
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('interactions');
              setActiveFixtureResult(null);
            }}
            className={`py-3 px-3 text-xs font-bold border-b-2 transition-colors ${
              activeTab === 'interactions'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            Interaction Engine Fixtures (12)
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('schedules');
              setActiveFixtureResult(null);
            }}
            className={`py-3 px-3 text-xs font-bold border-b-2 transition-colors ${
              activeTab === 'schedules'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            Chrono-Schedule Scenarios (8)
          </button>
        </div>

        {/* Tab Content Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          {/* TAB 1: Clinical Patient Scenarios */}
          {activeTab === 'scenarios' && (
            <div className="space-y-3">
              <p className="text-xs text-slate-500">
                Select any synthetic test patient below to switch the application to their comprehensive clinical dashboard, medication list, and lab values:
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {patients.map((p) => {
                  const isSelected = p.id === selectedPatientId;
                  return (
                    <div
                      key={p.id}
                      className={`p-3.5 rounded-xl border transition-all text-left flex flex-col justify-between ${
                        isSelected
                          ? 'border-indigo-600 bg-indigo-50/50 ring-2 ring-indigo-500/20'
                          : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-xs'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <span className="font-bold text-sm text-slate-900">{p.name}</span>
                          <span className="px-2 py-0.5 rounded text-3xs font-mono font-bold bg-slate-100 text-slate-700 border border-slate-200">
                            {p.mrn}
                          </span>
                        </div>
                        <div className="text-2xs text-slate-500 mb-2">
                          DOB: {p.dateOfBirth} • {p.gender} • {p.primaryPhysician}
                        </div>
                        <p className="text-2xs text-slate-600 line-clamp-2 bg-slate-50 p-2 rounded border border-slate-100 mb-3">
                          {p.notes || 'Synthetic test profile.'}
                        </p>
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                        <span className="text-3xs font-bold text-indigo-600 uppercase tracking-wider">
                          SYNTHETIC TEST RECORD
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            onSelectPatient(p.id);
                            onClose();
                          }}
                          className={`px-3 py-1 rounded text-xs font-semibold transition-colors ${
                            isSelected
                              ? 'bg-indigo-600 text-white'
                              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                          }`}
                        >
                          {isSelected ? 'Active Profile' : 'Select Patient'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 2: OCR Prescription Fixtures */}
          {activeTab === 'ocr' && (
            <div className="space-y-4">
              <p className="text-xs text-slate-500">
                Execute local OCR extraction and drug normalization on each synthetic prescription fixture stored in <code className="bg-slate-100 px-1 py-0.5 rounded">data/test-fixtures/</code>:
              </p>
              <div className="grid grid-cols-1 gap-2.5">
                {ocrFixtures.map((f) => (
                  <div
                    key={f.fixtureId}
                    className="p-3.5 rounded-xl border border-slate-200 bg-white hover:border-slate-300 flex items-center justify-between gap-4"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-bold text-slate-900">{f.title}</span>
                        <span className="px-1.5 py-0.5 rounded text-3xs font-mono font-bold bg-slate-100 text-slate-600">
                          {f.fileName}
                        </span>
                      </div>
                      <p className="text-2xs text-slate-600">{f.description}</p>
                    </div>

                    <button
                      type="button"
                      disabled={runningFixtureId === f.fixtureId}
                      onClick={() => runOcrTest(f.fixtureId)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold border border-indigo-200 transition-colors disabled:opacity-50 whitespace-nowrap"
                    >
                      <Play className={`w-3.5 h-3.5 ${runningFixtureId === f.fixtureId ? 'animate-spin' : ''}`} />
                      Run Test
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 3: Clinical Interaction Fixtures */}
          {activeTab === 'interactions' && (
            <div className="space-y-4">
              <p className="text-xs text-slate-500">
                Evaluate interaction rules, duplicate therapy detection, clinical data gaps, and simulated provider outages:
              </p>
              <div className="grid grid-cols-1 gap-2.5">
                {interactionFixtures.map((ix) => (
                  <div
                    key={ix.fixtureId}
                    className="p-3.5 rounded-xl border border-slate-200 bg-white hover:border-slate-300 flex items-center justify-between gap-4"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-bold text-slate-900">{ix.title}</span>
                        <span
                          className={`px-1.5 py-0.5 rounded text-3xs font-bold uppercase ${
                            ix.hypotheticalOrVerified === 'verified_reference'
                              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                              : 'bg-amber-50 text-amber-800 border border-amber-200'
                          }`}
                        >
                          {ix.hypotheticalOrVerified === 'verified_reference' ? 'Verified Ref' : 'Hypothetical Test'}
                        </span>
                        {ix.expectedSeverity && (
                          <span className="px-1.5 py-0.5 rounded text-3xs font-bold bg-slate-100 text-slate-700">
                            {ix.expectedSeverity}
                          </span>
                        )}
                      </div>
                      <p className="text-2xs text-slate-600">{ix.expectedBehavior}</p>
                    </div>

                    <button
                      type="button"
                      disabled={runningFixtureId === ix.fixtureId}
                      onClick={() => runInteractionTest(ix.fixtureId)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold border border-indigo-200 transition-colors disabled:opacity-50 whitespace-nowrap"
                    >
                      <Play className={`w-3.5 h-3.5 ${runningFixtureId === ix.fixtureId ? 'animate-spin' : ''}`} />
                      Evaluate
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 4: Chrono-Schedule Scenarios */}
          {activeTab === 'schedules' && (
            <div className="space-y-4">
              <p className="text-xs text-slate-500">
                Execute the deterministic circadian schedule engine against timing and meal-separation scenarios:
              </p>
              <div className="grid grid-cols-1 gap-2.5">
                {scheduleFixtures.map((s) => (
                  <div
                    key={s.scenarioId}
                    className="p-3.5 rounded-xl border border-slate-200 bg-white hover:border-slate-300 flex items-center justify-between gap-4"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-bold text-slate-900">{s.title}</span>
                      </div>
                      <p className="text-2xs text-slate-600">{s.description}</p>
                    </div>

                    <button
                      type="button"
                      disabled={runningFixtureId === s.scenarioId}
                      onClick={() => runScheduleTest(s.scenarioId)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold border border-indigo-200 transition-colors disabled:opacity-50 whitespace-nowrap"
                    >
                      <Play className={`w-3.5 h-3.5 ${runningFixtureId === s.scenarioId ? 'animate-spin' : ''}`} />
                      Test Schedule
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Results Viewer */}
          {activeFixtureResult && (
            <div className="mt-4 p-4 rounded-xl bg-slate-900 text-slate-100 border border-slate-800 text-2xs space-y-2">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <span className="font-bold text-xs text-white">
                  Test Execution Result: {activeFixtureResult.data.title || activeFixtureResult.data.fixtureId}
                </span>
                <span className="text-emerald-400 font-bold flex items-center gap-1">
                  <CheckCircle className="w-3.5 h-3.5" /> Assertions Validated
                </span>
              </div>
              <pre className="max-h-60 overflow-y-auto bg-slate-950 p-3 rounded font-mono text-3xs text-emerald-300">
                {JSON.stringify(activeFixtureResult.data, null, 2)}
              </pre>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-2xs text-slate-500">
          <span>All synthetic profiles are clearly marked SYNTHETIC / TEST DATA. No real patient data imported.</span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-800 font-semibold text-xs"
          >
            Close Panel
          </button>
        </div>
      </div>

      {/* Explicit Reset Confirmation Modal */}
      {isResetModalOpen && (
        <div className="fixed inset-0 z-60 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-rose-200 space-y-4">
            <div className="flex items-center gap-3 text-rose-600">
              <span className="p-2 bg-rose-100 rounded-lg">
                <AlertTriangle className="w-6 h-6" />
              </span>
              <div>
                <h3 className="text-base font-bold text-slate-900">Reset Dedicated Test Dataset</h3>
                <p className="text-2xs text-slate-500">Strictly restricted to synthetic records (SYNTH-%)</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              This operation purges all synthetic test patient records, medications, and schedule drafts from SQLite, and re-seeds the pristine baseline cohort.
              Production or non-synthetic databases cannot be deleted by this command.
            </p>

            <div className="space-y-1.5">
              <label className="text-2xs font-bold text-slate-700 block">
                Type <code className="bg-slate-100 text-rose-600 px-1 py-0.5 rounded font-mono font-bold">CONFIRM_RESET_TEST_DATASET</code> to confirm:
              </label>
              <input
                type="text"
                value={resetConfirmationInput}
                onChange={(e) => setResetConfirmationInput(e.target.value)}
                placeholder="CONFIRM_RESET_TEST_DATASET"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono focus:ring-2 focus:ring-rose-500 focus:outline-hidden"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  setIsResetModalOpen(false);
                  setResetConfirmationInput('');
                }}
                disabled={isResetting}
                className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleReset}
                disabled={isResetting || resetConfirmationInput !== 'CONFIRM_RESET_TEST_DATASET'}
                className="px-4 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold shadow-xs disabled:opacity-40 transition-colors"
              >
                {isResetting ? 'Resetting...' : 'Confirm Reset'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
