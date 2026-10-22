import React, { useState } from 'react';
import { X } from 'lucide-react';
import type { Gender, Patient } from '../../shared/types.js';

interface PatientModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (patientData: any) => Promise<void>;
  initialData?: Patient | null;
}

export const PatientModal: React.FC<PatientModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialData,
}) => {
  const [mrn, setMrn] = useState(
    initialData?.mrn || `SYNTH-${Math.floor(10000 + Math.random() * 90000)}`
  );
  const [name, setName] = useState(initialData?.name || '');
  const [dateOfBirth, setDateOfBirth] = useState(initialData?.dateOfBirth || '1950-01-01');
  const [gender, setGender] = useState<Gender>(initialData?.gender || 'female');
  const [weightKg, setWeightKg] = useState(initialData?.weightKg?.toString() || '');
  const [heightCm, setHeightCm] = useState(initialData?.heightCm?.toString() || '');
  const [primaryPhysician, setPrimaryPhysician] = useState(
    initialData?.primaryPhysician || 'Dr. Robert Patel, MD'
  );
  const [careSetting, setCareSetting] = useState(
    initialData?.careSetting || 'Independent Living'
  );
  const [emergencyContact, setEmergencyContact] = useState(
    initialData?.emergencyContact || 'Family Member - (555) 000-0000'
  );
  const [notes, setNotes] = useState(initialData?.notes || '');
  const [actor, setActor] = useState('Clinical Intake Specialist');

  const [validationError, setValidationError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    if (!name.trim() || !mrn.trim() || !primaryPhysician.trim()) {
      setValidationError('Patient name, MRN, and primary physician are required.');
      return;
    }

    const wt = weightKg ? parseFloat(weightKg) : null;
    const ht = heightCm ? parseFloat(heightCm) : null;

    setIsSubmitting(true);
    try {
      await onSave({
        mrn: mrn.trim(),
        name: name.trim(),
        dateOfBirth,
        gender,
        weightKg: wt && !isNaN(wt) ? wt : null,
        heightCm: ht && !isNaN(ht) ? ht : null,
        primaryPhysician: primaryPhysician.trim(),
        careSetting: careSetting.trim(),
        emergencyContact: emergencyContact.trim(),
        notes: notes.trim() || null,
        actor: actor.trim() || 'Clinical Intake Specialist',
      });
      onClose();
    } catch (err: any) {
      setValidationError(err.message || 'Failed to save patient profile');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="patient-modal-title"
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4"
    >
      <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-lg w-full">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50 rounded-t-xl">
          <h3 id="patient-modal-title" className="text-base font-bold text-slate-900">
            {initialData ? 'Edit Synthetic Patient Profile' : 'Register New Synthetic Patient'}
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

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="pat-name" className="block text-xs font-semibold text-slate-700 mb-1">
                Full Name *
              </label>
              <input
                id="pat-name"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Eleanor Vance"
                className="w-full px-3 py-1.5 text-xs rounded border border-slate-300 focus:ring-2 focus:ring-clinical-500"
              />
            </div>

            <div>
              <label htmlFor="pat-mrn" className="block text-xs font-semibold text-slate-700 mb-1">
                Medical Record Number (MRN) *
              </label>
              <input
                id="pat-mrn"
                type="text"
                required
                value={mrn}
                onChange={(e) => setMrn(e.target.value)}
                className="w-full px-3 py-1.5 text-xs rounded border border-slate-300 focus:ring-2 focus:ring-clinical-500 font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label htmlFor="pat-dob" className="block text-xs font-semibold text-slate-700 mb-1">
                Date of Birth *
              </label>
              <input
                id="pat-dob"
                type="date"
                required
                value={dateOfBirth}
                onChange={(e) => setDateOfBirth(e.target.value)}
                className="w-full px-2 py-1.5 text-xs rounded border border-slate-300 focus:ring-2 focus:ring-clinical-500"
              />
            </div>

            <div>
              <label htmlFor="pat-gen" className="block text-xs font-semibold text-slate-700 mb-1">
                Gender *
              </label>
              <select
                id="pat-gen"
                value={gender}
                onChange={(e) => setGender(e.target.value as Gender)}
                className="w-full px-2 py-1.5 text-xs rounded border border-slate-300 bg-white focus:ring-2 focus:ring-clinical-500"
              >
                <option value="female">Female</option>
                <option value="male">Male</option>
                <option value="other">Other</option>
                <option value="unknown">Unknown</option>
              </select>
            </div>

            <div>
              <label htmlFor="pat-wt" className="block text-xs font-semibold text-slate-700 mb-1">
                Weight (kg)
              </label>
              <input
                id="pat-wt"
                type="number"
                step="0.1"
                value={weightKg}
                onChange={(e) => setWeightKg(e.target.value)}
                placeholder="e.g. 68.0"
                className="w-full px-2 py-1.5 text-xs rounded border border-slate-300 focus:ring-2 focus:ring-clinical-500"
              />
            </div>

            <div>
              <label htmlFor="pat-ht" className="block text-xs font-semibold text-slate-700 mb-1">
                Height (cm)
              </label>
              <input
                id="pat-ht"
                type="number"
                step="0.1"
                value={heightCm}
                onChange={(e) => setHeightCm(e.target.value)}
                placeholder="e.g. 162.0"
                className="w-full px-2 py-1.5 text-xs rounded border border-slate-300 focus:ring-2 focus:ring-clinical-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="pat-phys" className="block text-xs font-semibold text-slate-700 mb-1">
                Primary Physician *
              </label>
              <input
                id="pat-phys"
                type="text"
                required
                value={primaryPhysician}
                onChange={(e) => setPrimaryPhysician(e.target.value)}
                placeholder="Dr. Robert Patel, MD"
                className="w-full px-3 py-1.5 text-xs rounded border border-slate-300 focus:ring-2 focus:ring-clinical-500"
              />
            </div>

            <div>
              <label htmlFor="pat-care" className="block text-xs font-semibold text-slate-700 mb-1">
                Care Setting *
              </label>
              <input
                id="pat-care"
                type="text"
                required
                value={careSetting}
                onChange={(e) => setCareSetting(e.target.value)}
                placeholder="e.g. Assisted Living, Home"
                className="w-full px-3 py-1.5 text-xs rounded border border-slate-300 focus:ring-2 focus:ring-clinical-500"
              />
            </div>
          </div>

          <div>
            <label htmlFor="pat-contact" className="block text-xs font-semibold text-slate-700 mb-1">
              Emergency Contact *
            </label>
            <input
              id="pat-contact"
              type="text"
              required
              value={emergencyContact}
              onChange={(e) => setEmergencyContact(e.target.value)}
              placeholder="Name / Relationship - Phone Number"
              className="w-full px-3 py-1.5 text-xs rounded border border-slate-300 focus:ring-2 focus:ring-clinical-500"
            />
          </div>

          <div>
            <label htmlFor="pat-notes" className="block text-xs font-semibold text-slate-700 mb-1">
              Clinical Context / Geriatric Notes
            </label>
            <textarea
              id="pat-notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Polypharmacy focus, caregiver involvement, mobility status..."
              className="w-full px-3 py-1.5 text-xs rounded border border-slate-300 focus:ring-2 focus:ring-clinical-500"
            />
          </div>

          <div>
            <label htmlFor="pat-actor" className="block text-xs font-semibold text-slate-700 mb-1">
              Audited By (Actor)
            </label>
            <input
              id="pat-actor"
              type="text"
              value={actor}
              onChange={(e) => setActor(e.target.value)}
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
              {isSubmitting ? 'Saving...' : initialData ? 'Update Profile' : 'Create Profile'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
