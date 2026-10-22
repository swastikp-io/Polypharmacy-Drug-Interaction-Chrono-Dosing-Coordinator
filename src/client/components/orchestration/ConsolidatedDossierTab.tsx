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
      <div className="bg-white p-3.5 rounded-sm border border-[#E6E3E1] shadow-editorial flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-[#171717]">Multi-Agent Actions:</span>
          <button
            type="button"
            onClick={onOpenWorkflow}
            className="px-3 py-1.5 text-xs font-semibold bg-[#1747E8] hover:bg-[#1238C7] text-white rounded-sm transition-colors flex items-center gap-1.5 shadow-editorial"
          >
            <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Run 3-Agent Workflow (Phase 5)</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={loadReport}
            disabled={loading}
            className="px-3 py-1.5 text-xs font-semibold text-[#171717] bg-[#FAF9F8] hover:bg-white border border-[#E6E3E1] hover:border-[#1747E8] rounded-sm transition-colors flex items-center gap-1.5 shadow-editorial disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-[#777777] ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
            <span>Refresh Dossier</span>
          </button>

          <button
            type="button"
            onClick={onOpenGovernance}
            className="px-3 py-1.5 text-xs font-semibold text-[#525252] bg-white hover:bg-[#FAF9F8] border border-[#E6E3E1] rounded-sm transition-colors flex items-center gap-1.5 shadow-editorial"
          >
            <Shield className="w-3.5 h-3.5 text-[#B45309]" aria-hidden="true" />
            <span>Data Governance &amp; Purge</span>
          </button>
        </div>
      </div>

      {loading && !report ? (
        <div className="p-12 text-center bg-white rounded-sm border border-[#E6E3E1] shadow-editorial">
          <RefreshCw className="w-6 h-6 animate-spin text-[#1747E8] mx-auto mb-2" />
          <p className="text-xs text-[#777777]">Compiling consolidated dossier across all 3 agent pipelines...</p>
        </div>
      ) : error ? (
        <div className="p-4 bg-[#FEE2E2] border border-[#FECACA] rounded-sm text-xs text-[#991B1B] flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-[#DC2626] flex-shrink-0" />
          <span>{error}</span>
        </div>
      ) : report ? (
        <ConsolidatedReportView
          report={report}
          onExportDossier={handleExportDossier}
        />
      ) : null}
    </div>
  );
};
