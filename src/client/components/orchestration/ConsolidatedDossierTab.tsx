import React, { useState, useEffect } from 'react';
import { RefreshCw, Sparkles, AlertTriangle, Shield } from 'lucide-react';
import type { ConsolidatedClinicalReport } from '../../../shared/orchestrationTypes.js';
import { api } from '../../api/apiClient.js';
import { ConsolidatedReportView } from './ConsolidatedReportView.js';

interface ConsolidatedDossierTabProps {
  patientId: string;
  patientName: string;
  mrn: string;
  onOpenWorkflow: () => void;
  onOpenGovernance: () => void;
}

export const ConsolidatedDossierTab: React.FC<ConsolidatedDossierTabProps> = ({
  patientId,
  patientName,
  mrn,
  onOpenWorkflow,
  onOpenGovernance,
}) => {
  const [report, setReport] = useState<ConsolidatedClinicalReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadReport = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getConsolidatedReport(patientId);
      setReport(data);
    } catch (err: any) {
      setError(err.message || 'Failed to compile consolidated clinical report');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReport();
  }, [patientId]);

  const handleExportDossier = async () => {
    try {
      const dossier = await api.exportPatientDossier(patientId);
      const jsonStr = JSON.stringify(dossier, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `clinical-dossier-${patientName.replace(/\s+/g, '_')}-${mrn}-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(`Export failed: ${err.message}`);
    }
  };

  return (
    <div className="space-y-4">
      {/* Top Action Ribbon */}
      <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-700">Multi-Agent Actions:</span>
          <button
            type="button"
            onClick={onOpenWorkflow}
            className="px-3 py-1.5 text-xs font-semibold bg-clinical-600 hover:bg-clinical-700 text-white rounded-lg transition-colors flex items-center gap-1.5 shadow-2xs"
          >
            <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Open Multi-Agent Stepper (Phase 5)</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={loadReport}
            disabled={loading}
            className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors flex items-center gap-1.5 shadow-2xs disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-slate-500 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
            <span>Refresh Dossier</span>
          </button>

          <button
            type="button"
            onClick={onOpenGovernance}
            className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg transition-colors flex items-center gap-1.5 shadow-2xs"
          >
            <Shield className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
            <span>Data Governance &amp; Purge</span>
          </button>
        </div>
      </div>

      {loading && !report ? (
        <div className="p-12 text-center bg-white rounded-xl border border-slate-200">
          <RefreshCw className="w-8 h-8 text-clinical-600 animate-spin mx-auto mb-3" aria-hidden="true" />
          <h3 className="text-sm font-bold text-slate-800">Synthesizing Multi-Agent Clinical Dossier...</h3>
          <p className="text-xs text-slate-500 mt-1">Aggregating OCR extractions, PK interaction findings, and circadian timetable.</p>
        </div>
      ) : error || !report ? (
        <div className="p-6 bg-red-50 border border-red-200 rounded-xl text-red-900">
          <div className="flex items-center gap-2 font-bold mb-2">
            <AlertTriangle className="w-5 h-5 text-red-600" aria-hidden="true" />
            <span>Failed to Compile Dossier</span>
          </div>
          <p className="text-xs text-red-700">{error || 'Unknown error occurred while synthesizing report.'}</p>
          <button
            type="button"
            onClick={loadReport}
            className="mt-3 px-3 py-1.5 text-xs font-semibold bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
          >
            Retry Report
          </button>
        </div>
      ) : (
        <ConsolidatedReportView report={report} onExportDossier={handleExportDossier} />
      )}
    </div>
  );
};
