import React, { useState } from 'react';
import { X } from 'lucide-react';
import type { Allergy, AllergySeverity, AllergyType, VerificationStatus } from '../../shared/types.js';

interface AllergyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (allergyData: any) => Promise<void>;
  patientId: string;
  initialData?: Allergy | null;
}

export const AllergyModal: React.FC<AllergyModalProps> = ({
  isOpen,
  onClose,
  onSave,
  patientId,
  initialData,
}) => {
  const [allergen, setAllergen] = useState(initialData?.allergen || '');
  const [allergenType, setAllergenType] = useState<AllergyType>(initialData?.allergenType || 'drug');
  const [reaction, setReaction] = useState(initialData?.reaction || '');
  const [severity, setSeverity] = useState<AllergySeverity>(initialData?.severity || 'moderate');
  const [verificationStatus, setVerificationStatus] = useState<VerificationStatus>(
    initialData?.verificationStatus || 'unverified'
  );
  const [dateRecorded, setDateRecorded] = useState(
    initialData?.dateRecorded || new Date().toISOString().split('T')[0]
  );
  const [source, setSource] = useState(initialData?.source || 'Patient Self-Report');
  const [notes, setNotes] = useState(initialData?.notes || '');
  const [actor, setActor] = useState('Clinical Pharmacist');

  const [validationError, setValidationError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    if (!allergen.trim() || !reaction.trim() || !source.trim()) {
      setValidationError('Allergen name, reaction description, and source are required.');
      return;
    }

    setIsSubmitting(true);
    try {
      await onSave({
        patientId,
        allergen: allergen.trim(),
        allergenType,
        reaction: reaction.trim(),
        severity,
        verificationStatus,
        dateRecorded,
        source: source.trim(),
        notes: notes.trim() || null,
        actor: actor.trim() || 'Clinical Pharmacist',
      });
      onClose();
    } catch (err: any) {
      setValidationError(err.message || 'Failed to save allergy');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="allergy-modal-title"
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4"
    >
      <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-lg w-full">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50 rounded-t-xl">
          <h3 id="allergy-modal-title" className="text-base font-bold text-slate-900">
            {initialData ? 'Edit Allergy Record' : 'Record Allergy / Adverse Reaction'}
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
            <label htmlFor="all-name" className="block text-xs font-semibold text-slate-700 mb-1">
              Allergen / Substance *
            </label>
            <input
              id="all-name"
              type="text"
              required
              value={allergen}
              onChange={(e) => setAllergen(e.target.value)}
              placeholder="e.g. Penicillin, Sulfa, Aspirin"
              className="w-full px-3 py-1.5 text-xs rounded border border-slate-300 focus:ring-2 focus:ring-clinical-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="all-type" className="block text-xs font-semibold text-slate-700 mb-1">
                Allergen Category
              </label>
              <select
                id="all-type"
                value={allergenType}
                onChange={(e) => setAllergenType(e.target.value as AllergyType)}
                className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-300 bg-white focus:ring-2 focus:ring-clinical-500"
              >
                <option value="drug">Medication / Drug</option>
                <option value="food">Food</option>
                <option value="environmental">Environmental</option>
                <option value="other">Other / NKDA</option>
              </select>
            </div>

            <div>
              <label htmlFor="all-sev" className="block text-xs font-semibold text-slate-700 mb-1">
                Clinical Severity
              </label>
              <select
                id="all-sev"
                value={severity}
                onChange={(e) => setSeverity(e.target.value as AllergySeverity)}
                className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-300 bg-white focus:ring-2 focus:ring-clinical-500"
              >
                <option value="mild">Mild (Localized rash/itching)</option>
                <option value="moderate">Moderate (Urticaria/vomiting)</option>
                <option value="severe">Severe (Bronchospasm/delirium)</option>
                <option value="life-threatening">Life-Threatening (Anaphylaxis)</option>
                <option value="unknown">Unknown</option>
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="all-react" className="block text-xs font-semibold text-slate-700 mb-1">
              Reaction Symptoms *
            </label>
            <input
              id="all-react"
              type="text"
              required
              value={reaction}
              onChange={(e) => setReaction(e.target.value)}
              placeholder="e.g. Anaphylaxis, facial angioedema, generalized rash"
              className="w-full px-3 py-1.5 text-xs rounded border border-slate-300 focus:ring-2 focus:ring-clinical-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="all-date" className="block text-xs font-semibold text-slate-700 mb-1">
                Date Recorded *
              </label>
              <input
                id="all-date"
                type="date"
                required
                value={dateRecorded}
                onChange={(e) => setDateRecorded(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-300 focus:ring-2 focus:ring-clinical-500"
              />
            </div>

            <div>
              <label htmlFor="all-source" className="block text-xs font-semibold text-slate-700 mb-1">
                Source *
              </label>
              <input
                id="all-source"
                type="text"
                required
                value={source}
                onChange={(e) => setSource(e.target.value)}
                placeholder="e.g. Inpatient Hospital Record"
                className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-300 focus:ring-2 focus:ring-clinical-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="all-verif" className="block text-xs font-semibold text-slate-700 mb-1">
                Verification Status
              </label>
              <select
                id="all-verif"
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
              <label htmlFor="all-actor" className="block text-xs font-semibold text-slate-700 mb-1">
                Audited By (Actor)
              </label>
              <input
                id="all-actor"
                type="text"
                value={actor}
                onChange={(e) => setActor(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-300 focus:ring-2 focus:ring-clinical-500"
              />
            </div>
          </div>

          <div>
            <label htmlFor="all-notes" className="block text-xs font-semibold text-slate-700 mb-1">
              Clinical Notes
            </label>
            <textarea
              id="all-notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Additional history or cross-reactivity notes..."
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
              {isSubmitting ? 'Saving...' : initialData ? 'Update Record' : 'Save Allergy'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
