import React, { useState } from 'react';
import { Clock, X, AlertCircle, Check } from 'lucide-react';
import type { PatientRoutine } from '../../../shared/chronoTypes.js';

interface PatientRoutineModalProps {
  isOpen: boolean;
  routine: PatientRoutine;
  patientName: string;
  onClose: () => void;
  onSave: (updated: Partial<PatientRoutine>) => Promise<void>;
}

export const PatientRoutineModal: React.FC<PatientRoutineModalProps> = ({
  isOpen,
  routine,
  patientName,
  onClose,
  onSave,
}) => {
  const [wakeTime, setWakeTime] = useState(routine.wakeTime || '07:00');
  const [breakfastTime, setBreakfastTime] = useState(routine.breakfastTime || '08:00');
  const [lunchTime, setLunchTime] = useState(routine.lunchTime || '12:30');
  const [dinnerTime, setDinnerTime] = useState(routine.dinnerTime || '18:30');
  const [bedTime, setBedTime] = useState(routine.bedTime || '21:30');
  const [notes, setNotes] = useState(routine.notes || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await onSave({
        wakeTime,
        breakfastTime,
        lunchTime,
        dinnerTime,
        bedTime,
        notes,
      });
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to update routine');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="routine-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4"
    >
      <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <header className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-clinical-100 text-clinical-700">
              <Clock className="w-5 h-5" aria-hidden="true" />
            </div>
            <div>
              <h2 id="routine-modal-title" className="text-base font-bold text-slate-900">
                Patient Daily Routine Preferences
              </h2>
              <p className="text-xs text-slate-500">
                Customizing meal and sleep timing for {patientName}
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
              <AlertCircle className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}

          <p className="text-xs text-slate-600 leading-relaxed">
            The Circadian Coordinator computes meal-relative absorption windows and nocturnal fall-risk
            timing based on these daily baseline hours. Prescribed doses and frequencies remain unchanged.
          </p>

          <div className="grid grid-cols-2 gap-3.5 pt-1">
            <div>
              <label htmlFor="wake-time" className="block text-xs font-semibold text-slate-700 mb-1">
                Wake Time (Awakening)
              </label>
              <input
                id="wake-time"
                type="time"
                value={wakeTime}
                onChange={(e) => setWakeTime(e.target.value)}
                required
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-clinical-500 focus:border-clinical-500"
              />
              <span className="text-2xs text-slate-400">Used for fasted morning medications</span>
            </div>

            <div>
              <label htmlFor="breakfast-time" className="block text-xs font-semibold text-slate-700 mb-1">
                Breakfast Time
              </label>
              <input
                id="breakfast-time"
                type="time"
                value={breakfastTime}
                onChange={(e) => setBreakfastTime(e.target.value)}
                required
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-clinical-500 focus:border-clinical-500"
              />
              <span className="text-2xs text-slate-400">Diuretics &amp; morning meal agents</span>
            </div>

            <div>
              <label htmlFor="lunch-time" className="block text-xs font-semibold text-slate-700 mb-1">
                Lunch Time (Midday)
              </label>
              <input
                id="lunch-time"
                type="time"
                value={lunchTime}
                onChange={(e) => setLunchTime(e.target.value)}
                required
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-clinical-500 focus:border-clinical-500"
              />
              <span className="text-2xs text-slate-400">Separation slot for cations</span>
            </div>

            <div>
              <label htmlFor="dinner-time" className="block text-xs font-semibold text-slate-700 mb-1">
                Dinner Time (Evening)
              </label>
              <input
                id="dinner-time"
                type="time"
                value={dinnerTime}
                onChange={(e) => setDinnerTime(e.target.value)}
                required
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-clinical-500 focus:border-clinical-500"
              />
              <span className="text-2xs text-slate-400">Second dose for twice-daily meds</span>
            </div>
          </div>

          <div>
            <label htmlFor="bed-time" className="block text-xs font-semibold text-slate-700 mb-1">
              Bedtime (Night Sleep)
            </label>
            <input
              id="bed-time"
              type="time"
              value={bedTime}
              onChange={(e) => setBedTime(e.target.value)}
              required
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-clinical-500 focus:border-clinical-500"
            />
            <span className="text-2xs text-slate-400">Sedatives and short-acting statins (nocturia boundary)</span>
          </div>

          <div>
            <label htmlFor="routine-notes" className="block text-xs font-semibold text-slate-700 mb-1">
              Clinical Context / Dietary Notes (Optional)
            </label>
            <textarea
              id="routine-notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g., Patient prefers breakfast at 08:30 on weekends; assisted living dinner served promptly at 18:00."
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
              disabled={saving}
              className="px-4 py-2 text-xs font-semibold text-white bg-clinical-600 hover:bg-clinical-700 rounded-lg transition-colors flex items-center gap-1.5 shadow-xs disabled:opacity-50"
            >
              <Check className="w-4 h-4" aria-hidden="true" />
              <span>{saving ? 'Updating Schedule...' : 'Save & Recalculate'}</span>
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
};
