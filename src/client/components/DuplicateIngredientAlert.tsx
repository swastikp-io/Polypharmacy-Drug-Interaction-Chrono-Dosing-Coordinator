import React from 'react';
import { AlertOctagon, Info, Pill } from 'lucide-react';
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
      <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 flex items-center gap-3 text-emerald-800">
        <div className="p-2 bg-emerald-100 rounded-full flex-shrink-0">
          <Pill className="w-5 h-5 text-emerald-600" aria-hidden="true" />
        </div>
        <div>
          <h4 className="font-semibold text-sm">No Duplicate Ingredients Detected</h4>
          <p className="text-xs text-emerald-700">
            Active and PRN medications do not share identical active pharmaceutical ingredients.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {duplicates.map((dup, index) => (
        <section
          key={`${dup.normalizedName}-${index}`}
          aria-labelledby={`dup-heading-${index}`}
          className="border-2 border-red-300 bg-red-50/70 rounded-xl p-4 sm:p-5 shadow-sm"
        >
          <div className="flex items-start gap-3.5">
            <div className="p-2 bg-red-100 border border-red-200 rounded-lg flex-shrink-0 mt-0.5">
              <AlertOctagon className="w-6 h-6 text-red-600" aria-hidden="true" />
            </div>

            <div className="flex-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 id={`dup-heading-${index}`} className="text-base font-bold text-red-950">
                  DUPLICATE INGREDIENT HAZARD: &quot;{dup.ingredientName.toUpperCase()}&quot;
                </h4>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-red-200 text-red-900 border border-red-300">
                  {dup.severity} Toxicity Risk
                </span>
              </div>

              <p className="mt-2 text-sm text-red-900 font-medium leading-relaxed">
                {dup.clinicalRationale}
              </p>

              <div className="mt-4 bg-white/90 border border-red-200 rounded-lg p-3">
                <p className="text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
                  Co-prescribed products containing {dup.ingredientName} ({dup.totalMedicationCount} total):
                </p>
                <div className="divide-y divide-slate-100">
                  {dup.medications.map((m) => (
                    <div
                      key={m.id}
                      className="py-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900 text-sm">{m.brand}</span>
                          <span className="text-slate-500 font-medium">({m.genericName})</span>
                          <span className="px-1.5 py-0.5 bg-slate-100 text-slate-700 rounded font-mono text-2xs">
                            {m.strength}
                          </span>
                        </div>
                        <div className="text-slate-600 mt-0.5">
                          <span>Dose: <strong>{m.prescribedDose}</strong></span> • <span>Freq: {m.frequency}</span> • <span>Source: {m.source}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 self-start sm:self-center">
                        <VerificationBadge status={m.verificationStatus} size="sm" />
                        {onSelectMedication && (
                          <button
                            type="button"
                            onClick={() => onSelectMedication(m.id)}
                            className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded font-medium transition-colors"
                          >
                            View Record
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-3 flex items-center gap-1.5 text-2xs text-red-800">
                <Info className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
                <span>
                  Action Required: Clinical pharmacist reconciliation needed to verify total cumulative 24h intake and confirm necessity of dual prescribing.
                </span>
              </div>
            </div>
          </div>
        </section>
      ))}
    </div>
  );
};
