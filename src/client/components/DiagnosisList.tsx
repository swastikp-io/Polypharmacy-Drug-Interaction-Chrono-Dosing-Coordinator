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
  const [editingDiag, setEditingDiag] = useState<Diagnosis | null>(null);

  const handleOpenAdd = () => {
    setEditingDiag(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (diag: Diagnosis) => {
    setEditingDiag(diag);
    setIsModalOpen(true);
  };

  const handleSave = async (data: any) => {
    if (editingDiag) {
      await onUpdateDiagnosis(editingDiag.id, data);
    } else {
      await onAddDiagnosis(data);
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-slate-900">Active Diagnoses &amp; Chronic Problem List</h3>
          <p className="text-xs text-slate-500">
            Used to evaluate contraindications, Beers Criteria, and organ-clearance dosing thresholds.
          </p>
        </div>
        <button
          type="button"
          onClick={handleOpenAdd}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-clinical-600 rounded-lg hover:bg-clinical-700 shadow-xs"
        >
          <Plus className="w-4 h-4" aria-hidden="true" />
          <span>Add Diagnosis</span>
        </button>
      </div>

      {diagnoses.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-500">
          <Activity className="w-8 h-8 mx-auto text-slate-300 mb-2" aria-hidden="true" />
          <p className="text-sm font-semibold">No medical diagnoses recorded for this patient.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {diagnoses.map((diag) => (
            <article
              key={diag.id}
              className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs space-y-2.5"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="p-1.5 bg-clinical-50 text-clinical-700 rounded-md">
                    <Activity className="w-4 h-4" aria-hidden="true" />
                  </span>
                  <div>
                    <h4 className="text-sm font-bold text-slate-900">{diag.condition}</h4>
                    <span className="text-2xs font-mono bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded">
                      {diag.code}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  <VerificationBadge
                    status={diag.verificationStatus}
                    size="sm"
                    interactive
                    onStatusChange={(nextStatus) => onUpdateVerification(diag.id, nextStatus)}
                  />
                  <button
                    type="button"
                    onClick={() => handleOpenEdit(diag)}
                    aria-label={`Edit ${diag.condition}`}
                    className="p-1 text-slate-400 hover:text-clinical-700 rounded"
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
                    className="p-1 text-slate-400 hover:text-red-600 rounded"
                  >
                    <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                </div>
              </div>

              {diag.notes && (
                <div className="text-xs bg-slate-50 p-2.5 rounded-lg border border-slate-100 text-slate-700">
                  {diag.notes}
                </div>
              )}

              <div className="text-2xs text-slate-400 flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-100">
                <span>Status: <strong className="capitalize text-slate-600">{diag.clinicalStatus}</strong></span>
                {diag.onsetDate && <span>Onset: {diag.onsetDate}</span>}
                <span>Source: {diag.source}</span>
              </div>
            </article>
          ))}
        </div>
      )}

      <DiagnosisModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSave}
        patientId={patientId}
        initialData={editingDiag}
      />
    </div>
  );
};
