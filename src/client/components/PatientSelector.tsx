import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Edit3, Plus, Users } from 'lucide-react';
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
  const [showMetadata, setShowMetadata] = useState(false);

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
  const isSynthetic = selectedPatient?.mrn?.startsWith('SYNTH-') ?? true;

  return (
    <section
      aria-label="Active Patient Context"
      className="bg-white border border-[#E6E3E1] rounded-sm shadow-editorial overflow-hidden"
    >
      {/* Top Patient Bar */}
      <div className="p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Left: Patient Identification & Switcher */}
        <div className="flex items-start sm:items-center gap-3.5">
          <div className="w-10 h-10 rounded-sm bg-[#F0F3FF] text-[#1747E8] border border-[#D7DEFF] flex items-center justify-center flex-shrink-0">
            <Users className="w-5 h-5" aria-hidden="true" />
          </div>

          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] uppercase font-bold tracking-wider text-[#777777]">
                Active Clinical Context
              </span>
              {isSynthetic && (
                <span className="inline-flex items-center px-1.5 py-0.2 rounded-sm text-[10px] font-bold uppercase tracking-wider bg-[#FEF3C7] text-[#92400E] border border-[#FDE68A]">
                  Synthetic / Test Profile
                </span>
              )}
            </div>

            <div className="flex items-center gap-2.5 flex-wrap">
              <div className="relative">
                <select
                  id="patient-dropdown"
                  value={selectedPatient?.id || ''}
                  onChange={(e) => onSelectPatient(e.target.value)}
                  aria-label="Switch active patient profile"
                  className="font-bold text-[#171717] text-base sm:text-lg border border-[#E6E3E1] rounded-sm px-2.5 py-1 bg-[#FAF9F8] hover:bg-white hover:border-[#1747E8] focus:border-[#1747E8] focus:ring-1 focus:ring-[#1747E8] cursor-pointer transition-colors"
                >
                  {patients.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({calculateAge(p.dateOfBirth)}y, {p.gender})
                    </option>
                  ))}
                </select>
              </div>

              {selectedPatient && (
                <button
                  type="button"
                  onClick={handleOpenEdit}
                  aria-label="Edit patient demographics"
                  title="Edit patient demographics"
                  className="p-1.5 text-[#525252] hover:text-[#1747E8] hover:bg-[#F0F3FF] rounded-sm transition-colors"
                >
                  <Edit3 className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Right: Quick Demographics & New Patient Action */}
        <div className="flex flex-wrap items-center gap-3">
          {selectedPatient && (
            <div className="flex items-center gap-4 text-xs text-[#525252] bg-[#FAF9F8] px-3 py-1.5 rounded-sm border border-[#E6E3E1]">
              <div>
                <span className="text-[#777777] block text-[10px] uppercase font-bold">Age / Sex</span>
                <span className="font-semibold text-[#171717]">{age}y • {selectedPatient.gender}</span>
              </div>
              <div className="border-l border-[#E6E3E1] pl-3">
                <span className="text-[#777777] block text-[10px] uppercase font-bold">Care Setting</span>
                <span className="font-semibold text-[#171717] truncate max-w-[140px] block" title={selectedPatient.careSetting}>
                  {selectedPatient.careSetting}
                </span>
              </div>
              <div className="border-l border-[#E6E3E1] pl-3">
                <span className="text-[#777777] block text-[10px] uppercase font-bold">Physician</span>
                <span className="font-semibold text-[#171717] truncate max-w-[130px] block" title={selectedPatient.primaryPhysician}>
                  {selectedPatient.primaryPhysician}
                </span>
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={handleOpenAdd}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#1747E8] bg-[#F0F3FF] border border-[#D7DEFF] hover:bg-[#D7DEFF] rounded-sm transition-colors"
          >
            <Plus className="w-3.5 h-3.5" aria-hidden="true" />
            <span>New Patient</span>
          </button>
        </div>
      </div>

      {/* Clinical Notes Summary & Expandable Metadata */}
      {selectedPatient && (
        <div className="px-4 py-2.5 bg-[#FAF9F8] border-t border-[#E6E3E1] flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
          <div className="flex-1 min-w-0">
            <span className="font-bold text-[#171717] mr-1.5">Clinical Focus:</span>
            <span className="text-[#525252] truncate inline-block max-w-2xl align-bottom" title={selectedPatient.notes || 'None'}>
              {selectedPatient.notes || 'Standard geriatric polypharmacy review.'}
            </span>
          </div>

          <button
            type="button"
            onClick={() => setShowMetadata(!showMetadata)}
            aria-expanded={showMetadata}
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#1747E8] hover:text-[#1238C7] flex-shrink-0"
          >
            <span>{showMetadata ? 'Hide Demographics' : 'More Demographics'}</span>
            {showMetadata ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        </div>
      )}

      {/* Expanded Technical Metadata */}
      {showMetadata && selectedPatient && (
        <div className="px-4 py-3 bg-white border-t border-[#E6E3E1] grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#777777] block">MRN</span>
            <span className="font-mono font-semibold text-[#171717]">{selectedPatient.mrn}</span>
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#777777] block">Date of Birth</span>
            <span className="font-medium text-[#171717] tabular-nums">{selectedPatient.dateOfBirth}</span>
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#777777] block">Weight / Height</span>
            <span className="font-medium text-[#171717]">
              {selectedPatient.weightKg ? `${selectedPatient.weightKg} kg` : 'Unknown'} •{' '}
              {selectedPatient.heightCm ? `${selectedPatient.heightCm} cm` : 'Unknown'}
            </span>
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#777777] block">Database Status</span>
            <span className="font-medium text-[#059669]">SQLite Active (Synchronized)</span>
          </div>
        </div>
      )}

      <PatientModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSave}
        initialData={isEditMode ? selectedPatient : null}
      />
    </section>
  );
};
