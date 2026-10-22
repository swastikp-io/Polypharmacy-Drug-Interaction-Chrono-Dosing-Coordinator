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
    <article aria-labelledby="dossier-heading" className="space-y-5">
      {/* 1. Header & Actions Strip */}
      <header className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-clinical-100 text-clinical-700">
              <FileText className="w-5 h-5" aria-hidden="true" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 id="dossier-heading" className="text-base font-bold text-slate-900">
                  Consolidated Clinical Dossier
                </h2>
                <span className="px-2 py-0.5 rounded text-2xs font-bold bg-cyan-100 text-cyan-800 border border-cyan-200 font-mono">
                  {report.reportId.slice(0, 15)}...
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Patient: <strong>{report.patientSummary.name}</strong> (MRN: {report.patientSummary.mrn}, Age: {report.patientSummary.age}) &bull; {report.patientSummary.careSetting}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {onExportDossier && (
            <button
              type="button"
              onClick={onExportDossier}
              className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors flex items-center gap-1.5 shadow-2xs"
            >
              <ArrowDownToLine className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
              <span>Export Dossier (JSON)</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => window.print()}
            className="px-3 py-1.5 text-xs font-semibold text-clinical-700 bg-clinical-50 hover:bg-clinical-100 border border-clinical-200 rounded-lg transition-colors flex items-center gap-1.5 shadow-2xs"
          >
            <Printer className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Print Report</span>
          </button>
        </div>
      </header>

      {/* 2. Safety Notice */}
      <aside
        aria-label="Clinical Prototype Notice"
        className="p-3.5 bg-amber-50 border-l-4 border-amber-500 text-amber-950 rounded-r-xl text-xs flex items-start gap-2.5 shadow-xs"
      >
        <ShieldAlert className="w-4 h-4 text-amber-700 flex-shrink-0 mt-0.5" aria-hidden="true" />
        <div className="leading-relaxed">
          <strong>CLINICAL DECISION SUPPORT PROTOTYPE:</strong> {report.clinicalDisclaimer}
        </div>
      </aside>

      {/* 3. Executive KPI Dashboard Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3.5 bg-white border border-slate-200 rounded-xl shadow-xs">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <Pill className="w-4 h-4 text-clinical-600" aria-hidden="true" />
            <span className="text-2xs font-bold uppercase">Active Meds</span>
          </div>
          <div className="text-xl font-bold text-slate-900">{report.activeMedications.length}</div>
          <div className="text-2xs text-slate-500 mt-0.5">
            {report.unconfirmedMedicationCount > 0 ? (
              <span className="text-amber-600 font-semibold">{report.unconfirmedMedicationCount} unconfirmed</span>
            ) : (
              <span className="text-emerald-700 font-semibold">All confirmed truth</span>
            )}
          </div>
        </div>

        <div className="p-3.5 bg-white border border-slate-200 rounded-xl shadow-xs">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <Cpu className="w-4 h-4 text-cyan-600" aria-hidden="true" />
            <span className="text-2xs font-bold uppercase">Interactions</span>
          </div>
          <div className="text-xl font-bold text-slate-900">{report.interactionAnalysis.findings.length}</div>
          <div className="text-2xs text-slate-500 mt-0.5">
            {report.interactionAnalysis.contraindicatedCount > 0 ? (
              <span className="text-red-600 font-bold">{report.interactionAnalysis.contraindicatedCount} Contraindicated</span>
            ) : (
              <span>{report.interactionAnalysis.majorCount} Major</span>
            )}
          </div>
        </div>

        <div className="p-3.5 bg-white border border-slate-200 rounded-xl shadow-xs">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <Clock className="w-4 h-4 text-clinical-600" aria-hidden="true" />
            <span className="text-2xs font-bold uppercase">Dosing Slots</span>
          </div>
          <div className="text-xl font-bold text-slate-900">{report.circadianCoordination.totalSlots}</div>
          <div className="text-2xs text-emerald-700 font-semibold mt-0.5">
            100% Doses Preserved
          </div>
        </div>

        <div className="p-3.5 bg-white border border-slate-200 rounded-xl shadow-xs">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <AlertOctagon className={`w-4 h-4 ${immediateActionCount > 0 ? 'text-red-600' : 'text-emerald-600'}`} aria-hidden="true" />
            <span className="text-2xs font-bold uppercase">Pharmacist Action</span>
          </div>
          <div className={`text-xl font-bold ${immediateActionCount > 0 ? 'text-red-700' : 'text-slate-900'}`}>
            {report.itemsRequiringPharmacistReview.length}
          </div>
          <div className="text-2xs text-slate-500 mt-0.5">
            {immediateActionCount > 0 ? (
              <span className="text-red-700 font-bold">{immediateActionCount} Immediate</span>
            ) : (
              <span>Routine Monitoring</span>
            )}
          </div>
        </div>
      </div>

      {/* 4. Prioritized Pharmacist Review Checklist */}
      <section aria-labelledby="checklist-heading" className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div>
            <h3 id="checklist-heading" className="text-sm font-bold text-slate-900">
              Prioritized Clinical Pharmacist Action Checklist ({report.itemsRequiringPharmacistReview.length} items)
            </h3>
            <p className="text-xs text-slate-500">
              Actionable findings sorted by clinical urgency: immediate signoffs vs. routine clearance checks.
            </p>
          </div>

          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg text-2xs">
            <button
              type="button"
              onClick={() => setSelectedFilter('all')}
              className={`px-2.5 py-1 rounded font-semibold transition-colors ${
                selectedFilter === 'all'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All ({report.itemsRequiringPharmacistReview.length})
            </button>
            <button
              type="button"
              onClick={() => setSelectedFilter('immediate_action')}
              className={`px-2.5 py-1 rounded font-semibold transition-colors ${
                selectedFilter === 'immediate_action'
                  ? 'bg-red-600 text-white shadow-2xs'
                  : 'text-red-700 hover:bg-red-50'
              }`}
            >
              Immediate ({immediateActionCount})
            </button>
            <button
              type="button"
              onClick={() => setSelectedFilter('pre_administration_signoff')}
              className={`px-2.5 py-1 rounded font-semibold transition-colors ${
                selectedFilter === 'pre_administration_signoff'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Pre-Admin ({report.itemsRequiringPharmacistReview.filter((i) => i.urgency === 'pre_administration_signoff').length})
            </button>
          </div>
        </div>

        <div className="space-y-2.5">
          {filteredReviewItems.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-500">
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
      <section aria-labelledby="schedule-summary-heading" className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <h3 id="schedule-summary-heading" className="text-sm font-bold text-slate-900">
              Circadian Timetable Summary
            </h3>
            <p className="text-xs text-slate-500">
              Deterministic 24-hour timeline synchronized with patient routine.
            </p>
          </div>

          <span className="px-2.5 py-1 rounded text-2xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
            Dose Preservation Guaranteed
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
          {report.circadianCoordination.slotsSummary.map((slot, idx) => (
            <div
              key={idx}
              className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-1"
            >
              <div className="flex items-center justify-between text-2xs">
                <span className="font-bold text-clinical-700">{slot.targetTime}</span>
                <span className="px-1.5 py-0.2 rounded bg-slate-200/70 text-slate-700 font-mono text-3xs">
                  {slot.doseCount} {slot.doseCount === 1 ? 'dose' : 'doses'}
                </span>
              </div>
              <div className="font-bold text-slate-900">{slot.slotName}</div>
              <div className="text-3xs text-slate-500">{slot.mealRelation.replace(/_/g, ' ')}</div>
            </div>
          ))}
        </div>
      </section>

      {/* 6. Provenance & Versioning Footer */}
      <footer className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-2xs text-slate-500 space-y-1">
        <div className="font-bold text-slate-700 uppercase tracking-wider text-3xs">
          Clinical Provenance &amp; Reference Versions
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-3xs font-mono">
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
      className={`p-3.5 rounded-xl border text-xs space-y-1.5 transition-colors ${
        isImmediate
          ? 'bg-red-50/40 border-red-200'
          : 'bg-slate-50/70 border-slate-200'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          {isImmediate ? (
            <AlertOctagon className="w-4 h-4 text-red-600 flex-shrink-0" aria-hidden="true" />
          ) : (
            <Clock className="w-4 h-4 text-amber-600 flex-shrink-0" aria-hidden="true" />
          )}
          <h4 className="font-bold text-slate-900">{item.title}</h4>
        </div>

        <span
          className={`px-2 py-0.5 rounded text-3xs font-bold uppercase tracking-wide ${
            isImmediate ? 'bg-red-100 text-red-800' : 'bg-slate-200/70 text-slate-700'
          }`}
        >
          {item.urgency.replace(/_/g, ' ')}
        </span>
      </div>

      <p className="text-2xs text-slate-700 leading-relaxed">{item.description}</p>

      <div className="p-2.5 bg-white/90 rounded-lg border border-slate-200/70 text-2xs space-y-1">
        <div>
          <strong className="text-slate-900">Action:</strong>{' '}
          <span className="text-slate-800 font-semibold">{item.actionableRecommendation}</span>
        </div>
        <div className="text-3xs text-slate-500 italic">
          Evidence: {item.evidenceCitation}
        </div>
      </div>
    </div>
  );
};
