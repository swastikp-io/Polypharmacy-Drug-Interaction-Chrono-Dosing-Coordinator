import React, { useState } from 'react';
import { ChevronDown, ChevronUp, ShieldAlert } from 'lucide-react';

export const SafetyNotice: React.FC = () => {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <aside
      aria-label="Clinical Decision Support Prototype Safety Notice"
      className="bg-amber-500 text-slate-950 border-b border-amber-600 shadow-sm"
    >
      <div className="max-w-7xl mx-auto px-4 py-2.5 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="p-1 bg-amber-600/30 rounded-md text-slate-950 flex-shrink-0">
              <ShieldAlert className="w-5 h-5" aria-hidden="true" />
            </span>
            <div className="text-xs sm:text-sm font-semibold tracking-wide">
              <span>CLINICAL PROTOTYPE NOTICE: </span>
              <span className="font-normal text-slate-900">
                This system is a local-first clinical decision-support prototype and is{' '}
                <strong>NOT</strong> a substitute for professional clinical medication review, physician judgment, or licensed pharmacist consultation.
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            aria-expanded={isExpanded}
            aria-controls="safety-notice-details"
            className="text-xs font-semibold underline underline-offset-2 hover:text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900 rounded px-1.5 py-0.5 flex items-center gap-1 flex-shrink-0"
          >
            <span>{isExpanded ? 'Hide Details' : 'Protocol Rules'}</span>
            {isExpanded ? (
              <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
            )}
          </button>
        </div>

        {isExpanded && (
          <div
            id="safety-notice-details"
            className="mt-2.5 pt-2.5 border-t border-amber-600/30 text-xs text-slate-900 grid grid-cols-1 md:grid-cols-3 gap-3"
          >
            <div className="bg-amber-400/40 p-2.5 rounded">
              <p className="font-semibold text-slate-950 mb-1">1. Synthetic Data Integrity</p>
              <p>Operates strictly on synthetic geriatric profiles. Never enter real patient identifying health information (PHI).</p>
            </div>
            <div className="bg-amber-400/40 p-2.5 rounded">
              <p className="font-semibold text-slate-950 mb-1">2. No Prescriptive Automation</p>
              <p>The system flags duplicate ingredients and organ thresholds for clinician review. It will never automatically modify, hold, or cancel prescriptions.</p>
            </div>
            <div className="bg-amber-400/40 p-2.5 rounded">
              <p className="font-semibold text-slate-950 mb-1">3. Explicit Unknown States</p>
              <p>Missing lab values or unverified sources remain explicitly labeled as &apos;Unknown&apos;. Clinical advice is never fabricated or hallucinated.</p>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
};
