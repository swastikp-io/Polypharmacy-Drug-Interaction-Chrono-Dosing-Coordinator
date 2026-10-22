import React, { useState } from 'react';
import { AlertTriangle, Edit2, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import type { Allergy, VerificationStatus } from '../../shared/types.js';
import { AllergyModal } from './AllergyModal.js';
import { VerificationBadge } from './VerificationBadge.js';

interface AllergyListProps {
  allergies: Allergy[];
  patientId: string;
  onAddAllergy: (data: any) => Promise<void>;
  onUpdateAllergy: (id: string, data: any) => Promise<void>;
  onDeleteAllergy: (id: string) => Promise<void>;
  onUpdateVerification: (id: string, status: VerificationStatus) => Promise<void>;
}

export const AllergyList: React.FC<AllergyListProps> = ({
  allergies,
  patientId,
  onAddAllergy,
  onUpdateAllergy,
  onDeleteAllergy,
  onUpdateVerification,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAllergy, setEditingAllergy] = useState<Allergy | null>(null);

  const handleOpenAdd = () => {
    setEditingAllergy(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (allergy: Allergy) => {
    setEditingAllergy(allergy);
    setIsModalOpen(true);
  };

  const handleSave = async (data: any) => {
    if (editingAllergy) {
      await onUpdateAllergy(editingAllergy.id, data);
    } else {
      await onAddAllergy(data);
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-slate-900">Documented Allergies &amp; Adverse Drug Reactions</h3>
          <p className="text-xs text-slate-500">
            Cross-referenced by Drug Interaction Agent against current prescribing orders.
          </p>
        </div>
        <button
          type="button"
          onClick={handleOpenAdd}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-clinical-600 rounded-lg hover:bg-clinical-700 shadow-xs"
        >
          <Plus className="w-4 h-4" aria-hidden="true" />
          <span>Add Allergy</span>
        </button>
      </div>

      {allergies.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-500">
          <ShieldCheck className="w-8 h-8 mx-auto text-emerald-500 mb-2" aria-hidden="true" />
          <p className="text-sm font-semibold">No known drug allergies currently documented.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {allergies.map((allergy) => {
            const isSevere =
              allergy.severity === 'severe' || allergy.severity === 'life-threatening';
            return (
              <article
                key={allergy.id}
                className={`bg-white rounded-xl border p-4 shadow-xs space-y-2.5 ${
                  isSevere ? 'border-red-200 bg-red-50/20' : 'border-slate-200'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="p-1.5 bg-slate-100 rounded-md text-slate-700">
                      <AlertTriangle
                        className={`w-4 h-4 ${isSevere ? 'text-red-600' : 'text-amber-600'}`}
                        aria-hidden="true"
                      />
                    </span>
                    <div>
                      <h4 className="text-sm font-bold text-slate-900">{allergy.allergen}</h4>
                      <span className="text-2xs text-slate-500 uppercase tracking-wider font-semibold">
                        {allergy.allergenType} • Severity: {allergy.severity}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    <VerificationBadge
                      status={allergy.verificationStatus}
                      size="sm"
                      interactive
                      onStatusChange={(nextStatus) => onUpdateVerification(allergy.id, nextStatus)}
                    />
                    <button
                      type="button"
                      onClick={() => handleOpenEdit(allergy)}
                      aria-label={`Edit allergy for ${allergy.allergen}`}
                      className="p-1 text-slate-400 hover:text-clinical-700 rounded"
                    >
                      <Edit2 className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm(`Remove allergy record for ${allergy.allergen}?`)) {
                          onDeleteAllergy(allergy.id);
                        }
                      }}
                      aria-label={`Delete allergy for ${allergy.allergen}`}
                      className="p-1 text-slate-400 hover:text-red-600 rounded"
                    >
                      <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  </div>
                </div>

                <div className="text-xs bg-slate-50 p-2.5 rounded-lg border border-slate-100 text-slate-700">
                  <span className="font-semibold text-slate-900">Documented Reaction: </span>
                  {allergy.reaction}
                </div>

                {allergy.notes && (
                  <p className="text-xs text-slate-600 italic">&quot;{allergy.notes}&quot;</p>
                )}

                <div className="text-2xs text-slate-400 flex items-center justify-between pt-1 border-t border-slate-100">
                  <span>Source: {allergy.source}</span>
                  <span>Recorded: {allergy.dateRecorded}</span>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <AllergyModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSave}
        patientId={patientId}
        initialData={editingAllergy}
      />
    </div>
  );
};
