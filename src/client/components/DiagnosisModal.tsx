import React, { useState } from 'react';
import { X } from 'lucide-react';
import type { ClinicalStatus, Diagnosis, VerificationStatus } from '../../shared/types.js';

interface DiagnosisModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (diagData: any) => Promise<void>;
  patientId: string;
  initialData?: Diagnosis | null;
}

export const DiagnosisModal: React.FC<DiagnosisModalProps> = ({
  isOpen,
  onClose,
  onSave,
  patientId,
  initialData,
}) => {
  const [condition, setCondition] = useState(initialData?.condition || '');
  const [code, setCode] = useState(initialData?.code || 'ICD-10 ');
  const [clinicalStatus, setClinicalStatus] = useState<ClinicalStatus>(
    initialData?.clinicalStatus || 'active'
  );
  const [verificationStatus, setVerificationStatus] = useState<VerificationStatus>(
    initialData?.verificationStatus || 'unverified'
  );
  const [onsetDate, setOnsetDate] = useState(initialData?.onsetDate || '');
  const [dateRecorded, setDateRecorded] = useState(
    initialData?.dateRecorded || new Date().toISOString().split('T')[0]
  );
  const [source, setSource] = useState(initialData?.source || 'Primary Care Problem List');
  const [notes, setNotes] = useState(initialData?.notes || '');
  const [actor, setActor] = useState('Clinical Pharmacist');

  const [validationError, setValidationError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    if (!condition.trim() || !code.trim() || !source.trim()) {
      setValidationError('Condition name, diagnostic code, and source are required.');
      return;
    }

    setIsSubmitting(true);
    try {
      await onSave({
        patientId,
        condition: condition.trim(),
        code: code.trim(),
        clinicalStatus,
        verificationStatus,
        onsetDate: onsetDate ? onsetDate : null,
        dateRecorded,
        source: source.trim(),
        notes: notes.trim() || null,
        actor: actor.trim() || 'Clinical Pharmacist',
      });
      onClose();
    } catch (err: any) {
      setValidationError(err.message || 'Failed to save diagnosis');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="diagnosis-modal-title"
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4"
    >
      <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-lg w-full">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50 rounded-t-xl">
          <h3 id="diagnosis-modal-title" className="text-base font-bold text-slate-900">
            {initialData ? 'Edit Diagnosis' : 'Add Diagnosis / Problem Entry'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {validationError && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-800 rounded-lg text-xs">
              <strong>Error:</strong> {validationError}
            </div>
          )}

          <div>
            <label htmlFor="diag-cond" className="block text-xs font-semibold text-slate-700 mb-1">
              Condition Name *
            </label>
            <input
              id="diag-cond"
              type="text"
              required
              value={condition}
              onChange={(e) => setCondition(e.target.value)}
              placeholder="e.g. Type 2 Diabetes Mellitus"
              className="w-full px-3 py-1.5 text-xs rounded border border-slate-300 focus:ring-2 focus:ring-clinical-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="diag-code" className="block text-xs font-semibold text-slate-700 mb-1">
                Diagnostic Code *
              </label>
              <input
                id="diag-code"
                type="text"
                required
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="e.g. ICD-10 E11.9"
                className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-300 focus:ring-2 focus:ring-clinical-500"
              />
            </div>

            <div>
              <label htmlFor="diag-status" className="block text-xs font-semibold text-slate-700 mb-1">
                Clinical Status
              </label>
              <select
                id="diag-status"
                value={clinicalStatus}
                onChange={(e) => setClinicalStatus(e.target.value as ClinicalStatus)}
                className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-300 bg-white focus:ring-2 focus:ring-clinical-500"
              >
                <option value="active">Active</option>
                <option value="resolved">Resolved</option>
                <option value="remission">Remission</option>
                <option value="unknown">Unknown</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="diag-onset" className="block text-xs font-semibold text-slate-700 mb-1">
                Onset Date
              </label>
              <input
                id="diag-onset"
                type="date"
                value={onsetDate}
                onChange={(e) => setOnsetDate(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-300 focus:ring-2 focus:ring-clinical-500"
              />
            </div>

            <div>
              <label htmlFor="diag-rec" className="block text-xs font-semibold text-slate-700 mb-1">
                Date Recorded *
              </label>
              <input
                id="diag-rec"
                type="date"
                required
                value={dateRecorded}
                onChange={(e) => setDateRecorded(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-300 focus:ring-2 focus:ring-clinical-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="diag-verif" className="block text-xs font-semibold text-slate-700 mb-1">
                Verification State
              </label>
              <select
                id="diag-verif"
                value={verificationStatus}
                onChange={(e) => setVerificationStatus(e.target.value as VerificationStatus)}
                className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-300 bg-white focus:ring-2 focus:ring-clinical-500"
              >
                <option value="unverified">Unverified</option>
                <option value="confirmed">Confirmed</option>
                <option value="unknown">Unknown</option>
              </select>
            </div>

            <div>
              <label htmlFor="diag-source" className="block text-xs font-semibold text-slate-700 mb-1">
                Source *
              </label>
              <input
                id="diag-source"
                type="text"
                required
                value={source}
                onChange={(e) => setSource(e.target.value)}
                placeholder="e.g. Primary Care EHR"
                className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-300 focus:ring-2 focus:ring-clinical-500"
              />
            </div>
          </div>

          <div>
            <label htmlFor="diag-actor" className="block text-xs font-semibold text-slate-700 mb-1">
              Audited By (Actor)
            </label>
            <input
              id="diag-actor"
              type="text"
              value={actor}
              onChange={(e) => setActor(e.target.value)}
              className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-300 focus:ring-2 focus:ring-clinical-500"
            />
          </div>

          <div>
            <label htmlFor="diag-notes" className="block text-xs font-semibold text-slate-700 mb-1">
              Clinical Notes
            </label>
            <textarea
              id="diag-notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Clinical context, staging, or monitoring notes..."
              className="w-full px-3 py-1.5 text-xs rounded border border-slate-300 focus:ring-2 focus:ring-clinical-500"
            />
          </div>

          <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-1.5 text-xs font-semibold text-white bg-clinical-600 rounded-lg hover:bg-clinical-700 disabled:opacity-50"
            >
              {isSubmitting ? 'Saving...' : initialData ? 'Update Record' : 'Save Diagnosis'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
