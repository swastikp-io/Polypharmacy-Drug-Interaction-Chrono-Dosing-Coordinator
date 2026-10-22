import React, { useState } from 'react';
import { Activity, Edit2, Plus, Trash2 } from 'lucide-react';
import type { Diagnosis, VerificationStatus } from '../../shared/types.js';
import { DiagnosisModal } from './DiagnosisModal.js';
import { VerificationBadge } from './VerificationBadge.js';

interface DiagnosisListProps {
  diagnoses: Diagnosis[];
  patientId: string;
  onAddDiagnosis: (data: any) => Promise<void>;
  onUpdateDiagnosis: (id: string, data: any) => Promise<void>;
  onDeleteDiagnosis: (id: string) => Promise<void>;
  onUpdateVerification: (id: string, status: VerificationStatus) => Promise<void>;
}

export const DiagnosisList: React.FC<DiagnosisListProps> = ({
  diagnoses,
  patientId,
  onAddDiagnosis,
  onUpdateDiagnosis,
  onDeleteDiagnosis,
  onUpdateVerification,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingDiagnosis, setEditingDiagnosis] = useState<Diagnosis | null>(null);

  const handleOpenAdd = () => {
    setEditingDiagnosis(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (diag: Diagnosis) => {
    setEditingDiagnosis(diag);
    setIsModalOpen(true);
  };

  const handleSave = async (data: any) => {
    if (editingDiagnosis) {
      await onUpdateDiagnosis(editingDiagnosis.id, data);
    } else {
      await onAddDiagnosis(data);
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-white p-4 rounded-sm border border-[#E6E3E1] shadow-editorial flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-[#171717]">Problem List &amp; Active Diagnoses</h3>
          <p className="text-xs text-[#777777] mt-0.5">
            Active and chronic conditions cross-referenced against drug-disease contraindications.
          </p>
        </div>
        <button
          type="button"
          onClick={handleOpenAdd}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-[#1747E8] hover:bg-[#1238C7] rounded-sm shadow-editorial transition-colors"
        >
          <Plus className="w-4 h-4" aria-hidden="true" />
          <span>Add Diagnosis</span>
        </button>
      </div>

      {diagnoses.length === 0 ? (
        <div className="bg-white rounded-sm border border-[#E6E3E1] p-10 text-center pattern-dots-subtle shadow-editorial">
          <Activity className="w-8 h-8 mx-auto text-[#777777] mb-2" aria-hidden="true" />
          <h4 className="text-sm font-bold text-[#171717]">No Diagnoses Documented</h4>
          <p className="text-xs text-[#777777] mt-1">Add medical conditions to verify drug-disease contraindications.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {diagnoses.map((diag) => (
            <article
              key={diag.id}
              className="bg-white rounded-sm border border-[#E6E3E1] p-4 shadow-editorial space-y-2.5 transition-colors hover:border-[#1747E8]"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="font-bold text-sm text-[#171717]">{diag.condition}</h4>
                    {diag.code && (
                      <span className="px-1.5 py-0.2 rounded-sm text-[10px] font-mono font-bold bg-[#FAF9F8] text-[#525252] border border-[#E6E3E1]">
                        Code: {diag.code}
                      </span>
                    )}
                    <VerificationBadge
                      status={diag.verificationStatus}
                      size="sm"
                      interactive
                      onStatusChange={(nextStatus) => onUpdateVerification(diag.id, nextStatus)}
                    />
                  </div>
                  <span className="text-[11px] text-[#777777] capitalize">
                    Status: <strong className="text-[#171717]">{diag.clinicalStatus}</strong>
                    {diag.onsetDate && ` • Onset: ${diag.onsetDate}`}
                  </span>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => handleOpenEdit(diag)}
                    aria-label={`Edit ${diag.condition}`}
                    className="p-1 text-[#525252] hover:text-[#1747E8] rounded-sm transition-colors"
                  >
                    <Edit2 className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm(`Remove diagnosis ${diag.condition}?`)) {
                        onDeleteDiagnosis(diag.id);
                      }
                    }}
                    aria-label={`Delete ${diag.condition}`}
                    className="p-1 text-[#525252] hover:text-[#DC2626] rounded-sm transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                </div>
              </div>

              {diag.notes && (
                <div className="text-xs bg-[#FAF9F8] p-2 rounded-sm border border-[#E6E3E1] text-[#525252]">
                  <strong className="text-[#171717]">Notes:</strong> {diag.notes}
                </div>
              )}
            </article>
          ))}
        </div>
      )}

      <DiagnosisModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSave}
        patientId={patientId}
        initialData={editingDiagnosis}
      />
    </div>
  );
};
