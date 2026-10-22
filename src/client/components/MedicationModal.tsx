import React, { useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import type { ActiveIngredient, Medication, MedicationStatus, VerificationStatus } from '../../shared/types.js';

interface MedicationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (medData: any) => Promise<void>;
  patientId: string;
  initialData?: Medication | null;
}

export const MedicationModal: React.FC<MedicationModalProps> = ({
  isOpen,
  onClose,
  onSave,
  patientId,
  initialData,
}) => {
  const [brand, setBrand] = useState(initialData?.brand || '');
  const [genericName, setGenericName] = useState(initialData?.genericName || '');
  const [activeIngredients, setActiveIngredients] = useState<ActiveIngredient[]>(
    initialData?.activeIngredients && initialData.activeIngredients.length > 0
      ? initialData.activeIngredients
      : [{ name: '', strength: '' }]
  );
  const [salt, setSalt] = useState(initialData?.salt || 'Unknown');
  const [strength, setStrength] = useState(initialData?.strength || '');
  const [formulation, setFormulation] = useState(initialData?.formulation || 'Tablet');
  const [route, setRoute] = useState(initialData?.route || 'Oral');
  const [prescribedDose, setPrescribedDose] = useState(initialData?.prescribedDose || '');
  const [frequency, setFrequency] = useState(initialData?.frequency || 'Once daily');
  const [administrationInstructions, setAdministrationInstructions] = useState(
    initialData?.administrationInstructions || ''
  );
  const [prescriber, setPrescriber] = useState(initialData?.prescriber || 'Unknown');
  const [source, setSource] = useState(initialData?.source || 'Primary Care EHR');
  const [status, setStatus] = useState<MedicationStatus>(initialData?.status || 'active');
  const [verificationStatus, setVerificationStatus] = useState<VerificationStatus>(
    initialData?.verificationStatus || 'unverified'
  );
  const [startDate, setStartDate] = useState(initialData?.startDate || '');
  const [endDate, setEndDate] = useState(initialData?.endDate || '');
  const [indication, setIndication] = useState(initialData?.indication || '');
  const [actor, setActor] = useState('Clinical Pharmacist');

  const [validationError, setValidationError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleAddIngredient = () => {
    setActiveIngredients([...activeIngredients, { name: '', strength: '' }]);
  };

  const handleRemoveIngredient = (index: number) => {
    if (activeIngredients.length <= 1) return;
    setActiveIngredients(activeIngredients.filter((_, i) => i !== index));
  };

  const handleIngredientChange = (index: number, field: 'name' | 'strength', value: string) => {
    const updated = [...activeIngredients];
    updated[index] = { ...updated[index], [field]: value };
    setActiveIngredients(updated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    // Filter valid ingredients
    const cleanedIngredients = activeIngredients
      .map((i) => ({ name: i.name.trim(), strength: i.strength?.trim() || '' }))
      .filter((i) => i.name.length > 0);

    if (cleanedIngredients.length === 0) {
      setValidationError('At least one active ingredient name is required.');
      return;
    }

    if (!brand.trim() || !genericName.trim() || !prescribedDose.trim() || !frequency.trim()) {
      setValidationError('Please complete all required fields.');
      return;
    }

    setIsSubmitting(true);
    try {
      await onSave({
        patientId,
        brand: brand.trim(),
        genericName: genericName.trim(),
        activeIngredients: cleanedIngredients,
        salt: salt.trim() || 'Unknown',
        strength: strength.trim() || prescribedDose.trim(),
        formulation: formulation.trim(),
        route: route.trim(),
        prescribedDose: prescribedDose.trim(),
        frequency: frequency.trim(),
        administrationInstructions: administrationInstructions.trim() || 'Take as prescribed.',
        prescriber: prescriber.trim() || 'Unknown',
        source: source.trim() || 'Patient Self-Report',
        status,
        verificationStatus,
        startDate: startDate ? startDate : null,
        endDate: endDate ? endDate : null,
        indication: indication.trim() || null,
        actor: actor.trim() || 'Clinical Pharmacist',
      });
      onClose();
    } catch (err: any) {
      setValidationError(err.message || 'Failed to save medication');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="medication-modal-title"
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4"
    >
      <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-2xl w-full max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50 rounded-t-xl">
          <div>
            <h3 id="medication-modal-title" className="text-base font-bold text-slate-900">
              {initialData ? 'Edit Medication Order' : 'Record New Medication'}
            </h3>
            <p className="text-xs text-slate-500">
              Reconciliation requires granular pharmacological fields for interaction checking.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 focus:outline-none focus:ring-2 focus:ring-clinical-500"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {/* Content Form */}
        <form onSubmit={handleSubmit} className="p-5 overflow-y-auto space-y-4 flex-1">
          {validationError && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-800 rounded-lg text-xs">
              <strong>Error:</strong> {validationError}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="med-brand" className="block text-xs font-semibold text-slate-700 mb-1">
                Brand Name *
              </label>
              <input
                id="med-brand"
                type="text"
                required
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                placeholder="e.g. Tylenol Extra Strength"
                className="w-full px-3 py-1.5 text-xs rounded border border-slate-300 focus:ring-2 focus:ring-clinical-500 focus:border-clinical-500"
              />
            </div>

            <div>
              <label htmlFor="med-generic" className="block text-xs font-semibold text-slate-700 mb-1">
                Generic Name *
              </label>
              <input
                id="med-generic"
                type="text"
                required
                value={genericName}
                onChange={(e) => setGenericName(e.target.value)}
                placeholder="e.g. Acetaminophen"
                className="w-full px-3 py-1.5 text-xs rounded border border-slate-300 focus:ring-2 focus:ring-clinical-500 focus:border-clinical-500"
              />
            </div>
          </div>

          {/* Active Ingredients Section */}
          <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-800">
                Active Ingredient(s) &amp; Strength (Critical for Duplicate Detection) *
              </span>
              <button
                type="button"
                onClick={handleAddIngredient}
                className="inline-flex items-center gap-1 text-xs text-clinical-600 font-semibold hover:text-clinical-800"
              >
                <Plus className="w-3.5 h-3.5" aria-hidden="true" /> Add Co-Ingredient
              </button>
            </div>
            {activeIngredients.map((ing, idx) => (
              <div key={idx} className="flex items-center gap-2 mb-2">
                <input
                  type="text"
                  required
                  value={ing.name}
                  onChange={(e) => handleIngredientChange(idx, 'name', e.target.value)}
                  placeholder="Ingredient name (e.g. Acetaminophen)"
                  aria-label={`Ingredient ${idx + 1} name`}
                  className="flex-1 px-2.5 py-1 text-xs rounded border border-slate-300 focus:ring-1 focus:ring-clinical-500"
                />
                <input
                  type="text"
                  value={ing.strength || ''}
                  onChange={(e) => handleIngredientChange(idx, 'strength', e.target.value)}
                  placeholder="Strength (e.g. 500 mg)"
                  aria-label={`Ingredient ${idx + 1} strength`}
                  className="w-32 px-2.5 py-1 text-xs rounded border border-slate-300 focus:ring-1 focus:ring-clinical-500"
                />
                {activeIngredients.length > 1 && (
                  <button
                    type="button"
                    onClick={() => handleRemoveIngredient(idx)}
                    aria-label={`Remove ingredient ${idx + 1}`}
                    className="p-1 text-slate-400 hover:text-red-600 rounded"
                  >
                    <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Salt, Strength, Formulation, Route */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label htmlFor="med-salt" className="block text-xs font-semibold text-slate-700 mb-1">
                Salt Form
              </label>
              <input
                id="med-salt"
                type="text"
                value={salt}
                onChange={(e) => setSalt(e.target.value)}
                placeholder="e.g. Besylate, or Unknown"
                className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-300 focus:ring-2 focus:ring-clinical-500"
              />
            </div>

            <div>
              <label htmlFor="med-strength" className="block text-xs font-semibold text-slate-700 mb-1">
                Total Strength *
              </label>
              <input
                id="med-strength"
                type="text"
                required
                value={strength}
                onChange={(e) => setStrength(e.target.value)}
                placeholder="e.g. 500 mg"
                className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-300 focus:ring-2 focus:ring-clinical-500"
              />
            </div>

            <div>
              <label htmlFor="med-form" className="block text-xs font-semibold text-slate-700 mb-1">
                Formulation *
              </label>
              <input
                id="med-form"
                type="text"
                required
                value={formulation}
                onChange={(e) => setFormulation(e.target.value)}
                placeholder="Tablet, Capsule, Solution"
                className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-300 focus:ring-2 focus:ring-clinical-500"
              />
            </div>

            <div>
              <label htmlFor="med-route" className="block text-xs font-semibold text-slate-700 mb-1">
                Route *
              </label>
              <input
                id="med-route"
                type="text"
                required
                value={route}
                onChange={(e) => setRoute(e.target.value)}
                placeholder="Oral, Topical, SubQ"
                className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-300 focus:ring-2 focus:ring-clinical-500"
              />
            </div>
          </div>

          {/* Dose & Frequency */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="med-dose" className="block text-xs font-semibold text-slate-700 mb-1">
                Prescribed Dose *
              </label>
              <input
                id="med-dose"
                type="text"
                required
                value={prescribedDose}
                onChange={(e) => setPrescribedDose(e.target.value)}
                placeholder="e.g. 1 tablet (500 mg)"
                className="w-full px-3 py-1.5 text-xs rounded border border-slate-300 focus:ring-2 focus:ring-clinical-500"
              />
            </div>

            <div>
              <label htmlFor="med-freq" className="block text-xs font-semibold text-slate-700 mb-1">
                Frequency *
              </label>
              <input
                id="med-freq"
                type="text"
                required
                value={frequency}
                onChange={(e) => setFrequency(e.target.value)}
                placeholder="e.g. Twice daily with meals"
                className="w-full px-3 py-1.5 text-xs rounded border border-slate-300 focus:ring-2 focus:ring-clinical-500"
              />
            </div>
          </div>

          {/* Administration Instructions */}
          <div>
            <label htmlFor="med-instructions" className="block text-xs font-semibold text-slate-700 mb-1">
              Administration Instructions *
            </label>
            <textarea
              id="med-instructions"
              required
              rows={2}
              value={administrationInstructions}
              onChange={(e) => setAdministrationInstructions(e.target.value)}
              placeholder="e.g. Take with 8oz water. Separate from calcium supplements by 4 hours."
              className="w-full px-3 py-1.5 text-xs rounded border border-slate-300 focus:ring-2 focus:ring-clinical-500"
            />
          </div>

          {/* Prescriber & Source */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="med-prescriber" className="block text-xs font-semibold text-slate-700 mb-1">
                Prescriber *
              </label>
              <input
                id="med-prescriber"
                type="text"
                required
                value={prescriber}
                onChange={(e) => setPrescriber(e.target.value)}
                placeholder="e.g. Dr. Robert Patel, MD"
                className="w-full px-3 py-1.5 text-xs rounded border border-slate-300 focus:ring-2 focus:ring-clinical-500"
              />
            </div>

            <div>
              <label htmlFor="med-source" className="block text-xs font-semibold text-slate-700 mb-1">
                Source Document *
              </label>
              <input
                id="med-source"
                type="text"
                required
                value={source}
                onChange={(e) => setSource(e.target.value)}
                placeholder="e.g. Hospital Discharge, Pharmacy History, Self-Report"
                className="w-full px-3 py-1.5 text-xs rounded border border-slate-300 focus:ring-2 focus:ring-clinical-500"
              />
            </div>
          </div>

          {/* Dates & Indication */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label htmlFor="med-start-date" className="block text-xs font-semibold text-slate-700 mb-1">
                Start Date
              </label>
              <input
                id="med-start-date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-300 focus:ring-2 focus:ring-clinical-500"
              />
            </div>

            <div>
              <label htmlFor="med-end-date" className="block text-xs font-semibold text-slate-700 mb-1">
                End Date
              </label>
              <input
                id="med-end-date"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-300 focus:ring-2 focus:ring-clinical-500"
              />
            </div>

            <div>
              <label htmlFor="med-indication" className="block text-xs font-semibold text-slate-700 mb-1">
                Indication / Diagnosis
              </label>
              <input
                id="med-indication"
                type="text"
                value={indication}
                onChange={(e) => setIndication(e.target.value)}
                placeholder="e.g. Hypertension"
                className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-300 focus:ring-2 focus:ring-clinical-500"
              />
            </div>
          </div>

          {/* Status & Verification Status */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label htmlFor="med-status" className="block text-xs font-semibold text-slate-700 mb-1">
                Order Status
              </label>
              <select
                id="med-status"
                value={status}
                onChange={(e) => setStatus(e.target.value as MedicationStatus)}
                className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-300 bg-white focus:ring-2 focus:ring-clinical-500"
              >
                <option value="active">Active</option>
                <option value="prn">PRN (As Needed)</option>
                <option value="held">Held (Temporary)</option>
                <option value="discontinued">Discontinued</option>
              </select>
            </div>

            <div>
              <label htmlFor="med-verif" className="block text-xs font-semibold text-slate-700 mb-1">
                Verification State
              </label>
              <select
                id="med-verif"
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
              <label htmlFor="med-actor" className="block text-xs font-semibold text-slate-700 mb-1">
                Audited By (Actor)
              </label>
              <input
                id="med-actor"
                type="text"
                value={actor}
                onChange={(e) => setActor(e.target.value)}
                placeholder="Your Name / Role"
                className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-300 focus:ring-2 focus:ring-clinical-500"
              />
            </div>
          </div>
        </form>

        {/* Footer Actions */}
        <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-3 rounded-b-xl">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-400"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={handleSubmit}
            className="px-4 py-1.5 text-xs font-semibold text-white bg-clinical-600 rounded-lg hover:bg-clinical-700 focus:outline-none focus:ring-2 focus:ring-clinical-500 disabled:opacity-50"
          >
            {isSubmitting ? 'Saving...' : initialData ? 'Update Record' : 'Record Medication'}
          </button>
        </div>
      </div>
    </div>
  );
};
