import React, { useState } from 'react';
import { Edit2, FlaskConical, Plus, Trash2 } from 'lucide-react';
import { calculateAge, calculateCockcroftGaultCrCl } from '../../shared/calculations.js';
import type { LabMeasurement, Patient, VerificationStatus } from '../../shared/types.js';
import { LabMeasurementModal } from './LabMeasurementModal.js';
import { VerificationBadge } from './VerificationBadge.js';

interface LabMeasurementListProps {
  labs: LabMeasurement[];
  patient: Patient;
  onAddLab: (data: any) => Promise<void>;
  onUpdateLab: (id: string, data: any) => Promise<void>;
  onDeleteLab: (id: string) => Promise<void>;
  onUpdateVerification: (id: string, status: VerificationStatus) => Promise<void>;
}

export const LabMeasurementList: React.FC<LabMeasurementListProps> = ({
  labs,
  patient,
  onAddLab,
  onUpdateLab,
  onDeleteLab,
  onUpdateVerification,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingLab, setEditingLab] = useState<LabMeasurement | null>(null);

  const handleOpenAdd = () => {
    setEditingLab(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (lab: LabMeasurement) => {
    setEditingLab(lab);
    setIsModalOpen(true);
  };

  const handleSave = async (data: any) => {
    if (editingLab) {
      await onUpdateLab(editingLab.id, data);
    } else {
      await onAddLab(data);
    }
  };

  // Cockcroft-Gault CrCl calculation if serum creatinine is present
  const scrLab = labs.find((l) => l.testName.toLowerCase().includes('creatinine'));

  let crcl: number | null = null;
  if (scrLab && patient.weightKg) {
    try {
      const age = calculateAge(patient.dateOfBirth);
      crcl = calculateCockcroftGaultCrCl({
        age,
        weightKg: patient.weightKg,
        serumCreatinineMgDl: scrLab.value,
        gender: patient.gender,
      });
    } catch {
      crcl = null;
    }
  }

  return (
    <div className="space-y-4">
      {/* Header Bar */}
      <div className="bg-white p-4 rounded-sm border border-[#E6E3E1] shadow-editorial flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-[#171717]">Renal &amp; Hepatic Laboratory Measurements</h3>
          <p className="text-xs text-[#777777] mt-0.5">
            Key pharmacokinetic organ biomarkers driving dosage reduction and nephrotoxicity warnings.
          </p>
        </div>
        <button
          type="button"
          onClick={handleOpenAdd}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-[#1747E8] hover:bg-[#1238C7] rounded-sm shadow-editorial transition-colors"
        >
          <Plus className="w-4 h-4" aria-hidden="true" />
          <span>Add Lab Result</span>
        </button>
      </div>

      {/* CrCl Calculated Banner if available */}
      {crcl !== null && (
        <div className="bg-[#FAF9F8] border border-[#E6E3E1] rounded-sm p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-editorial">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-sm bg-[#F0F3FF] border border-[#D7DEFF] flex items-center justify-center text-[#1747E8] flex-shrink-0">
              <FlaskConical className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-[#171717]">Calculated Creatinine Clearance (Cockcroft-Gault)</span>
                <span className="px-1.5 py-0.2 rounded-sm text-[10px] font-bold bg-[#D7DEFF] text-[#1747E8] border border-[#C0CEFF]">
                  Deterministic
                </span>
              </div>
              <p className="text-xs text-[#777777]">
                Derived from Serum Creatinine ({scrLab?.value} {scrLab?.unit}), Weight ({patient.weightKg} kg), and Age.
              </p>
            </div>
          </div>

          <div className="text-left sm:text-right">
            <div className="text-2xl font-bold text-[#1747E8] tabular-nums font-mono">
              {crcl} <span className="text-xs font-sans text-[#777777]">mL/min</span>
            </div>
            <div className="text-[11px] font-semibold text-[#525252]">
              {crcl < 30 ? (
                <span className="text-[#DC2626]">Severe Renal Impairment (&lt;30)</span>
              ) : crcl < 60 ? (
                <span className="text-[#B45309]">Moderate Renal Impairment (30-59)</span>
              ) : (
                <span className="text-[#059669]">Normal / Mild (&ge;60)</span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Lab Measurements Grid */}
      {labs.length === 0 ? (
        <div className="bg-white rounded-sm border border-[#E6E3E1] p-10 text-center pattern-dots-subtle shadow-editorial">
          <FlaskConical className="w-8 h-8 mx-auto text-[#777777] mb-2" aria-hidden="true" />
          <h4 className="text-sm font-bold text-[#171717]">No Lab Results Logged</h4>
          <p className="text-xs text-[#777777] mt-1">Add serum creatinine, eGFR, potassium, or ALT/AST measurements.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {labs.map((lab) => {
            const isAbnormal = lab.interpretation === 'high' || lab.interpretation === 'low' || lab.interpretation === 'critical';

            return (
              <article
                key={lab.id}
                className={`bg-white rounded-sm border p-4 shadow-editorial space-y-2.5 transition-colors ${
                  isAbnormal ? 'border-[#FDE68A] bg-[#FFFDF5]' : 'border-[#E6E3E1]'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <h4 className="font-bold text-sm text-[#171717]">{lab.testName}</h4>
                      {isAbnormal && (
                        <span className="px-1.5 py-0.2 rounded-sm text-[10px] font-bold bg-[#FEF3C7] text-[#92400E] border border-[#FDE68A] uppercase">
                          {lab.interpretation}
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-[#777777] uppercase font-semibold">
                      Category: {lab.category}
                    </span>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleOpenEdit(lab)}
                      aria-label={`Edit ${lab.testName}`}
                      className="p-1 text-[#525252] hover:text-[#1747E8] rounded-sm transition-colors"
                    >
                      <Edit2 className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm(`Remove lab result ${lab.testName}?`)) {
                          onDeleteLab(lab.id);
                        }
                      }}
                      aria-label={`Delete ${lab.testName}`}
                      className="p-1 text-[#525252] hover:text-[#DC2626] rounded-sm transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  </div>
                </div>

                <div className="p-3 bg-[#FAF9F8] rounded-sm border border-[#E6E3E1] flex items-baseline justify-between">
                  <div className="text-2xl font-bold text-[#171717] tabular-nums font-mono">
                    {lab.value} <span className="text-xs font-sans text-[#777777]">{lab.unit}</span>
                  </div>
                  {lab.referenceRange && (
                    <div className="text-[10px] text-[#777777] text-right">
                      Ref: {lab.referenceRange}
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between text-[11px] text-[#777777] pt-1 border-t border-[#E6E3E1]">
                  <span className="tabular-nums">Collected: {lab.collectionDate}</span>
                  <VerificationBadge
                    status={lab.verificationStatus}
                    size="sm"
                    interactive
                    onStatusChange={(nextStatus) => onUpdateVerification(lab.id, nextStatus)}
                  />
                </div>
              </article>
            );
          })}
        </div>
      )}

      <LabMeasurementModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSave}
        patientId={patient.id}
        initialData={editingLab}
      />
    </div>
  );
};
