import React, { useState } from 'react';
import { X } from 'lucide-react';
import type { LabCategory, LabInterpretation, LabMeasurement, VerificationStatus } from '../../shared/types.js';

interface LabMeasurementModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (labData: any) => Promise<void>;
  patientId: string;
  initialData?: LabMeasurement | null;
}

export const LabMeasurementModal: React.FC<LabMeasurementModalProps> = ({
  isOpen,
  onClose,
  onSave,
  patientId,
  initialData,
}) => {
  const [testName, setTestName] = useState(initialData?.testName || 'eGFR (CKD-EPI 2021)');
  const [category, setCategory] = useState<LabCategory>(initialData?.category || 'renal');
  const [value, setValue] = useState(initialData?.value?.toString() || '');
  const [unit, setUnit] = useState(initialData?.unit || 'mL/min/1.73m²');
  const [referenceRange, setReferenceRange] = useState(initialData?.referenceRange || '> 60 mL/min/1.73m²');
  const [interpretation, setInterpretation] = useState<LabInterpretation>(
    initialData?.interpretation || 'normal'
  );
  const [collectionDate, setCollectionDate] = useState(
    initialData?.collectionDate || new Date().toISOString().split('T')[0]
  );
  const [verificationStatus, setVerificationStatus] = useState<VerificationStatus>(
    initialData?.verificationStatus || 'unverified'
  );
  const [source, setSource] = useState(initialData?.source || 'Hospital Outpatient Lab');
  const [notes, setNotes] = useState(initialData?.notes || '');
  const [actor, setActor] = useState('Clinical Pharmacist');

  const [validationError, setValidationError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleTestPreset = (preset: string) => {
    switch (preset) {
      case 'egfr':
        setTestName('eGFR (CKD-EPI 2021)');
        setCategory('renal');
        setUnit('mL/min/1.73m²');
        setReferenceRange('> 60 mL/min/1.73m²');
        break;
      case 'cr':
        setTestName('Serum Creatinine');
        setCategory('renal');
        setUnit('mg/dL');
        setReferenceRange('0.60 - 1.20 mg/dL');
        break;
      case 'bun':
        setTestName('Blood Urea Nitrogen (BUN)');
        setCategory('renal');
        setUnit('mg/dL');
        setReferenceRange('7.0 - 20.0 mg/dL');
        break;
      case 'alt':
        setTestName('Alanine Aminotransferase (ALT)');
        setCategory('hepatic');
        setUnit('U/L');
        setReferenceRange('7.0 - 35.0 U/L');
        break;
      case 'ast':
        setTestName('Aspartate Aminotransferase (AST)');
        setCategory('hepatic');
        setUnit('U/L');
        setReferenceRange('8.0 - 35.0 U/L');
        break;
      case 'bili':
        setTestName('Total Bilirubin');
        setCategory('hepatic');
        setUnit('mg/dL');
        setReferenceRange('0.2 - 1.2 mg/dL');
        break;
      case 'alb':
        setTestName('Serum Albumin');
        setCategory('hepatic');
        setUnit('g/dL');
        setReferenceRange('3.5 - 5.0 g/dL');
        break;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    const numValue = parseFloat(value);
    if (isNaN(numValue)) {
      setValidationError('Measurement value must be a valid number.');
      return;
    }

    if (!testName.trim() || !unit.trim() || !source.trim()) {
      setValidationError('Test name, unit, and source are required.');
      return;
    }

    setIsSubmitting(true);
    try {
      await onSave({
        patientId,
        testName: testName.trim(),
        category,
        value: numValue,
        unit: unit.trim(),
        referenceRange: referenceRange.trim(),
        interpretation,
        collectionDate,
        verificationStatus,
        source: source.trim(),
        notes: notes.trim() || null,
        actor: actor.trim() || 'Clinical Pharmacist',
      });
      onClose();
    } catch (err: any) {
      setValidationError(err.message || 'Failed to save lab measurement');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="lab-modal-title"
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4"
    >
      <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-lg w-full">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50 rounded-t-xl">
          <h3 id="lab-modal-title" className="text-base font-bold text-slate-900">
            {initialData ? 'Edit Lab Measurement' : 'Record Renal / Hepatic Measurement'}
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

          {/* Quick presets */}
          <div>
            <span className="block text-2xs uppercase font-bold text-slate-400 mb-1 tracking-wider">
              Quick Test Presets
            </span>
            <div className="flex flex-wrap gap-1.5">
              {[
                { label: 'eGFR', key: 'egfr' },
                { label: 'Creatinine', key: 'cr' },
                { label: 'BUN', key: 'bun' },
                { label: 'ALT', key: 'alt' },
                { label: 'AST', key: 'ast' },
                { label: 'Bilirubin', key: 'bili' },
                { label: 'Albumin', key: 'alb' },
              ].map((p) => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => handleTestPreset(p.key)}
                  className="px-2 py-0.5 bg-slate-100 hover:bg-clinical-100 hover:text-clinical-800 text-slate-700 text-xs rounded border border-slate-200 transition-colors"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="lab-name" className="block text-xs font-semibold text-slate-700 mb-1">
                Test Name *
              </label>
              <input
                id="lab-name"
                type="text"
                required
                value={testName}
                onChange={(e) => setTestName(e.target.value)}
                placeholder="e.g. eGFR, Serum Creatinine"
                className="w-full px-3 py-1.5 text-xs rounded border border-slate-300 focus:ring-2 focus:ring-clinical-500"
              />
            </div>

            <div>
              <label htmlFor="lab-cat" className="block text-xs font-semibold text-slate-700 mb-1">
                Organ System *
              </label>
              <select
                id="lab-cat"
                value={category}
                onChange={(e) => setCategory(e.target.value as LabCategory)}
                className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-300 bg-white focus:ring-2 focus:ring-clinical-500"
              >
                <option value="renal">Renal (Kidney)</option>
                <option value="hepatic">Hepatic (Liver)</option>
                <option value="other">Other Metabolic</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label htmlFor="lab-val" className="block text-xs font-semibold text-slate-700 mb-1">
                Value *
              </label>
              <input
                id="lab-val"
                type="number"
                step="any"
                required
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="e.g. 42.0"
                className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-300 focus:ring-2 focus:ring-clinical-500"
              />
            </div>

            <div>
              <label htmlFor="lab-unit" className="block text-xs font-semibold text-slate-700 mb-1">
                Units *
              </label>
              <input
                id="lab-unit"
                type="text"
                required
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder="mL/min, mg/dL"
                className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-300 focus:ring-2 focus:ring-clinical-500"
              />
            </div>

            <div>
              <label htmlFor="lab-interp" className="block text-xs font-semibold text-slate-700 mb-1">
                Interpretation
              </label>
              <select
                id="lab-interp"
                value={interpretation}
                onChange={(e) => setInterpretation(e.target.value as LabInterpretation)}
                className="w-full px-2 py-1.5 text-xs rounded border border-slate-300 bg-white focus:ring-2 focus:ring-clinical-500"
              >
                <option value="normal">Normal</option>
                <option value="low">Low</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
                <option value="unknown">Unknown</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="lab-ref" className="block text-xs font-semibold text-slate-700 mb-1">
                Reference Range *
              </label>
              <input
                id="lab-ref"
                type="text"
                required
                value={referenceRange}
                onChange={(e) => setReferenceRange(e.target.value)}
                placeholder="e.g. > 60 mL/min/1.73m²"
                className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-300 focus:ring-2 focus:ring-clinical-500"
              />
            </div>

            <div>
              <label htmlFor="lab-date" className="block text-xs font-semibold text-slate-700 mb-1">
                Collection Date *
              </label>
              <input
                id="lab-date"
                type="date"
                required
                value={collectionDate}
                onChange={(e) => setCollectionDate(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-300 focus:ring-2 focus:ring-clinical-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="lab-verif" className="block text-xs font-semibold text-slate-700 mb-1">
                Verification State
              </label>
              <select
                id="lab-verif"
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
              <label htmlFor="lab-source" className="block text-xs font-semibold text-slate-700 mb-1">
                Source *
              </label>
              <input
                id="lab-source"
                type="text"
                required
                value={source}
                onChange={(e) => setSource(e.target.value)}
                placeholder="e.g. Outpatient Lab Panel"
                className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-300 focus:ring-2 focus:ring-clinical-500"
              />
            </div>
          </div>

          <div>
            <label htmlFor="lab-actor" className="block text-xs font-semibold text-slate-700 mb-1">
              Audited By (Actor)
            </label>
            <input
              id="lab-actor"
              type="text"
              value={actor}
              onChange={(e) => setActor(e.target.value)}
              className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-300 focus:ring-2 focus:ring-clinical-500"
            />
          </div>

          <div>
            <label htmlFor="lab-notes" className="block text-xs font-semibold text-slate-700 mb-1">
              Clinical Context / Method Notes
            </label>
            <textarea
              id="lab-notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Non-fasted draw, CKD-EPI equation utilized..."
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
              {isSubmitting ? 'Saving...' : initialData ? 'Update Record' : 'Record Measurement'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
