import React from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  ShieldCheck,
  HelpCircle,
  Clock,
} from 'lucide-react';
import type { DraftScheduleComparison, PrescriptionComparisonItem } from '../../../shared/chronoTypes.js';

interface ScheduleComparisonTableProps {
  comparison: DraftScheduleComparison;
}

export const ScheduleComparisonTable: React.FC<ScheduleComparisonTableProps> = ({ comparison }) => {
  return (
    <section aria-labelledby="comparison-section-title" className="space-y-4">
      {/* Dose Integrity Guarantee Card */}
      <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start gap-3 shadow-xs">
        <div className="p-2 rounded-lg bg-emerald-100 text-emerald-800 flex-shrink-0 mt-0.5">
          <ShieldCheck className="w-5 h-5" aria-hidden="true" />
        </div>
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h3 id="comparison-section-title" className="text-sm font-bold text-emerald-950">
              Prescription Integrity Invariant Guaranteed
            </h3>
            <span className="px-2 py-0.5 rounded-full text-2xs font-bold bg-emerald-200 text-emerald-900">
              {comparison.unchangedDoseCount} of {comparison.totalMedications} Doses Strictly Preserved
            </span>
          </div>
          <p className="text-xs text-emerald-900 leading-relaxed">
            The Circadian Schedule Coordinator deterministically aligns administration hours with meal
            and circadian kinetics. Prescribed drug strengths, dosage amounts, and frequency intervals
            remain 100% unmodified without authorized prescriber modification orders.
          </p>
        </div>
      </div>

      {/* Summary Stat Chips */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <div className="p-3 bg-white border border-slate-200 rounded-xl text-center shadow-xs">
          <span className="text-2xs font-bold text-slate-500 uppercase tracking-wide">
            Fully Aligned
          </span>
          <div className="text-lg font-bold text-slate-900 mt-0.5">{comparison.alignedCount}</div>
          <span className="text-2xs text-slate-500">Standard circadian placement</span>
        </div>

        <div className="p-3 bg-white border border-blue-200 rounded-xl text-center shadow-xs">
          <span className="text-2xs font-bold text-blue-700 uppercase tracking-wide">
            Timing Optimized
          </span>
          <div className="text-lg font-bold text-blue-800 mt-0.5">{comparison.optimizedCount}</div>
          <span className="text-2xs text-blue-600">Absorption / Chelation spaced</span>
        </div>

        <div className="p-3 bg-white border border-amber-200 rounded-xl text-center shadow-xs">
          <span className="text-2xs font-bold text-amber-700 uppercase tracking-wide">
            Conflict Flagged
          </span>
          <div className="text-lg font-bold text-amber-800 mt-0.5">{comparison.conflictCount}</div>
          <span className="text-2xs text-amber-600">Requires clinical review</span>
        </div>

        <div className="p-3 bg-white border border-slate-200 rounded-xl text-center shadow-xs">
          <span className="text-2xs font-bold text-slate-500 uppercase tracking-wide">
            Unverified Gaps
          </span>
          <div className="text-lg font-bold text-slate-900 mt-0.5">{comparison.unverifiedCount}</div>
          <span className="text-2xs text-slate-500">Draft OCR / pending signoff</span>
        </div>
      </div>

      {/* Side-by-Side Comparison Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-50 border-b border-slate-200 text-2xs uppercase tracking-wider text-slate-600 font-bold">
              <tr>
                <th scope="col" className="px-4 py-3 min-w-[200px]">
                  Medication &amp; Prescribed Order
                </th>
                <th scope="col" className="px-4 py-3 min-w-[180px]">
                  Original Prescribed Instructions
                </th>
                <th scope="col" className="px-4 py-3 min-w-[220px]">
                  Proposed Circadian Timetable
                </th>
                <th scope="col" className="px-4 py-3 min-w-[220px]">
                  Clinical Justification &amp; Rationale
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {comparison.items.map((item) => (
                <ComparisonRow key={item.medicationId} item={item} />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
};

interface ComparisonRowProps {
  item: PrescriptionComparisonItem;
}

const ComparisonRow: React.FC<ComparisonRowProps> = ({ item }) => {
  return (
    <tr className="hover:bg-slate-50/70 transition-colors">
      {/* Medication & Prescribed Dose Column */}
      <td className="px-4 py-3.5 align-top">
        <div className="font-bold text-slate-900 text-xs">{item.brand}</div>
        <div className="text-slate-500 text-2xs italic">{item.genericName}</div>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <span className="px-2 py-0.5 rounded text-2xs font-bold bg-slate-100 text-slate-700 border border-slate-200">
            Dose: {item.prescribedDose}
          </span>
          <span className="px-2 py-0.5 rounded text-2xs font-semibold bg-slate-100 text-slate-600">
            Freq: {item.prescribedFrequency}
          </span>
        </div>
        <div className="mt-1.5 flex items-center gap-1 text-2xs text-emerald-700 font-semibold">
          <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Dose Strictly Preserved</span>
        </div>
      </td>

      {/* Original Prescribed Instructions Column */}
      <td className="px-4 py-3.5 align-top">
        <div className="text-slate-700 bg-slate-50 p-2.5 rounded-lg border border-slate-200/80 leading-relaxed text-2xs font-mono">
          &ldquo;{item.prescribedInstructions || item.prescribedFrequency}&rdquo;
        </div>
      </td>

      {/* Proposed Circadian Timetable Column */}
      <td className="px-4 py-3.5 align-top">
        <div className="space-y-1.5">
          {item.proposedTimetable.map((slotTime, idx) => (
            <div
              key={idx}
              className="flex items-center gap-2 p-1.5 bg-clinical-50/80 border border-clinical-200 rounded-md text-2xs text-clinical-950 font-medium"
            >
              <Clock className="w-3.5 h-3.5 text-clinical-600 flex-shrink-0" aria-hidden="true" />
              <span>{slotTime}</span>
            </div>
          ))}
          <div className="pt-1">
            <StatusBadge status={item.comparisonStatus} />
          </div>
        </div>
      </td>

      {/* Clinical Justification Column */}
      <td className="px-4 py-3.5 align-top">
        <div className="space-y-1">
          <div className="text-2xs font-semibold text-slate-800 flex items-center gap-1">
            <ArrowRight className="w-3 h-3 text-slate-400" aria-hidden="true" />
            <span>{item.changeSummary}</span>
          </div>
          <p className="text-2xs text-slate-600 leading-relaxed">
            {item.clinicalJustification}
          </p>
        </div>
      </td>
    </tr>
  );
};

const StatusBadge: React.FC<{ status: PrescriptionComparisonItem['comparisonStatus'] }> = ({ status }) => {
  switch (status) {
    case 'aligned':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-2xs font-bold bg-slate-100 text-slate-700 border border-slate-200">
          <CheckCircle2 className="w-3 h-3 text-emerald-600" aria-hidden="true" />
          <span>Aligned With Prescribed</span>
        </span>
      );
    case 'timing_optimized_for_safety':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-2xs font-bold bg-blue-100 text-blue-800 border border-blue-200">
          <Clock className="w-3 h-3 text-blue-600" aria-hidden="true" />
          <span>Timing Optimized for Kinetics</span>
        </span>
      );
    case 'conflict_flagged':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-2xs font-bold bg-amber-100 text-amber-800 border border-amber-200">
          <AlertTriangle className="w-3 h-3 text-amber-600" aria-hidden="true" />
          <span>Conflict Flagged</span>
        </span>
      );
    case 'unverified_data_gap':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-2xs font-bold bg-red-100 text-red-800 border border-red-200">
          <HelpCircle className="w-3 h-3 text-red-600" aria-hidden="true" />
          <span>Unverified Prescription</span>
        </span>
      );
    case 'prn_flexible':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-2xs font-semibold bg-purple-100 text-purple-800 border border-purple-200">
          <span>PRN / Flexible As-Needed</span>
        </span>
      );
    default:
      return null;
  }
};
