import React, { useState } from 'react';
import { Edit3, Plus, Users } from 'lucide-react';
import { calculateAge } from '../../shared/calculations.js';
import type { Patient } from '../../shared/types.js';
import { PatientModal } from './PatientModal.js';

interface PatientSelectorProps {
  patients: Patient[];
  selectedPatient: Patient | null;
  onSelectPatient: (patientId: string) => void;
  onAddPatient: (data: any) => Promise<void>;
  onUpdatePatient: (id: string, data: any) => Promise<void>;
}

export const PatientSelector: React.FC<PatientSelectorProps> = ({
  patients,
  selectedPatient,
  onSelectPatient,
  onAddPatient,
  onUpdatePatient,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);

  const handleOpenAdd = () => {
    setIsEditMode(false);
    setIsModalOpen(true);
  };

  const handleOpenEdit = () => {
    setIsEditMode(true);
    setIsModalOpen(true);
  };

  const handleSave = async (data: any) => {
    if (isEditMode && selectedPatient) {
      await onUpdatePatient(selectedPatient.id, data);
    } else {
      await onAddPatient(data);
    }
  };

  const age = selectedPatient ? calculateAge(selectedPatient.dateOfBirth) : 0;

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-4 sm:p-5">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Switcher Dropdown */}
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-clinical-50 text-clinical-700 rounded-xl border border-clinical-100 flex-shrink-0">
            <Users className="w-5 h-5" aria-hidden="true" />
          </div>

          <div>
            <label htmlFor="patient-dropdown" className="text-2xs uppercase tracking-wider font-bold text-slate-500 block mb-0.5">
              Active Patient Profile (Synthetic)
            </label>
            <div className="flex items-center gap-2">
              <select
                id="patient-dropdown"
                value={selectedPatient?.id || ''}
                onChange={(e) => onSelectPatient(e.target.value)}
                className="font-bold text-slate-900 text-sm sm:text-base border border-slate-300 rounded-lg px-3 py-1 bg-slate-50 hover:bg-slate-100 focus:ring-2 focus:ring-clinical-500 focus:outline-none"
              >
                {patients.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({calculateAge(p.dateOfBirth)}y, {p.gender}) — {p.mrn}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={handleOpenEdit}
                aria-label="Edit active patient demographics"
                title="Edit demographics"
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <Edit3 className="w-4 h-4" aria-hidden="true" />
              </button>

              {selectedPatient?.mrn.startsWith('SYNTH-') && (
                <span className="inline-flex items-center px-2 py-0.5 rounded text-3xs font-black uppercase tracking-wider bg-amber-100 text-amber-900 border border-amber-300">
                  SYNTHETIC / TEST DATA
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Quick Add Button */}
        <div>
          <button
            type="button"
            onClick={handleOpenAdd}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-clinical-700 bg-clinical-50 border border-clinical-200 rounded-lg hover:bg-clinical-100 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" aria-hidden="true" />
            <span>New Patient Profile</span>
          </button>
        </div>
      </div>

      {/* Patient Demographics Strip */}
      {selectedPatient && (
        <div className="mt-4 pt-3.5 border-t border-slate-100 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
          <div>
            <span className="text-2xs uppercase tracking-wider text-slate-400 block font-semibold">MRN</span>
            <span className="font-mono font-bold text-slate-800">{selectedPatient.mrn}</span>
          </div>

          <div>
            <span className="text-2xs uppercase tracking-wider text-slate-400 block font-semibold">Age / Sex</span>
            <span className="font-semibold text-slate-800 capitalize">
              {age} years • {selectedPatient.gender}
            </span>
          </div>

          <div>
            <span className="text-2xs uppercase tracking-wider text-slate-400 block font-semibold">DOB</span>
            <span className="font-medium text-slate-800">{selectedPatient.dateOfBirth}</span>
          </div>

          <div>
            <span className="text-2xs uppercase tracking-wider text-slate-400 block font-semibold">Weight / Height</span>
            <span className="font-medium text-slate-800">
              {selectedPatient.weightKg ? `${selectedPatient.weightKg} kg` : 'Unknown'} •{' '}
              {selectedPatient.heightCm ? `${selectedPatient.heightCm} cm` : 'Unknown'}
            </span>
          </div>

          <div className="col-span-2 sm:col-span-1 lg:col-span-2">
            <span className="text-2xs uppercase tracking-wider text-slate-400 block font-semibold">Care Setting &amp; MD</span>
            <span className="font-medium text-slate-800 truncate block" title={`${selectedPatient.careSetting} | ${selectedPatient.primaryPhysician}`}>
              {selectedPatient.careSetting}
            </span>
          </div>
        </div>
      )}

      {selectedPatient?.notes && (
        <div className="mt-2.5 text-2xs bg-slate-50 p-2 rounded border border-slate-100 text-slate-600">
          <strong className="text-slate-700">Clinical Focus:</strong> {selectedPatient.notes}
        </div>
      )}

      <PatientModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSave}
        initialData={isEditMode ? selectedPatient : null}
      />
    </div>
  );
};
