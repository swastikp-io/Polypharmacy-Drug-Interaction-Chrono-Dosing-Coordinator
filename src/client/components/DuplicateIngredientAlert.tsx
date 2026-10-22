import React from 'react';
import { AlertOctagon, Pill } from 'lucide-react';
import type { DuplicateIngredientGroup } from '../../shared/types.js';
import { VerificationBadge } from './VerificationBadge.js';

interface DuplicateIngredientAlertProps {
  duplicates: DuplicateIngredientGroup[];
  onSelectMedication?: (medicationId: string) => void;
}

export const DuplicateIngredientAlert: React.FC<DuplicateIngredientAlertProps> = ({
  duplicates,
  onSelectMedication,
}) => {
  if (!duplicates || duplicates.length === 0) {
    return (
      <div className="bg-white border border-[#E6E3E1] rounded-sm p-4 sm:p-5 flex items-center gap-3.5 shadow-editorial">
        <div className="w-9 h-9 rounded-sm bg-[#ECFDF5] border border-[#A7F3D0] flex items-center justify-center flex-shrink-0 text-[#059669]">
          <Pill className="w-5 h-5" aria-hidden="true" />
        </div>
        <div>
          <h4 className="font-bold text-sm text-[#171717]">No Duplicate Active Ingredients Detected</h4>
          <p className="text-xs text-[#777777] mt-0.5">
            Active and PRN orders do not share identical active pharmaceutical ingredients.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3.5">
      {duplicates.map((dup, index) => (
        <section
          key={`${dup.normalizedName}-${index}`}
          aria-labelledby={`dup-heading-${index}`}
          className="border border-[#FECACA] bg-[#FFFDF5] rounded-sm p-4 sm:p-5 shadow-editorial"
        >
          <div className="flex items-start gap-3.5">
            <div className="w-9 h-9 rounded-sm bg-[#FEE2E2] border border-[#FECACA] flex items-center justify-center flex-shrink-0 text-[#DC2626] mt-0.5">
              <AlertOctagon className="w-5 h-5" aria-hidden="true" />
            </div>

            <div className="flex-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 id={`dup-heading-${index}`} className="text-sm font-bold text-[#171717]">
                  DUPLICATE INGREDIENT HAZARD: &quot;{dup.ingredientName.toUpperCase()}&quot;
                </h4>
                <span className="inline-flex items-center px-2 py-0.5 rounded-sm text-[10px] font-bold uppercase tracking-wider bg-[#FEE2E2] text-[#991B1B] border border-[#FECACA]">
                  {dup.severity} Toxicity Risk
                </span>
              </div>

              <p className="mt-1.5 text-xs text-[#525252] leading-relaxed">
                {dup.clinicalRationale}
              </p>

              <div className="mt-3 bg-white border border-[#E6E3E1] rounded-sm p-3">
                <p className="text-[10px] font-bold text-[#777777] uppercase tracking-wider mb-2">
                  Co-prescribed products containing {dup.ingredientName} ({dup.totalMedicationCount} total):
                </p>
                <div className="divide-y divide-[#E6E3E1]">
                  {dup.medications.map((m) => (
                    <div
                      key={m.id}
                      className="py-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-[#171717]">{m.brand}</span>
                          <span className="text-[#777777] font-medium">({m.genericName})</span>
                          <span className="px-1.5 py-0.2 bg-[#FAF9F8] border border-[#E6E3E1] text-[#171717] rounded-sm font-mono text-[10px]">
                            {m.strength}
                          </span>
                        </div>
                        <div className="text-[#525252] mt-0.5 text-[11px]">
                          <span>Dose: <strong>{m.prescribedDose}</strong></span> • <span>Freq: {m.frequency}</span> • <span>Source: {m.source}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <VerificationBadge status={m.verificationStatus} size="sm" />
                        {onSelectMedication && (
                          <button
                            type="button"
                            onClick={() => onSelectMedication(m.id)}
                            className="text-[11px] font-semibold text-[#1747E8] hover:text-[#1238C7]"
                          >
                            View Order &rarr;
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>
      ))}
    </div>
  );
};
