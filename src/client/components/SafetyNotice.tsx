import React, { useState } from 'react';
import { ChevronDown, ChevronUp, ShieldAlert } from 'lucide-react';

export const SafetyNotice: React.FC = () => {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <aside
      aria-label="Clinical Decision Support Prototype Safety Notice"
      className="bg-[#FFFDF5] border-b border-[#FDE68A] text-[#171717] text-xs transition-colors"
    >
      <div className="max-w-7xl mx-auto px-4 py-2 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="flex-shrink-0 inline-flex items-center justify-center w-5 h-5 rounded bg-[#FEF3C7] text-[#B45309] border border-[#FDE68A]">
              <ShieldAlert className="w-3.5 h-3.5" aria-hidden="true" />
            </span>
            <div className="text-xs text-[#171717] leading-snug truncate sm:overflow-visible sm:whitespace-normal">
              <span className="font-bold tracking-tight text-[#92400E] uppercase text-[10px] mr-1.5 px-1 py-0.2 bg-[#FEF3C7] rounded border border-[#FDE68A]">
                Clinical Prototype
              </span>
              <span className="font-medium">
                Decision-support prototype only. Not a substitute for professional clinical judgment. Medication changes must not be made solely on this prototype. Synthetic data must not be confused with real patient data.
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            aria-expanded={isExpanded}
            aria-controls="safety-notice-details"
            className="flex-shrink-0 inline-flex items-center gap-1 text-[11px] font-semibold text-[#92400E] hover:text-[#78350F] px-2 py-0.5 rounded border border-[#FDE68A] bg-[#FEF3C7] hover:bg-[#FDE68A]/60 transition-colors focus:outline-none focus:ring-2 focus:ring-[#1747E8]"
          >
            <span>{isExpanded ? 'Hide Protocol' : 'Protocol Rules'}</span>
            {isExpanded ? (
              <ChevronUp className="w-3 h-3" aria-hidden="true" />
            ) : (
              <ChevronDown className="w-3 h-3" aria-hidden="true" />
            )}
          </button>
        </div>

        {isExpanded && (
          <div
            id="safety-notice-details"
            className="mt-2 pt-2 border-t border-[#FDE68A] text-[11px] text-[#422006] grid grid-cols-1 md:grid-cols-3 gap-2.5 pb-1"
          >
            <div className="bg-white/80 p-2.5 rounded border border-[#FDE68A]">
              <p className="font-bold text-[#171717] mb-0.5">1. Synthetic Data Integrity</p>
              <p className="text-[#57534E] leading-relaxed">
                Operates strictly on synthetic geriatric profiles. Never enter real patient identifying health information (PHI).
              </p>
            </div>
            <div className="bg-white/80 p-2.5 rounded border border-[#FDE68A]">
              <p className="font-bold text-[#171717] mb-0.5">2. No Automated Prescription Changes</p>
              <p className="text-[#57534E] leading-relaxed">
                Flags duplicate ingredients and organ thresholds for clinician review. Never automatically modifies, holds, or cancels orders.
              </p>
            </div>
            <div className="bg-white/80 p-2.5 rounded border border-[#FDE68A]">
              <p className="font-bold text-[#171717] mb-0.5">3. Explicit Unknown States</p>
              <p className="text-[#57534E] leading-relaxed">
                Missing lab values or unverified sources remain explicitly labeled as &apos;Unknown&apos;. Clinical evidence is never fabricated.
              </p>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
};
