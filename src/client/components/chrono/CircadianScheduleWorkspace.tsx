import React, { useState, useEffect } from 'react';
import {
  Clock,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  FileCheck2,
  ShieldAlert,
  ChevronDown,
  ChevronUp,
  Sparkles,
  History,
  BookOpen,
  Coffee,
  Sun,
  Moon,
  Utensils,
  Pill,
} from 'lucide-react';
import type {
  DailyScheduleTimeline,
  PatientRoutine,
  ScheduleConflictItem,
  ScheduledDoseItem,
  ScheduleTimeSlot,
} from '../../../shared/chronoTypes.js';
import { api } from '../../api/apiClient.js';
import { PatientRoutineModal } from './PatientRoutineModal.js';
import { ScheduleComparisonTable } from './ScheduleComparisonTable.js';
import { ScheduleReviewModal } from './ScheduleReviewModal.js';

interface CircadianScheduleWorkspaceProps {
  patientId: string;
  patientName: string;
  onRefreshParent?: () => Promise<void>;
}

export const CircadianScheduleWorkspace: React.FC<CircadianScheduleWorkspaceProps> = ({
  patientId,
  patientName,
  onRefreshParent,
}) => {
  const [schedule, setSchedule] = useState<DailyScheduleTimeline | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeSubView, setActiveSubView] = useState<'timeline' | 'comparison' | 'conflicts' | 'history'>('timeline');

  // Modals
  const [routineModalOpen, setRoutineModalOpen] = useState(false);
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [historyList, setHistoryList] = useState<DailyScheduleTimeline[]>([]);

  // Expanded rationale tracking
  const [expandedRationales, setExpandedRationales] = useState<Record<string, boolean>>({});

  const toggleRationale = (doseId: string) => {
    setExpandedRationales((prev) => ({
      ...prev,
      [doseId]: !prev[doseId],
    }));
  };

  const loadSchedule = async (fresh: boolean = false) => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getDraftSchedule(patientId, fresh);
      setSchedule(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load circadian schedule');
    } finally {
      setLoading(false);
    }
  };

  const loadHistory = async () => {
    try {
      const history = await api.getScheduleHistory(patientId);
      setHistoryList(history);
    } catch (err: any) {
      console.error('Failed to load schedule history:', err);
    }
  };

  useEffect(() => {
    loadSchedule();
  }, [patientId]);

  const handleUpdateRoutine = async (updated: Partial<PatientRoutine>) => {
    const res = await api.updatePatientRoutine(patientId, updated);
    setSchedule(res.newSchedule);
    if (onRefreshParent) {
      await onRefreshParent();
    }
  };

  const handleReviewSubmit = async (submission: any) => {
    const updated = await api.submitScheduleReview(patientId, submission);
    setSchedule(updated);
    if (onRefreshParent) {
      await onRefreshParent();
    }
  };

  if (loading && !schedule) {
    return (
      <div className="p-12 text-center bg-white rounded-xl border border-slate-200">
        <RefreshCw className="w-8 h-8 text-clinical-600 animate-spin mx-auto mb-3" aria-hidden="true" />
        <h3 className="text-sm font-bold text-slate-800">Calculating Circadian Kinetics &amp; Constraints...</h3>
        <p className="text-xs text-slate-500 mt-1">Evaluating absorption windows, interval separations, and fall-risk boundaries.</p>
      </div>
    );
  }

  if (error || !schedule) {
    return (
      <div className="p-6 bg-red-50 border border-red-200 rounded-xl text-red-900">
        <div className="flex items-center gap-2 font-bold mb-2">
          <AlertTriangle className="w-5 h-5 text-red-600" aria-hidden="true" />
          <span>Error Coordinating Schedule</span>
        </div>
        <p className="text-xs text-red-700">{error || 'Schedule data could not be computed.'}</p>
        <button
          type="button"
          onClick={() => loadSchedule(true)}
          className="mt-3 px-3 py-1.5 text-xs font-semibold bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
        >
          Retry Calculation
        </button>
      </div>
    );
  }

  const urgentConflictsCount = schedule.conflicts.filter(
    (c) => c.severity === 'urgent_prescriber_review'
  ).length;

  return (
    <div className="space-y-4">
      {/* 1. Clinical Prototype Safety Banner */}
      <aside
        aria-label="Clinical Decision Support Notice"
        className="p-3 bg-amber-50 border-l-4 border-amber-500 text-amber-950 rounded-r-xl flex items-start justify-between gap-3 text-xs shadow-xs"
      >
        <div className="flex items-start gap-2.5">
          <ShieldAlert className="w-4 h-4 text-amber-700 flex-shrink-0 mt-0.5" aria-hidden="true" />
          <div>
            <strong>CLINICAL DECISION SUPPORT PROTOTYPE:</strong> {schedule.safetyNotice}
          </div>
        </div>
        <span className="text-2xs font-mono font-bold bg-amber-200/80 px-2 py-0.5 rounded text-amber-900 flex-shrink-0">
          Deterministic Rule Engine
        </span>
      </aside>

      {/* 2. Top Header & Control Strip */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-slate-900">Circadian Schedule Coordinator</h2>
            <ScheduleStatusBadge status={schedule.status} />
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            24-hour chrono-dosing timetable synchronized with patient routine and evidence-backed absorption rules.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Routine Summary Chip */}
          <button
            type="button"
            onClick={() => setRoutineModalOpen(true)}
            className="px-3 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors shadow-2xs"
            title="Click to customize meal and sleep routine"
          >
            <Clock className="w-3.5 h-3.5 text-clinical-600" aria-hidden="true" />
            <span>
              Wake: <strong>{schedule.patientRoutine.wakeTime}</strong> &bull; Bed:{' '}
              <strong>{schedule.patientRoutine.bedTime}</strong>
            </span>
          </button>

          {/* Recalculate Button */}
          <button
            type="button"
            onClick={() => loadSchedule(true)}
            disabled={loading}
            className="px-3 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-2xs disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-slate-500 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
            <span>Recalculate</span>
          </button>

          {/* Review Button */}
          <button
            type="button"
            onClick={() => setReviewModalOpen(true)}
            className="px-3 py-1.5 bg-clinical-600 hover:bg-clinical-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-xs"
          >
            <FileCheck2 className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Clinical Review &amp; Signoff</span>
          </button>
        </div>
      </div>

      {/* 3. Sub-Navigation Tabs */}
      <nav aria-label="Schedule views" className="border-b border-slate-200 flex items-center gap-2 overflow-x-auto pb-px">
        <button
          type="button"
          onClick={() => setActiveSubView('timeline')}
          className={`px-3.5 py-2 text-xs font-semibold border-b-2 flex items-center gap-2 transition-colors whitespace-nowrap ${
            activeSubView === 'timeline'
              ? 'border-clinical-600 text-clinical-800 bg-clinical-50/50 rounded-t-lg font-bold'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <Calendar className="w-4 h-4 text-clinical-600" aria-hidden="true" />
          <span>24-Hour Timetable</span>
          <span className="px-1.5 py-0.2 rounded text-2xs font-bold bg-slate-100 text-slate-700">
            {schedule.slots.reduce((acc, s) => acc + s.doses.length, 0)} Doses
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubView('comparison')}
          className={`px-3.5 py-2 text-xs font-semibold border-b-2 flex items-center gap-2 transition-colors whitespace-nowrap ${
            activeSubView === 'comparison'
              ? 'border-clinical-600 text-clinical-800 bg-clinical-50/50 rounded-t-lg font-bold'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <Sparkles className="w-4 h-4 text-clinical-600" aria-hidden="true" />
          <span>Side-by-Side Comparison</span>
          <span className="px-1.5 py-0.2 rounded text-2xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
            100% Preserved
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubView('conflicts')}
          className={`px-3.5 py-2 text-xs font-semibold border-b-2 flex items-center gap-2 transition-colors whitespace-nowrap ${
            activeSubView === 'conflicts'
              ? 'border-clinical-600 text-clinical-800 bg-clinical-50/50 rounded-t-lg font-bold'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <AlertTriangle
            className={`w-4 h-4 ${urgentConflictsCount > 0 ? 'text-red-600' : 'text-amber-600'}`}
            aria-hidden="true"
          />
          <span>Review Alerts &amp; Conflicts</span>
          {schedule.conflicts.length > 0 && (
            <span
              className={`px-1.5 py-0.2 rounded text-2xs font-bold ${
                urgentConflictsCount > 0
                  ? 'bg-red-100 text-red-800 border border-red-200'
                  : 'bg-amber-100 text-amber-800 border border-amber-200'
              }`}
            >
              {schedule.conflicts.length}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveSubView('history');
            loadHistory();
          }}
          className={`px-3.5 py-2 text-xs font-semibold border-b-2 flex items-center gap-2 transition-colors whitespace-nowrap ${
            activeSubView === 'history'
              ? 'border-clinical-600 text-clinical-800 bg-clinical-50/50 rounded-t-lg font-bold'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <History className="w-4 h-4 text-slate-500" aria-hidden="true" />
          <span>Audit Revisions</span>
        </button>
      </nav>

      {/* 4. Active Sub-View Content */}
      <div className="pt-1">
        {/* VIEW 1: 24-HOUR TIMETABLE */}
        {activeSubView === 'timeline' && (
          <div className="space-y-4">
            {schedule.slots.map((slot) => (
              <TimelineSlotCard
                key={slot.slotId}
                slot={slot}
                expandedRationales={expandedRationales}
                onToggleRationale={toggleRationale}
              />
            ))}

            {/* PRN Flexible Section if exists */}
            {schedule.prnDoses.length > 0 && (
              <div className="bg-purple-50/50 border border-purple-200 rounded-xl p-4 shadow-xs">
                <div className="flex items-center justify-between mb-3 border-b border-purple-200/60 pb-2">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-purple-100 text-purple-800">
                      <Pill className="w-4 h-4" aria-hidden="true" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-purple-950">As-Needed (PRN) Symptom-Triggered</h3>
                      <p className="text-2xs text-purple-800">
                        Flexible administration. Strictly observe minimum separation hours and maximum daily dose limits.
                      </p>
                    </div>
                  </div>
                  <span className="text-2xs font-bold text-purple-800 bg-purple-100 px-2 py-0.5 rounded border border-purple-200">
                    {schedule.prnDoses.length} PRN Orders
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {schedule.prnDoses.map((dose) => (
                    <DoseCard
                      key={dose.doseId}
                      dose={dose}
                      isExpanded={!!expandedRationales[dose.doseId]}
                      onToggle={() => toggleRationale(dose.doseId)}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* VIEW 2: SIDE-BY-SIDE COMPARISON */}
        {activeSubView === 'comparison' && (
          <ScheduleComparisonTable comparison={schedule.comparison} />
        )}

        {/* VIEW 3: CONFLICTS & CLINICAL ALERTS */}
        {activeSubView === 'conflicts' && (
          <div className="space-y-4">
            {schedule.conflicts.length === 0 ? (
              <div className="p-8 text-center bg-white rounded-xl border border-slate-200 shadow-xs">
                <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto mb-2" aria-hidden="true" />
                <h3 className="text-sm font-bold text-slate-900">Zero Timing Violations Detected</h3>
                <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                  All active medications successfully separated according to authoritative pharmacokinetic
                  guidelines without conflicting with patient meal or bedtime preferences.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {schedule.conflicts.map((conflict) => (
                  <ConflictAlertCard key={conflict.id} conflict={conflict} />
                ))}
              </div>
            )}

            {/* Unconfident / Unverified Medications Warning */}
            {schedule.unconfidentMedications.length > 0 && (
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl space-y-2 shadow-xs">
                <div className="flex items-center gap-2 text-amber-900 font-bold text-xs">
                  <AlertTriangle className="w-4 h-4 text-amber-700" aria-hidden="true" />
                  <span>
                    Unverified Prescription Orders ({schedule.unconfidentMedications.length})
                  </span>
                </div>
                <p className="text-2xs text-amber-800 leading-relaxed">
                  The following medications were scheduled with <strong>low confidence</strong> because their
                  prescriptions are unverified (OCR candidate intake or pending clinical verification). A licensed
                  clinician must confirm the order before adopting these scheduled hours:
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                  {schedule.unconfidentMedications.map((u) => (
                    <div
                      key={u.medicationId}
                      className="p-2.5 bg-white border border-amber-200 rounded-lg text-2xs text-slate-800 flex flex-col justify-between"
                    >
                      <div className="font-bold text-slate-900">{u.brand} ({u.genericName})</div>
                      <div className="text-amber-800 mt-1">{u.reason}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* VIEW 4: AUDIT REVISIONS HISTORY */}
        {activeSubView === 'history' && (
          <div className="space-y-3">
            {historyList.length === 0 ? (
              <div className="p-8 text-center bg-white rounded-xl border border-slate-200 shadow-xs">
                <History className="w-8 h-8 text-slate-400 mx-auto mb-2" aria-hidden="true" />
                <h3 className="text-sm font-bold text-slate-900">No Previous Revisions Found</h3>
                <p className="text-xs text-slate-500 mt-1">
                  This is the initial draft schedule. Reviews and modifications will be archived here.
                </p>
              </div>
            ) : (
              historyList.map((hist) => (
                <div
                  key={hist.scheduleId}
                  className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-bold text-slate-500">{hist.scheduleId}</span>
                      <ScheduleStatusBadge status={hist.status} />
                    </div>
                    <span className="text-2xs text-slate-400">
                      {new Date(hist.generatedAt).toLocaleString()}
                    </span>
                  </div>

                  {hist.reviewMetadata && (
                    <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200/80 text-xs space-y-1">
                      <div className="font-semibold text-slate-800">
                        Reviewer: {hist.reviewMetadata.reviewedBy} (Decision: {hist.reviewMetadata.decision.toUpperCase()})
                      </div>
                      <p className="text-2xs text-slate-600">
                        <strong>Rationale:</strong> {hist.reviewMetadata.decisionRationale}
                      </p>
                      {hist.reviewMetadata.clinicianNotes && (
                        <p className="text-2xs text-slate-500 italic">
                          Notes: {hist.reviewMetadata.clinicianNotes}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Routine Customization Modal */}
      <PatientRoutineModal
        isOpen={routineModalOpen}
        routine={schedule.patientRoutine}
        patientName={patientName}
        onClose={() => setRoutineModalOpen(false)}
        onSave={handleUpdateRoutine}
      />

      {/* Clinician Review & Decision Modal */}
      <ScheduleReviewModal
        isOpen={reviewModalOpen}
        scheduleId={schedule.scheduleId}
        patientName={patientName}
        hasConflicts={schedule.conflicts.length > 0}
        onClose={() => setReviewModalOpen(false)}
        onSubmit={handleReviewSubmit}
      />
    </div>
  );
};

// ==========================================
// SUBCOMPONENTS
// ==========================================

interface TimelineSlotCardProps {
  slot: ScheduleTimeSlot;
  expandedRationales: Record<string, boolean>;
  onToggleRationale: (doseId: string) => void;
}

const TimelineSlotCard: React.FC<TimelineSlotCardProps> = ({
  slot,
  expandedRationales,
  onToggleRationale,
}) => {
  return (
    <article
      aria-labelledby={`slot-heading-${slot.slotId}`}
      className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs"
    >
      {/* Slot Header */}
      <header className="px-4 py-3 bg-slate-50/80 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <SlotIcon slotId={slot.slotId} />
          <div>
            <div className="flex items-center gap-2">
              <h3 id={`slot-heading-${slot.slotId}`} className="text-sm font-bold text-slate-900">
                {slot.slotName}
              </h3>
              <span className="px-2 py-0.5 rounded-full text-2xs font-mono font-bold bg-clinical-100 text-clinical-800 border border-clinical-200">
                Target: {slot.targetTime}
              </span>
            </div>
            <p className="text-2xs text-slate-500 mt-0.5">
              Allowable Window: {slot.timeWindow} &bull; {slot.description}
            </p>
          </div>
        </div>

        <span className="text-2xs font-semibold px-2 py-0.5 rounded bg-slate-200/70 text-slate-700">
          {slot.doses.length} {slot.doses.length === 1 ? 'Medication' : 'Medications'}
        </span>
      </header>

      {/* Doses in Slot */}
      <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
        {slot.doses.map((dose) => (
          <DoseCard
            key={dose.doseId}
            dose={dose}
            isExpanded={!!expandedRationales[dose.doseId]}
            onToggle={() => onToggleRationale(dose.doseId)}
          />
        ))}
      </div>
    </article>
  );
};

interface DoseCardProps {
  dose: ScheduledDoseItem;
  isExpanded: boolean;
  onToggle: () => void;
}

const DoseCard: React.FC<DoseCardProps> = ({ dose, isExpanded, onToggle }) => {
  const isUnverified = dose.verificationStatus === 'unverified';

  return (
    <div
      className={`p-3.5 rounded-xl border transition-all text-xs flex flex-col justify-between ${
        isUnverified
          ? 'bg-amber-50/40 border-amber-300'
          : 'bg-white border-slate-200 hover:border-slate-300 shadow-xs'
      }`}
    >
      <div>
        {/* Header: Drug Title & Prescribed Dose Tag */}
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
              <span>{dose.brand}</span>
              {isUnverified && (
                <span className="px-1.5 py-0.2 rounded text-3xs font-bold bg-amber-100 text-amber-800 border border-amber-200 uppercase">
                  Unverified
                </span>
              )}
            </div>
            <div className="text-2xs text-slate-500 italic mt-0.5">{dose.genericName}</div>
          </div>

          <div className="text-right flex-shrink-0">
            <span className="inline-block px-2 py-0.5 rounded text-2xs font-bold bg-clinical-50 text-clinical-900 border border-clinical-200">
              {dose.prescribedDose}
            </span>
          </div>
        </div>

        {/* Formulation & Food Instructions */}
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          <span className="px-2 py-0.5 rounded text-2xs bg-slate-100 text-slate-600 font-medium">
            {dose.formulation} &bull; {dose.route}
          </span>
          <FoodRelationBadge relation={dose.foodRelation} />
        </div>

        {/* Written Administration Instructions */}
        <p className="mt-2 text-2xs text-slate-700 leading-relaxed font-mono bg-slate-50 p-2 rounded border border-slate-100">
          &ldquo;{dose.administrationInstructions}&rdquo;
        </p>

        {/* Special Precautions */}
        {dose.specialPrecautions.length > 0 && (
          <div className="mt-2 space-y-1">
            {dose.specialPrecautions.map((p, idx) => (
              <div key={idx} className="flex items-center gap-1.5 text-2xs text-amber-900 font-medium">
                <AlertTriangle className="w-3 h-3 text-amber-600 flex-shrink-0" aria-hidden="true" />
                <span>{p}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Clinical Rationale Expander */}
      <div className="mt-3 pt-2.5 border-t border-slate-100">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={isExpanded}
          className="w-full flex items-center justify-between text-2xs font-semibold text-clinical-700 hover:text-clinical-800 transition-colors"
        >
          <span className="flex items-center gap-1">
            <BookOpen className="w-3 h-3" aria-hidden="true" />
            <span>Circadian Rationale &amp; Evidence</span>
          </span>
          {isExpanded ? (
            <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
          )}
        </button>

        {isExpanded && (
          <div className="mt-2 p-2.5 bg-slate-50 rounded-lg text-2xs space-y-1.5 border border-slate-200/80 animate-in fade-in duration-100">
            <p className="text-slate-800 leading-relaxed font-medium">
              {dose.timingRationale}
            </p>
            {dose.evidenceSources.map((source, idx) => (
              <div key={idx} className="text-3xs text-slate-500 pt-1 border-t border-slate-200/60">
                <span className="font-bold text-slate-600">{source.sourceAuthority}:</span>{' '}
                <span className="italic">{source.citation}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

const ConflictAlertCard: React.FC<{ conflict: ScheduleConflictItem }> = ({ conflict }) => {
  const isUrgent = conflict.severity === 'urgent_prescriber_review';

  return (
    <aside
      aria-label={conflict.title}
      className={`p-4 rounded-xl border text-xs shadow-xs space-y-2 ${
        isUrgent
          ? 'bg-red-50 border-red-300 text-red-950'
          : 'bg-amber-50 border-amber-300 text-amber-950'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <AlertTriangle
            className={`w-5 h-5 flex-shrink-0 ${isUrgent ? 'text-red-600' : 'text-amber-600'}`}
            aria-hidden="true"
          />
          <h4 className="font-bold text-sm text-slate-900">{conflict.title}</h4>
        </div>

        <span
          className={`px-2 py-0.5 rounded text-2xs font-bold uppercase tracking-wide ${
            isUrgent ? 'bg-red-200 text-red-900' : 'bg-amber-200 text-amber-900'
          }`}
        >
          {conflict.severity.replace(/_/g, ' ')}
        </span>
      </div>

      <p className="text-xs leading-relaxed text-slate-700">{conflict.description}</p>

      <div className="p-3 bg-white/80 rounded-lg border border-slate-200/80 space-y-1 text-2xs">
        <div>
          <strong className="text-slate-900">Clinical Mechanism:</strong>{' '}
          <span className="text-slate-700">{conflict.clinicalRationale}</span>
        </div>
        <div className="pt-1">
          <strong className="text-slate-900">Recommended Action:</strong>{' '}
          <span className="text-slate-800 font-semibold">{conflict.recommendedAction}</span>
        </div>
        <div className="pt-1 text-3xs text-slate-500 italic">
          Citation: {conflict.evidenceCitation}
        </div>
      </div>
    </aside>
  );
};

const FoodRelationBadge: React.FC<{ relation: ScheduledDoseItem['foodRelation'] }> = ({ relation }) => {
  switch (relation) {
    case 'empty_stomach':
      return (
        <span className="px-2 py-0.5 rounded text-2xs font-bold bg-amber-100 text-amber-900 border border-amber-200">
          Strictly Empty Stomach
        </span>
      );
    case 'with_meal':
      return (
        <span className="px-2 py-0.5 rounded text-2xs font-bold bg-emerald-100 text-emerald-900 border border-emerald-200">
          Take With Food
        </span>
      );
    case 'before_meal':
      return (
        <span className="px-2 py-0.5 rounded text-2xs font-bold bg-blue-100 text-blue-900 border border-blue-200">
          Before Meal
        </span>
      );
    case 'after_meal':
      return (
        <span className="px-2 py-0.5 rounded text-2xs font-bold bg-indigo-100 text-indigo-900 border border-indigo-200">
          After Meal
        </span>
      );
    case 'independent':
    default:
      return (
        <span className="px-2 py-0.5 rounded text-2xs bg-slate-100 text-slate-600">
          Food-Independent
        </span>
      );
  }
};

const ScheduleStatusBadge: React.FC<{ status: DailyScheduleTimeline['status'] }> = ({ status }) => {
  switch (status) {
    case 'reviewed_accepted':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-2xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
          <CheckCircle2 className="w-3 h-3 text-emerald-600" aria-hidden="true" />
          <span>Reviewed &amp; Accepted</span>
        </span>
      );
    case 'reviewed_rejected':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-2xs font-bold bg-red-100 text-red-800 border border-red-200">
          <span>Reviewed &amp; On Hold</span>
        </span>
      );
    case 'modified_by_clinician':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-2xs font-bold bg-blue-100 text-blue-800 border border-blue-200">
          <span>Modified by Clinician</span>
        </span>
      );
    case 'draft':
    default:
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-2xs font-bold bg-amber-100 text-amber-800 border border-amber-200">
          <span>Draft Timetable (Requires Signoff)</span>
        </span>
      );
  }
};

const SlotIcon: React.FC<{ slotId: string }> = ({ slotId }) => {
  switch (slotId) {
    case 'slot_wake_fasted':
      return (
        <div className="p-2 rounded-lg bg-amber-100 text-amber-800">
          <Coffee className="w-4 h-4" aria-hidden="true" />
        </div>
      );
    case 'slot_breakfast':
      return (
        <div className="p-2 rounded-lg bg-orange-100 text-orange-800">
          <Sun className="w-4 h-4" aria-hidden="true" />
        </div>
      );
    case 'slot_midday_lunch':
      return (
        <div className="p-2 rounded-lg bg-yellow-100 text-yellow-800">
          <Utensils className="w-4 h-4" aria-hidden="true" />
        </div>
      );
    case 'slot_evening_dinner':
      return (
        <div className="p-2 rounded-lg bg-blue-100 text-blue-800">
          <Utensils className="w-4 h-4" aria-hidden="true" />
        </div>
      );
    case 'slot_bedtime':
      return (
        <div className="p-2 rounded-lg bg-indigo-100 text-indigo-800">
          <Moon className="w-4 h-4" aria-hidden="true" />
        </div>
      );
    default:
      return (
        <div className="p-2 rounded-lg bg-slate-100 text-slate-700">
          <Clock className="w-4 h-4" aria-hidden="true" />
        </div>
      );
  }
};
