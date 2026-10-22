import React, { useState } from 'react';
import { Edit2, Plus, ShieldCheck, Trash2 } from 'lucide-react';
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
      <div className="bg-white p-4 rounded-sm border border-[#E6E3E1] shadow-editorial flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-[#171717]">Documented Allergies &amp; Adverse Drug Reactions</h3>
          <p className="text-xs text-[#777777] mt-0.5">
            Cross-referenced by Drug Interaction Agent against current prescribing orders.
          </p>
        </div>
        <button
          type="button"
          onClick={handleOpenAdd}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-[#1747E8] hover:bg-[#1238C7] rounded-sm shadow-editorial transition-colors"
        >
          <Plus className="w-4 h-4" aria-hidden="true" />
          <span>Add Allergy</span>
        </button>
      </div>

      {allergies.length === 0 ? (
        <div className="bg-white rounded-sm border border-[#E6E3E1] p-10 text-center pattern-dots-subtle shadow-editorial">
          <ShieldCheck className="w-8 h-8 mx-auto text-[#059669] mb-2" aria-hidden="true" />
          <h4 className="text-sm font-bold text-[#171717]">No Known Drug Allergies</h4>
          <p className="text-xs text-[#777777] mt-1">No hypersensitivities or adverse reactions currently documented.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {allergies.map((allergy) => {
            const isSevere =
              allergy.severity === 'severe' || allergy.severity === 'life-threatening';
            return (
              <article
                key={allergy.id}
                className={`bg-white rounded-sm border p-4 shadow-editorial space-y-2.5 transition-colors ${
                  isSevere ? 'border-[#FECACA] bg-[#FFFDF5]' : 'border-[#E6E3E1]'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-bold text-sm text-[#171717]">{allergy.allergen}</h4>
                      <span
                        className={`px-1.5 py-0.2 rounded-sm text-[10px] font-bold uppercase tracking-wider ${
                          isSevere
                            ? 'bg-[#FEE2E2] text-[#991B1B] border border-[#FECACA]'
                            : 'bg-[#FEF3C7] text-[#92400E] border border-[#FDE68A]'
                        }`}
                      >
                        {allergy.severity}
                      </span>
                      <VerificationBadge
                        status={allergy.verificationStatus}
                        size="sm"
                        interactive
                        onStatusChange={(nextStatus) => onUpdateVerification(allergy.id, nextStatus)}
                      />
                    </div>
                    <span className="text-[11px] text-[#777777] font-medium capitalize">
                      Category: {allergy.allergenType}
                    </span>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleOpenEdit(allergy)}
                      aria-label={`Edit ${allergy.allergen} allergy`}
                      className="p-1 text-[#525252] hover:text-[#1747E8] rounded-sm transition-colors"
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
                      aria-label={`Delete ${allergy.allergen} allergy`}
                      className="p-1 text-[#525252] hover:text-[#DC2626] rounded-sm transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  </div>
                </div>

                <div className="text-xs bg-[#FAF9F8] p-2.5 rounded-sm border border-[#E6E3E1] space-y-1">
                  <div>
                    <span className="font-semibold text-[#171717]">Manifestation: </span>
                    <span className="text-[#525252]">{allergy.reaction}</span>
                  </div>
                  {allergy.notes && (
                    <div className="text-[11px] text-[#777777]">
                      <strong>Clinical Notes:</strong> {allergy.notes}
                    </div>
                  )}
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
