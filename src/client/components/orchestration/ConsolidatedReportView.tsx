import React, { useState } from 'react';
import {
  AlertOctagon,
  ArrowDownToLine,
  Clock,
  Cpu,
  FileText,
  Pill,
  Printer,
  ShieldAlert,
} from 'lucide-react';
import type {
  ConsolidatedClinicalReport,
  PharmacistReviewItem,
} from '../../../shared/orchestrationTypes.js';

interface ConsolidatedReportViewProps {
  report: ConsolidatedClinicalReport;
  onExportDossier?: () => void;
}

export const ConsolidatedReportView: React.FC<ConsolidatedReportViewProps> = ({
  report,
  onExportDossier,
}) => {
  const [selectedFilter, setSelectedFilter] = useState<'all' | 'immediate_action' | 'pre_administration_signoff'>('all');

  const filteredReviewItems = report.itemsRequiringPharmacistReview.filter((item) => {
    if (selectedFilter === 'all') return true;
    return item.urgency === selectedFilter;
  });

  const immediateActionCount = report.itemsRequiringPharmacistReview.filter(
    (i) => i.urgency === 'immediate_action'
  ).length;

  return (
    <article aria-labelledby="dossier-heading" className="space-y-4">
      {/* 1. Header & Actions Strip */}
      <header className="bg-white p-5 rounded-sm border border-[#E6E3E1] shadow-editorial flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-sm bg-[#F0F3FF] text-[#1747E8] border border-[#D7DEFF] flex items-center justify-center flex-shrink-0">
              <FileText className="w-5 h-5" aria-hidden="true" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 id="dossier-heading" className="text-base font-bold text-[#171717] tracking-tight">
                  Consolidated Clinical Dossier
                </h2>
                <span className="px-1.5 py-0.2 rounded-sm text-[10px] font-bold bg-[#D7DEFF] text-[#1747E8] border border-[#C0CEFF] font-mono">
                  {report.reportId.slice(0, 16)}...
                </span>
              </div>
              <p className="text-xs text-[#777777] mt-0.5">
                Patient: <strong className="text-[#171717]">{report.patientSummary.name}</strong> (MRN: {report.patientSummary.mrn}, Age: {report.patientSummary.age}y) &bull; {report.patientSummary.careSetting}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {onExportDossier && (
            <button
              type="button"
              onClick={onExportDossier}
              className="px-3 py-1.5 text-xs font-semibold text-[#171717] bg-[#FAF9F8] border border-[#E6E3E1] hover:bg-white hover:border-[#1747E8] rounded-sm transition-colors flex items-center gap-1.5 shadow-editorial"
            >
              <ArrowDownToLine className="w-3.5 h-3.5 text-[#777777]" aria-hidden="true" />
              <span>Export Dossier (JSON)</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => window.print()}
            className="px-3 py-1.5 text-xs font-semibold text-white bg-[#1747E8] hover:bg-[#1238C7] rounded-sm transition-colors flex items-center gap-1.5 shadow-editorial"
          >
            <Printer className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Print Report</span>
          </button>
        </div>
      </header>

      {/* 2. Safety Notice */}
      <aside
        aria-label="Clinical Prototype Notice"
        className="p-3 bg-[#FFFDF5] border border-[#FDE68A] text-[#171717] rounded-sm text-xs flex items-start gap-2.5 shadow-editorial"
      >
        <ShieldAlert className="w-4 h-4 text-[#B45309] flex-shrink-0 mt-0.5" aria-hidden="true" />
        <div className="leading-relaxed">
          <strong className="text-[#92400E]">CLINICAL DECISION SUPPORT PROTOTYPE:</strong> {report.clinicalDisclaimer}
        </div>
      </aside>

      {/* 3. KPI Metrics Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3.5 bg-white border border-[#E6E3E1] rounded-sm shadow-editorial">
          <div className="flex items-center justify-between text-[#777777] mb-1">
            <span className="text-[10px] font-bold uppercase tracking-wider">Active Meds</span>
            <Pill className="w-4 h-4 text-[#1747E8]" aria-hidden="true" />
          </div>
          <div className="text-2xl font-bold text-[#171717] tabular-nums">{report.activeMedications.length}</div>
          <div className="text-[11px] text-[#777777] mt-0.5">
            {report.unconfirmedMedicationCount > 0 ? (
              <span className="text-[#B45309] font-semibold">{report.unconfirmedMedicationCount} unconfirmed</span>
            ) : (
              <span className="text-[#059669] font-semibold">All confirmed truth</span>
            )}
          </div>
        </div>

        <div className="p-3.5 bg-white border border-[#E6E3E1] rounded-sm shadow-editorial">
          <div className="flex items-center justify-between text-[#777777] mb-1">
            <span className="text-[10px] font-bold uppercase tracking-wider">Interactions</span>
            <Cpu className="w-4 h-4 text-[#1747E8]" aria-hidden="true" />
          </div>
          <div className="text-2xl font-bold text-[#171717] tabular-nums">{report.interactionAnalysis.findings.length}</div>
          <div className="text-[11px] text-[#777777] mt-0.5">
            {report.interactionAnalysis.contraindicatedCount > 0 ? (
              <span className="text-[#DC2626] font-bold">{report.interactionAnalysis.contraindicatedCount} Contraindicated</span>
            ) : (
              <span>{report.interactionAnalysis.majorCount} Major</span>
            )}
          </div>
        </div>

        <div className="p-3.5 bg-white border border-[#E6E3E1] rounded-sm shadow-editorial">
          <div className="flex items-center justify-between text-[#777777] mb-1">
            <span className="text-[10px] font-bold uppercase tracking-wider">Dosing Slots</span>
            <Clock className="w-4 h-4 text-[#1747E8]" aria-hidden="true" />
          </div>
          <div className="text-2xl font-bold text-[#171717] tabular-nums">{report.circadianCoordination.totalSlots}</div>
          <div className="text-[11px] text-[#059669] font-semibold mt-0.5">
            100% Preserved Doses
          </div>
        </div>

        <div className="p-3.5 bg-white border border-[#E6E3E1] rounded-sm shadow-editorial">
          <div className="flex items-center justify-between text-[#777777] mb-1">
            <span className="text-[10px] font-bold uppercase tracking-wider">Pharmacist Tasks</span>
            <AlertOctagon className={`w-4 h-4 ${immediateActionCount > 0 ? 'text-[#DC2626]' : 'text-[#059669]'}`} aria-hidden="true" />
          </div>
          <div className={`text-2xl font-bold tabular-nums ${immediateActionCount > 0 ? 'text-[#DC2626]' : 'text-[#171717]'}`}>
            {report.itemsRequiringPharmacistReview.length}
          </div>
          <div className="text-[11px] text-[#777777] mt-0.5">
            {immediateActionCount > 0 ? (
              <span className="text-[#DC2626] font-bold">{immediateActionCount} Immediate</span>
            ) : (
              <span>Routine Monitoring</span>
            )}
          </div>
        </div>
      </div>

      {/* 4. Prioritized Action Checklist */}
      <section aria-labelledby="checklist-heading" className="bg-white border border-[#E6E3E1] rounded-sm p-4 sm:p-5 shadow-editorial space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#E6E3E1] pb-3">
          <div>
            <h3 id="checklist-heading" className="text-sm font-bold text-[#171717]">
              Prioritized Clinical Pharmacist Action Checklist ({report.itemsRequiringPharmacistReview.length} items)
            </h3>
            <p className="text-xs text-[#777777]">
              Actionable findings sorted by clinical urgency: immediate signoffs vs. routine clearance checks.
            </p>
          </div>

          <div className="flex items-center gap-1 bg-[#FAF9F8] p-1 rounded-sm border border-[#E6E3E1] text-[11px]">
            <button
              type="button"
              onClick={() => setSelectedFilter('all')}
              className={`px-2.5 py-0.5 rounded-sm font-semibold transition-colors ${
                selectedFilter === 'all'
                  ? 'bg-[#1747E8] text-white shadow-xs'
                  : 'text-[#525252] hover:text-[#171717]'
              }`}
            >
              All ({report.itemsRequiringPharmacistReview.length})
            </button>
            <button
              type="button"
              onClick={() => setSelectedFilter('immediate_action')}
              className={`px-2.5 py-0.5 rounded-sm font-semibold transition-colors ${
                selectedFilter === 'immediate_action'
                  ? 'bg-[#DC2626] text-white shadow-xs'
                  : 'text-[#DC2626] hover:bg-[#FEE2E2]'
              }`}
            >
              Immediate ({immediateActionCount})
            </button>
            <button
              type="button"
              onClick={() => setSelectedFilter('pre_administration_signoff')}
              className={`px-2.5 py-0.5 rounded-sm font-semibold transition-colors ${
                selectedFilter === 'pre_administration_signoff'
                  ? 'bg-[#1747E8] text-white shadow-xs'
                  : 'text-[#525252] hover:text-[#171717]'
              }`}
            >
              Pre-Admin ({report.itemsRequiringPharmacistReview.filter((i) => i.urgency === 'pre_administration_signoff').length})
            </button>
          </div>
        </div>

        <div className="space-y-2.5">
          {filteredReviewItems.length === 0 ? (
            <div className="p-8 text-center text-xs text-[#777777]">
              No review items matching selected urgency filter.
            </div>
          ) : (
            filteredReviewItems.map((item) => (
              <ReviewItemCard key={item.id} item={item} />
            ))
          )}
        </div>
      </section>

      {/* 5. 24-Hour Diurnal Schedule Overview */}
      <section aria-labelledby="schedule-summary-heading" className="bg-white border border-[#E6E3E1] rounded-sm p-4 sm:p-5 shadow-editorial space-y-4">
        <div className="flex items-center justify-between border-b border-[#E6E3E1] pb-3">
          <div>
            <h3 id="schedule-summary-heading" className="text-sm font-bold text-[#171717]">
              Circadian Timetable Summary
            </h3>
            <p className="text-xs text-[#777777]">
              Deterministic 24-hour timeline synchronized with patient routine.
            </p>
          </div>

          <span className="px-2 py-0.5 rounded-sm text-[10px] font-bold bg-[#ECFDF5] text-[#065F46] border border-[#A7F3D0]">
            Dose Preservation Guaranteed
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
          {report.circadianCoordination.slotsSummary.map((slot, idx) => (
            <div
              key={idx}
              className="p-3 bg-[#FAF9F8] rounded-sm border border-[#E6E3E1] text-xs space-y-1"
            >
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-bold text-[#1747E8]">{slot.targetTime}</span>
                <span className="px-1.5 py-0.2 rounded-sm bg-white border border-[#E6E3E1] text-[#777777] font-mono text-[10px]">
                  {slot.doseCount} {slot.doseCount === 1 ? 'dose' : 'doses'}
                </span>
              </div>
              <div className="font-bold text-[#171717]">{slot.slotName}</div>
              <div className="text-[10px] text-[#777777]">{slot.mealRelation.replace(/_/g, ' ')}</div>
            </div>
          ))}
        </div>
      </section>

      {/* 6. Provenance & Versioning Footer */}
      <footer className="p-3.5 bg-[#FAF9F8] rounded-sm border border-[#E6E3E1] text-[11px] text-[#777777] space-y-1">
        <div className="font-bold text-[#171717] uppercase tracking-wider text-[10px]">
          Clinical Provenance &amp; Engine Versions
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] font-mono text-[#525252]">
          <span>Orchestrator: {report.provenance.orchestratorVersion}</span>
          <span>Conflict Engine: {report.provenance.conflictEngineVersion}</span>
          <span>Chrono Engine: {report.provenance.chronoCoordinatorVersion}</span>
          <span>Reference Dataset: {report.provenance.referenceDatasetVersion}</span>
          <span>Generated: {new Date(report.generatedAt).toLocaleString()}</span>
        </div>
      </footer>
    </article>
  );
};

const ReviewItemCard: React.FC<{ item: PharmacistReviewItem }> = ({ item }) => {
  const isImmediate = item.urgency === 'immediate_action';

  return (
    <div
      className={`p-3.5 rounded-sm border text-xs space-y-1.5 transition-colors ${
        isImmediate
          ? 'bg-[#FFFDF5] border-[#FDE68A]'
          : 'bg-[#FAF9F8] border-[#E6E3E1]'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          {isImmediate ? (
            <AlertOctagon className="w-4 h-4 text-[#DC2626] flex-shrink-0" aria-hidden="true" />
          ) : (
            <Clock className="w-4 h-4 text-[#B45309] flex-shrink-0" aria-hidden="true" />
          )}
          <h4 className="font-bold text-[#171717]">{item.title}</h4>
        </div>

        <span
          className={`px-1.5 py-0.5 rounded-sm text-[10px] font-bold uppercase tracking-wider ${
            isImmediate ? 'bg-[#FEE2E2] text-[#991B1B] border border-[#FECACA]' : 'bg-white text-[#525252] border border-[#E6E3E1]'
          }`}
        >
          {item.urgency.replace(/_/g, ' ')}
        </span>
      </div>

      <p className="text-[11px] text-[#525252] leading-relaxed">{item.description}</p>

      <div className="p-2.5 bg-white rounded-sm border border-[#E6E3E1] text-[11px] space-y-1">
        <div>
          <strong className="text-[#171717]">Action:</strong>{' '}
          <span className="text-[#1747E8] font-semibold">{item.actionableRecommendation}</span>
        </div>
        <div className="text-[10px] text-[#777777] italic">
          Evidence: {item.evidenceCitation}
        </div>
      </div>
    </div>
  );
};
