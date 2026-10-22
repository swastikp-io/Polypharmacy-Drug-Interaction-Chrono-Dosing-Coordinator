import React, { useState } from 'react';
import { CheckCircle, XCircle, Edit3, X, AlertTriangle } from 'lucide-react';
import type { ScheduleReviewSubmission } from '../../../shared/chronoTypes.js';

interface ScheduleReviewModalProps {
  isOpen: boolean;
  scheduleId: string;
  patientName: string;
  hasConflicts: boolean;
  onClose: () => void;
  onSubmit: (submission: ScheduleReviewSubmission & { scheduleId: string }) => Promise<void>;
}

export const ScheduleReviewModal: React.FC<ScheduleReviewModalProps> = ({
  isOpen,
  scheduleId,
  patientName,
  hasConflicts,
  onClose,
  onSubmit,
}) => {
  const [decision, setDecision] = useState<'accepted' | 'rejected' | 'modified'>('accepted');
  const [actor, setActor] = useState('Dr. Sarah Lin, PharmD, BCGP');
  const [rationale, setRationale] = useState(
    'Schedule aligns morning fasted thyroid medication and separates calcium carbonate to lunch/dinner meals. Confirmed diuretic timing avoids nocturnal fall hazards.'
  );
  const [clinicianNotes, setClinicianNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await onSubmit({
        scheduleId,
        decision,
        actor,
        rationale,
        clinicianNotes,
      });
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to submit schedule review');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="review-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4"
    >
      <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <header className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-clinical-100 text-clinical-700">
              <CheckCircle className="w-5 h-5" aria-hidden="true" />
            </div>
            <div>
              <h2 id="review-modal-title" className="text-base font-bold text-slate-900">
                Formal Clinician Schedule Review
              </h2>
              <p className="text-xs text-slate-500">
                Audited clinical reconciliation for {patientName}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition-colors"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </header>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-xs text-red-700">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}

          {hasConflicts && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2.5 text-xs text-amber-900">
              <AlertTriangle className="w-4 h-4 text-amber-700 flex-shrink-0 mt-0.5" aria-hidden="true" />
              <div>
                <strong>Active Conflicts Detected:</strong> This draft timetable contains flagged clinical
                hazards or unverified medications. Ensure your clinical rationale addresses each identified conflict.
              </div>
            </div>
          )}

          {/* Decision Selection */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-2">
              Clinical Determination
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => {
                  setDecision('accepted');
                  setRationale('Accepted draft timetable: timing windows verified against pharmacokinetics and patient routine.');
                }}
                className={`p-2.5 rounded-lg border text-center text-xs font-bold transition-all flex flex-col items-center gap-1 ${
                  decision === 'accepted'
                    ? 'bg-emerald-50 border-emerald-500 text-emerald-800 ring-2 ring-emerald-500/30'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                <CheckCircle className="w-4 h-4 text-emerald-600" aria-hidden="true" />
                <span>Accept Timetable</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setDecision('rejected');
                  setRationale('Rejected draft timetable: requires prescriber clarification on conflicting orders before scheduling.');
                }}
                className={`p-2.5 rounded-lg border text-center text-xs font-bold transition-all flex flex-col items-center gap-1 ${
                  decision === 'rejected'
                    ? 'bg-red-50 border-red-500 text-red-800 ring-2 ring-red-500/30'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                <XCircle className="w-4 h-4 text-red-600" aria-hidden="true" />
                <span>Reject / Hold</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setDecision('modified');
                  setRationale('Schedule modified by clinical pharmacist to adjust administration windows.');
                }}
                className={`p-2.5 rounded-lg border text-center text-xs font-bold transition-all flex flex-col items-center gap-1 ${
                  decision === 'modified'
                    ? 'bg-blue-50 border-blue-500 text-blue-800 ring-2 ring-blue-500/30'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                <Edit3 className="w-4 h-4 text-blue-600" aria-hidden="true" />
                <span>Clinical Notes</span>
              </button>
            </div>
          </div>

          {/* Clinician Identity */}
          <div>
            <label htmlFor="reviewer-actor" className="block text-xs font-semibold text-slate-700 mb-1">
              Reviewer Name &amp; Clinical Credentials
            </label>
            <input
              id="reviewer-actor"
              type="text"
              value={actor}
              onChange={(e) => setActor(e.target.value)}
              required
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-clinical-500 focus:border-clinical-500 font-medium"
            />
          </div>

          {/* Clinical Justification */}
          <div>
            <label htmlFor="review-rationale" className="block text-xs font-semibold text-slate-700 mb-1">
              Clinical Decision Rationale (Mandatory Audit Trail Field)
            </label>
            <textarea
              id="review-rationale"
              rows={3}
              value={rationale}
              onChange={(e) => setRationale(e.target.value)}
              required
              placeholder="Detail reasons for accepting or holding this schedule..."
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-clinical-500 focus:border-clinical-500"
            />
          </div>

          {/* Additional Notes */}
          <div>
            <label htmlFor="clinician-notes" className="block text-xs font-semibold text-slate-700 mb-1">
              Instructions for Caregivers or Nursing Staff (Optional)
            </label>
            <textarea
              id="clinician-notes"
              rows={2}
              value={clinicianNotes}
              onChange={(e) => setClinicianNotes(e.target.value)}
              placeholder="e.g., Remind caregiver to provide 8oz plain water with 07:00 Levothyroxine."
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-clinical-500 focus:border-clinical-500"
            />
          </div>

          <footer className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className={`px-4 py-2 text-xs font-semibold text-white rounded-lg transition-colors flex items-center gap-1.5 shadow-xs disabled:opacity-50 ${
                decision === 'accepted'
                  ? 'bg-emerald-600 hover:bg-emerald-700'
                  : decision === 'rejected'
                    ? 'bg-red-600 hover:bg-red-700'
                    : 'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              <CheckCircle className="w-4 h-4" aria-hidden="true" />
              <span>{submitting ? 'Submitting to Audit Log...' : 'Confirm & Log Decision'}</span>
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
};
