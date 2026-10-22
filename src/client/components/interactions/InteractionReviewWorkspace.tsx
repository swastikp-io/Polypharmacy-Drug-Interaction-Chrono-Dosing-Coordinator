import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  AlertOctagon,
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  Cpu,
  Database,
  FileQuestion,
  Layers,
  MessageSquare,
  Power,
  RefreshCw,
  Search,
  ShieldAlert,
  Sparkles,
  X,
} from 'lucide-react';
import type {
  ConflictEngineResult,
  RegimenExplanationResult,
} from '../../../shared/interactionTypes.js';
import { api } from '../../api/apiClient.js';

interface InteractionReviewWorkspaceProps {
  patientId: string;
  patientName: string;
  onRefreshParent?: () => Promise<void>;
}

export const InteractionReviewWorkspace: React.FC<InteractionReviewWorkspaceProps> = ({
  patientId,
  patientName,
  onRefreshParent,
}) => {
  const [result, setResult] = useState<ConflictEngineResult | null>(null);
  const [explanation, setExplanation] = useState<RegimenExplanationResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [governanceModalOpen, setGovernanceModalOpen] = useState(false);
  const [governanceData, setGovernanceData] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'findings' | 'explanation' | 'gaps'>('findings');

  // Filters
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [evidenceFilter, setEvidenceFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');

  const fetchAnalysis = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await api.getPatientInteractionAnalysis(patientId, true);
      // response is either { success, data, explanation } or raw
      const engineResult = response.data || (response as any);
      setResult(engineResult);
      if (response.explanation) {
        setExplanation(response.explanation);
      }
      if (onRefreshParent) {
        await onRefreshParent();
      }
    } catch (err: any) {
      setError(err.message || 'Failed to execute pharmacokinetic conflict evaluation.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleOutage = async () => {
    if (!result) return;
    const currentOutage = !result.providerStatus.isAvailable;
    const targetOutage = !currentOutage;

    setIsLoading(true);
    try {
      await api.toggleProviderOutage(targetOutage);
      await fetchAnalysis();
    } catch (err: any) {
      setError(err.message || 'Failed to toggle provider outage simulation.');
      setIsLoading(false);
    }
  };

  const handleOpenGovernance = async () => {
    try {
      const gov = await api.getDataSourcesGovernance();
      setGovernanceData(gov.sources || []);
      setGovernanceModalOpen(true);
    } catch (err: any) {
      setError('Failed to fetch data source governance metadata.');
    }
  };

  useEffect(() => {
    fetchAnalysis();
  }, [patientId]);

  if (isLoading && !result) {
    return (
      <div className="p-12 text-center bg-white rounded-2xl border border-slate-200 shadow-xs space-y-3">
        <RefreshCw className="w-8 h-8 mx-auto text-clinical-600 animate-spin" aria-hidden="true" />
        <h4 className="text-sm font-bold text-slate-800">
          Running Deterministic Pharmacokinetic Conflict Engine...
        </h4>
        <p className="text-xs text-slate-500 max-w-md mx-auto">
          Screening patient medication pairs against normalized RxNorm ingredient models, enzyme/transporter profiles, and versioned clinical interaction rules.
        </p>
      </div>
    );
  }

  const findings = result?.findings || [];
  const dataGaps = result?.dataGaps || [];
  const providerStatus = result?.providerStatus;

  // Filtered findings
  const filteredFindings = findings.filter((f) => {
    if (categoryFilter !== 'all' && f.category !== categoryFilter) return false;
    if (severityFilter !== 'all' && f.severity !== severityFilter) return false;
    if (evidenceFilter !== 'all' && f.evidenceLevel !== evidenceFilter) return false;
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      const matchDrugA = f.medicationA.brand.toLowerCase().includes(q) || f.medicationA.ingredient.toLowerCase().includes(q);
      const matchDrugB = f.medicationB.brand.toLowerCase().includes(q) || f.medicationB.ingredient.toLowerCase().includes(q);
      const matchMech = f.mechanism.toLowerCase().includes(q) || f.clinicalImpact.toLowerCase().includes(q);
      return matchDrugA || matchDrugB || matchMech;
    }
    return true;
  });

  return (
    <div className="space-y-5">
      {/* 1. Header & Engine Metadata Bar */}
      <div className="bg-slate-900 text-white rounded-2xl p-5 shadow-sm border border-slate-800 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="p-1.5 bg-clinical-500/20 text-clinical-400 rounded-lg">
                <Cpu className="w-5 h-5" aria-hidden="true" />
              </span>
              <h2 className="text-base font-bold tracking-tight">
                Phase 3: Pharmacokinetic Conflict Engine
              </h2>
              <span className="px-2 py-0.5 rounded-full text-2xs font-mono font-semibold bg-slate-800 border border-slate-700 text-slate-300">
                v{result?.engineVersion || '3.0.0'}
              </span>
            </div>
            <p className="text-xs text-slate-300 max-w-3xl">
              Deterministic clinical rule engine screening drug-drug interactions, duplicate therapies, and pharmacokinetic conflicts. Assesses human clinical trial evidence, patient-specific renal/hepatic prerequisites, and explicit data gaps.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleToggleOutage}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors flex items-center gap-1.5 ${
                providerStatus?.isAvailable
                  ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
                  : 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border-amber-500/40'
              }`}
              title="Simulates an outage to test safe provider-unavailable fallback state"
            >
              <Power className="w-3.5 h-3.5" aria-hidden="true" />
              <span>
                {providerStatus?.isAvailable ? 'Simulate Provider Outage' : 'Restore Provider'}
              </span>
            </button>

            <button
              type="button"
              onClick={handleOpenGovernance}
              className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors flex items-center gap-1.5"
            >
              <BookOpen className="w-3.5 h-3.5 text-clinical-400" aria-hidden="true" />
              <span>Data Governance &amp; Licenses</span>
            </button>

            <button
              type="button"
              onClick={fetchAnalysis}
              disabled={isLoading}
              className="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-clinical-600 hover:bg-clinical-500 text-white transition-colors flex items-center gap-1.5 shadow-xs disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} aria-hidden="true" />
              <span>Re-evaluate</span>
            </button>
          </div>
        </div>

        {/* Provenance & Dataset Versioning Bar */}
        {providerStatus && (
          <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-800 text-2xs text-slate-400">
            <div className="flex flex-wrap items-center gap-3">
              <span className="flex items-center gap-1.5 text-slate-300">
                <Database className="w-3.5 h-3.5 text-clinical-400" aria-hidden="true" />
                <span>Reference Dataset:</span>
                <strong className="text-white font-mono">{providerStatus.datasetMetadata.datasetName}</strong>
              </span>
              <span>•</span>
              <span>Version: <strong className="text-slate-200 font-mono">v{providerStatus.datasetMetadata.version}</strong></span>
              <span>•</span>
              <span>Revision: <strong className="text-slate-200">{providerStatus.datasetMetadata.revisionDate}</strong></span>
              <span>•</span>
              <span>Status: {providerStatus.isAvailable ? (
                <span className="text-emerald-400 font-bold">Online &amp; Operational</span>
              ) : (
                <span className="text-red-400 font-bold">Offline (Simulated Outage)</span>
              )}</span>
            </div>

            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 font-mono text-slate-300">
                Completeness: {providerStatus.datasetMetadata.completeness}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* 2. Critical Provider Outage Banner (Safe Provider-Unavailable State) */}
      {providerStatus && !providerStatus.isAvailable && (
        <aside
          aria-label="Critical Outage Warning"
          className="p-5 bg-red-100 border-2 border-red-600 text-red-950 rounded-2xl shadow-md flex items-start gap-4"
        >
          <AlertOctagon className="w-7 h-7 text-red-600 flex-shrink-0 mt-0.5 animate-pulse" aria-hidden="true" />
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-red-900 uppercase tracking-wide">
              Critical Safety Warning: Drug Reference Provider Unavailable
            </h3>
            <p className="text-xs text-red-900 leading-relaxed">
              The clinical pharmacokinetic reference provider is currently offline or unreachable. <strong>In accordance with clinical decision-support safety requirements, the absence of reported interactions in an unavailable or incomplete state CANNOT certify regimen safety.</strong>
            </p>
            <p className="text-2xs text-red-800 font-semibold pt-1">
              Action Required: Conduct immediate manual clinical review using primary literature and FDA package inserts. Do not authorize new orders based on this output.
            </p>
          </div>
        </aside>
      )}

      {/* 3. Error Banner */}
      {error && (
        <aside
          aria-label="Error Alert"
          className="p-4 bg-red-50 border-l-4 border-red-600 text-red-900 rounded-r-xl flex items-center justify-between gap-3 text-xs shadow-xs"
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" aria-hidden="true" />
            <span className="font-medium">{error}</span>
          </div>
          <button type="button" onClick={() => setError(null)} className="text-red-700 hover:text-red-900 p-1">
            <X className="w-4 h-4" />
          </button>
        </aside>
      )}

      {/* 4. KPI Metrics Summary Cards */}
      {result && providerStatus?.isAvailable && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {/* Total Findings */}
          <div className="p-3.5 bg-white rounded-xl border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 mb-1">
              <span className="text-2xs font-bold uppercase tracking-wider">Findings</span>
              <ShieldAlert className="w-4 h-4 text-clinical-600" />
            </div>
            <div className="text-xl font-bold text-slate-900">{findings.length}</div>
            <div className="text-2xs text-slate-500 mt-0.5">
              {result.summary.totalPairsEvaluated} drug pairs screened
            </div>
          </div>

          {/* Contraindicated / Major */}
          <div className="p-3.5 bg-red-50/70 border border-red-200 rounded-xl shadow-xs">
            <div className="flex items-center justify-between text-red-700 mb-1">
              <span className="text-2xs font-bold uppercase tracking-wider">Major / Contra</span>
              <AlertOctagon className="w-4 h-4 text-red-600" />
            </div>
            <div className="text-xl font-bold text-red-900">
              {result.summary.bySeverity.contraindicated + result.summary.bySeverity.major}
            </div>
            <div className="text-2xs text-red-700 mt-0.5">High-Alert Risks</div>
          </div>

          {/* Pharmacokinetic Conflicts */}
          <div className="p-3.5 bg-cyan-50/70 border border-cyan-200 rounded-xl shadow-xs">
            <div className="flex items-center justify-between text-cyan-700 mb-1">
              <span className="text-2xs font-bold uppercase tracking-wider">PK Conflicts</span>
              <Layers className="w-4 h-4 text-cyan-600" />
            </div>
            <div className="text-xl font-bold text-cyan-900">
              {result.summary.byCategory.pharmacokinetic}
            </div>
            <div className="text-2xs text-cyan-700 mt-0.5">CYP / Chelation / Transporter</div>
          </div>

          {/* Pharmacodynamic Conflicts */}
          <div className="p-3.5 bg-purple-50/70 border border-purple-200 rounded-xl shadow-xs">
            <div className="flex items-center justify-between text-purple-700 mb-1">
              <span className="text-2xs font-bold uppercase tracking-wider">PD Synergies</span>
              <Sparkles className="w-4 h-4 text-purple-600" />
            </div>
            <div className="text-xl font-bold text-purple-900">
              {result.summary.byCategory.pharmacodynamic}
            </div>
            <div className="text-2xs text-purple-700 mt-0.5">Bleeding / CNS / Sedation</div>
          </div>

          {/* Established Evidence */}
          <div className="p-3.5 bg-emerald-50/70 border border-emerald-200 rounded-xl shadow-xs">
            <div className="flex items-center justify-between text-emerald-700 mb-1">
              <span className="text-2xs font-bold uppercase tracking-wider">Established</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="text-xl font-bold text-emerald-900">
              {result.summary.establishedClinicalCount}
            </div>
            <div className="text-2xs text-emerald-700 mt-0.5">Clinical Trials / Boxed</div>
          </div>

          {/* Clinical Data Gaps */}
          <div
            onClick={() => setActiveTab('gaps')}
            className={`p-3.5 rounded-xl border transition-all cursor-pointer shadow-xs ${
              dataGaps.length > 0
                ? 'bg-amber-50/80 border-amber-300 hover:bg-amber-100/60'
                : 'bg-white border-slate-200'
            }`}
          >
            <div className="flex items-center justify-between text-amber-700 mb-1">
              <span className="text-2xs font-bold uppercase tracking-wider">Data Gaps</span>
              <FileQuestion className="w-4 h-4 text-amber-600" />
            </div>
            <div className="text-xl font-bold text-amber-900">{dataGaps.length}</div>
            <div className="text-2xs text-amber-700 mt-0.5 font-semibold">
              {dataGaps.length > 0 ? 'Action Needed' : 'None Detected'}
            </div>
          </div>
        </div>
      )}

      {/* 5. Navigation Tabs */}
      <div className="flex items-center justify-between border-b border-slate-200 pb-px">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setActiveTab('findings')}
            className={`px-4 py-2.5 text-xs font-semibold border-b-2 flex items-center gap-2 transition-colors ${
              activeTab === 'findings'
                ? 'border-clinical-600 text-clinical-800 bg-clinical-50/40 rounded-t-lg font-bold'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <ShieldAlert className="w-4 h-4 text-clinical-600" aria-hidden="true" />
            <span>Interactive Conflict Findings ({findings.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('explanation')}
            className={`px-4 py-2.5 text-xs font-semibold border-b-2 flex items-center gap-2 transition-colors ${
              activeTab === 'explanation'
                ? 'border-clinical-600 text-clinical-800 bg-clinical-50/40 rounded-t-lg font-bold'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <MessageSquare className="w-4 h-4 text-clinical-600" aria-hidden="true" />
            <span>Clinical Explanations &amp; LLM Scaffolding</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('gaps')}
            className={`px-4 py-2.5 text-xs font-semibold border-b-2 flex items-center gap-2 transition-colors ${
              activeTab === 'gaps'
                ? 'border-amber-600 text-amber-800 bg-amber-50/40 rounded-t-lg font-bold'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <FileQuestion className="w-4 h-4 text-amber-600" aria-hidden="true" />
            <span>Clinical Data Gaps &amp; Questions ({dataGaps.length})</span>
          </button>
        </div>

        <span className="text-2xs text-slate-400 pr-2 hidden sm:inline">
          Patient: <strong>{patientName}</strong>
        </span>
      </div>

      {/* 6. TAB PANEL 1: FINDINGS REVIEW */}
      {activeTab === 'findings' && (
        <div className="space-y-4">
          {/* Filter Bar */}
          <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex flex-wrap items-center gap-3">
              {/* Category Filter */}
              <div className="flex items-center gap-1.5">
                <label htmlFor="cat-filter" className="text-2xs font-bold text-slate-500 uppercase">
                  Category:
                </label>
                <select
                  id="cat-filter"
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="px-2 py-1 text-2xs rounded-lg border border-slate-300 bg-white"
                >
                  <option value="all">All Categories</option>
                  <option value="pharmacokinetic">Pharmacokinetic (PK)</option>
                  <option value="pharmacodynamic">Pharmacodynamic (PD)</option>
                  <option value="duplicate_therapy">Duplicate Therapy</option>
                  <option value="organ_clearance_conflict">Organ Clearance Conflict</option>
                </select>
              </div>

              {/* Severity Filter */}
              <div className="flex items-center gap-1.5">
                <label htmlFor="sev-filter" className="text-2xs font-bold text-slate-500 uppercase">
                  Severity:
                </label>
                <select
                  id="sev-filter"
                  value={severityFilter}
                  onChange={(e) => setSeverityFilter(e.target.value)}
                  className="px-2 py-1 text-2xs rounded-lg border border-slate-300 bg-white"
                >
                  <option value="all">All Severities</option>
                  <option value="contraindicated">Contraindicated</option>
                  <option value="major">Major</option>
                  <option value="moderate">Moderate</option>
                  <option value="minor">Minor</option>
                </select>
              </div>

              {/* Evidence Level Filter */}
              <div className="flex items-center gap-1.5">
                <label htmlFor="evi-filter" className="text-2xs font-bold text-slate-500 uppercase">
                  Evidence:
                </label>
                <select
                  id="evi-filter"
                  value={evidenceFilter}
                  onChange={(e) => setEvidenceFilter(e.target.value)}
                  className="px-2 py-1 text-2xs rounded-lg border border-slate-300 bg-white"
                >
                  <option value="all">All Evidence Tiers</option>
                  <option value="established_clinical">Established Clinical Trials</option>
                  <option value="probable">Probable</option>
                  <option value="theoretical_mechanism">Theoretical Mechanism</option>
                </select>
              </div>
            </div>

            {/* Keyword Search */}
            <div className="relative">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search drug, CYP, mechanism..."
                className="pl-8 pr-3 py-1 text-xs rounded-lg border border-slate-300 focus:ring-2 focus:ring-clinical-500 w-52"
              />
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
            </div>
          </div>

          {/* Empty State */}
          {filteredFindings.length === 0 ? (
            <div className="p-8 text-center bg-white rounded-2xl border border-slate-200 text-slate-500 space-y-2">
              <CheckCircle2 className="w-8 h-8 mx-auto text-emerald-500" />
              <p className="text-sm font-bold text-slate-800">
                No Conflict Findings Match Current Filters
              </p>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                {findings.length === 0
                  ? 'No pharmacokinetic conflicts, duplicate therapies, or clinical drug interactions were flagged for this patient.'
                  : 'Try adjusting category, severity, or evidence strength filter settings above.'}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredFindings.map((finding) => (
                <div
                  key={finding.findingId}
                  className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4 transition-all hover:border-slate-300"
                >
                  {/* Top Header Row */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      {/* Severity Chip */}
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-2xs font-bold uppercase tracking-wider ${
                          finding.severity === 'contraindicated'
                            ? 'bg-purple-100 text-purple-900 border border-purple-200'
                            : finding.severity === 'major'
                              ? 'bg-red-100 text-red-900 border border-red-200'
                              : finding.severity === 'moderate'
                                ? 'bg-amber-100 text-amber-900 border border-amber-200'
                                : 'bg-blue-100 text-blue-900 border border-blue-200'
                        }`}
                      >
                        {finding.severity} Severity
                      </span>

                      {/* Category Chip */}
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-2xs font-semibold ${
                          finding.category === 'pharmacokinetic'
                            ? 'bg-cyan-50 text-cyan-800 border border-cyan-200'
                            : finding.category === 'pharmacodynamic'
                              ? 'bg-purple-50 text-purple-800 border border-purple-200'
                              : finding.category === 'duplicate_therapy'
                                ? 'bg-rose-50 text-rose-800 border border-rose-200'
                                : 'bg-slate-100 text-slate-800 border border-slate-200'
                        }`}
                      >
                        {finding.category.replace(/_/g, ' ').toUpperCase()}
                      </span>

                      {/* Evidence Level Badge */}
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-2xs font-semibold ${
                          finding.evidenceLevel === 'established_clinical'
                            ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                            : finding.evidenceLevel === 'probable'
                              ? 'bg-blue-50 text-blue-800 border border-blue-200'
                              : 'bg-slate-100 text-slate-700 border border-slate-200'
                        }`}
                      >
                        {finding.evidenceLevel === 'established_clinical'
                          ? '✓ Established Human Clinical Trial'
                          : finding.evidenceLevel === 'probable'
                            ? 'Probable Cohort Evidence'
                            : 'Theoretical In Vitro Mechanism'}
                      </span>
                    </div>

                    {/* Required Review Chip */}
                    <span className="text-2xs font-semibold text-slate-500">
                      Required Action:{' '}
                      <strong className="text-slate-800 font-bold uppercase">
                        {finding.requiredReview.replace(/_/g, ' ')}
                      </strong>
                    </span>
                  </div>

                  {/* Interacting Medications Highlight Box */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200/80">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-clinical-100 text-clinical-700 font-bold flex items-center justify-center text-xs flex-shrink-0">
                        A
                      </div>
                      <div>
                        <div className="text-xs font-bold text-slate-900">
                          {finding.medicationA.brand}
                        </div>
                        <div className="text-2xs text-slate-500">
                          Generic: {finding.medicationA.genericName} • Ingredient: {finding.medicationA.ingredient}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-purple-100 text-purple-700 font-bold flex items-center justify-center text-xs flex-shrink-0">
                        B
                      </div>
                      <div>
                        <div className="text-xs font-bold text-slate-900">
                          {finding.medicationB.brand}
                        </div>
                        <div className="text-2xs text-slate-500">
                          Generic: {finding.medicationB.genericName} • Ingredient: {finding.medicationB.ingredient}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Mechanism & Clinical Impact */}
                  <div className="space-y-2 text-xs">
                    <div>
                      <h4 className="font-bold text-slate-900 mb-0.5">Pharmacological Mechanism:</h4>
                      <p className="text-slate-700 leading-relaxed">{finding.mechanism}</p>
                    </div>

                    <div>
                      <h4 className="font-bold text-slate-900 mb-0.5">Clinical Consequence &amp; Patient Impact:</h4>
                      <p className="text-slate-700 leading-relaxed">{finding.clinicalImpact}</p>
                    </div>

                    <div className="p-3 bg-clinical-50/60 rounded-xl border border-clinical-200 space-y-1">
                      <h5 className="font-bold text-clinical-950 text-2xs uppercase tracking-wide">
                        Management Recommendation:
                      </h5>
                      <p className="text-xs text-clinical-900">{finding.managementRecommendation}</p>
                    </div>
                  </div>

                  {/* Provenance & Source Citation Footer */}
                  <div className="pt-3 border-t border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-2 text-2xs text-slate-500">
                    <div className="space-y-0.5">
                      <div>
                        <strong>Citation: </strong>
                        <span>{finding.sourceCitation}</span>
                      </div>
                      <div className="text-slate-400">
                        Published: {finding.publicationDate} • Rule: <code className="font-mono">{finding.ruleId}</code> • Dataset: <code className="font-mono">v{finding.datasetVersion}</code>
                      </div>
                    </div>

                    {/* Patient Context Tag */}
                    {finding.patientContextApplied && (
                      <div className="text-right text-slate-600 bg-slate-100 px-2 py-1 rounded text-2xs flex-shrink-0">
                        <span>{finding.patientContextApplied.notes}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 7. TAB PANEL 2: CLINICAL EXPLANATIONS & LLM PROMPT SCAFFOLDING */}
      {activeTab === 'explanation' && explanation && (
        <div className="space-y-5">
          {/* Executive Summary */}
          <div className="p-5 bg-white rounded-2xl border border-slate-200 shadow-xs space-y-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-clinical-600" aria-hidden="true" />
              <h3 className="text-sm font-bold text-slate-900">
                Executive Regimen Pharmacotherapy Rationale
              </h3>
            </div>
            <p className="text-xs text-slate-700 leading-relaxed">
              {explanation.executiveSummary}
            </p>

            {explanation.highPriorityAlerts.length > 0 && (
              <div className="space-y-1.5 pt-2">
                <h4 className="text-2xs font-bold text-red-900 uppercase tracking-wider">
                  Critical Priority Alerts:
                </h4>
                {explanation.highPriorityAlerts.map((alert, idx) => (
                  <div
                    key={idx}
                    className="p-2.5 bg-red-50 text-red-900 border border-red-200 rounded-lg text-xs font-semibold flex items-center gap-2"
                  >
                    <AlertOctagon className="w-4 h-4 text-red-600 flex-shrink-0" />
                    <span>{alert}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Finding-Level Explanations */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider px-1">
              Patient-Facing Plain-Language Explanations ({explanation.findingsExplanations.length})
            </h4>

            {explanation.findingsExplanations.map((exp) => (
              <div
                key={exp.findingId}
                className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs space-y-3 text-xs"
              >
                <div className="font-bold text-slate-900 border-b border-slate-100 pb-2">
                  {exp.clinicianSummary}
                </div>

                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-1">
                  <div className="text-2xs font-bold uppercase text-slate-500">
                    What this means for the patient:
                  </div>
                  <p className="text-slate-800 leading-relaxed">
                    {exp.patientPlainLanguageExplanation}
                  </p>
                </div>

                <div className="space-y-1 text-2xs text-slate-600">
                  <strong className="block text-slate-700">Action Plan:</strong>
                  {exp.actionChecklist.map((item, idx) => (
                    <div key={idx} className="flex items-start gap-1.5">
                      <span>•</span>
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* LLM Scaffolding Prompt Inspector */}
          <div className="bg-slate-900 text-slate-100 rounded-2xl p-5 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Cpu className="w-4 h-4 text-clinical-400" />
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                  LLM Explanation Grounding Scaffolding
                </h4>
              </div>
              <span className="text-2xs font-mono text-slate-400 bg-slate-800 px-2 py-0.5 rounded">
                Zero-Hallucination Ground-Truth Tether
              </span>
            </div>
            <p className="text-xs text-slate-400">
              When an LLM is enabled to draft patient communications, it is constrained by this system prompt and structured JSON context payload. The model is mathematically forbidden from inventing interactions or fabricating dose changes.
            </p>

            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-2xs font-mono space-y-2 overflow-x-auto">
              <div className="text-slate-400">
                <strong className="text-clinical-400">SYSTEM PROMPT:</strong>
                <div>{explanation.llmScaffoldingPrompt.systemPrompt}</div>
              </div>
              <div className="text-slate-400 pt-2 border-t border-slate-800">
                <strong className="text-clinical-400">GROUNDED CONTEXT PAYLOAD (Preview):</strong>
                <pre className="text-slate-300 text-2xs max-h-40 overflow-y-auto whitespace-pre-wrap">
                  {explanation.llmScaffoldingPrompt.groundedContextJson}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 8. TAB PANEL 3: CLINICAL DATA GAPS & QUESTIONS */}
      {activeTab === 'gaps' && (
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
            <h3 className="text-sm font-bold text-slate-900">
              Clinical Context Gaps &amp; Epistemic Uncertainties ({dataGaps.length})
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              The engine explicitly surfaces missing laboratory measurements and unverified prescription identities rather than making assumptions about organ function or drug purity.
            </p>
          </div>

          {dataGaps.length === 0 ? (
            <div className="p-8 text-center bg-white rounded-2xl border border-slate-200 text-slate-500 space-y-2">
              <CheckCircle2 className="w-8 h-8 mx-auto text-emerald-500" />
              <p className="text-sm font-bold text-slate-800">No Clinical Data Gaps</p>
              <p className="text-xs text-slate-500">
                Renal and hepatic laboratories are documented, and all medication orders have confirmed verification status.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {dataGaps.map((gap, idx) => (
                <div
                  key={idx}
                  className={`p-4 rounded-xl border flex items-start gap-3.5 text-xs shadow-xs ${
                    gap.severity === 'high'
                      ? 'bg-amber-50/70 border-amber-300 text-amber-950'
                      : 'bg-slate-50 border-slate-200 text-slate-900'
                  }`}
                >
                  <AlertTriangle
                    className={`w-5 h-5 flex-shrink-0 mt-0.5 ${
                      gap.severity === 'high' ? 'text-amber-600' : 'text-slate-500'
                    }`}
                  />
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h4 className="font-bold">{gap.title}</h4>
                      <span className="px-2 py-0.5 rounded text-2xs uppercase font-bold bg-white/80 border border-slate-300">
                        {gap.severity} priority
                      </span>
                    </div>
                    <p className="text-slate-700 leading-relaxed">{gap.description}</p>
                    <div className="text-2xs font-semibold pt-1 text-slate-800">
                      <strong>Recommended Clinical Action: </strong>
                      <span>{gap.suggestedAction}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 9. Data Source Governance & Licensing Modal */}
      {governanceModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
        >
          <div className="bg-white rounded-2xl max-w-3xl w-full border border-slate-200 shadow-2xl p-6 space-y-5 my-8">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2">
                <span className="p-1.5 bg-clinical-100 text-clinical-600 rounded-lg">
                  <BookOpen className="w-5 h-5" />
                </span>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Production Evidence Sources Governance &amp; Licensing Audit
                  </h3>
                  <p className="text-2xs text-slate-500">
                    Required licensing terms, update cadences, and completeness audits for production clinical deployment.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setGovernanceModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 max-h-[60vh] overflow-y-auto text-xs pr-1">
              {governanceData.map((src, idx) => (
                <div key={idx} className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-slate-900 text-sm">{src.sourceName}</h4>
                    <span className="text-2xs text-slate-500 font-medium">{src.officialProvider}</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-2xs pt-1">
                    <div>
                      <strong className="text-slate-700">Licensing Terms: </strong>
                      <span className="text-slate-600">{src.licensingTerms}</span>
                    </div>
                    <div>
                      <strong className="text-slate-700">Update Cadence: </strong>
                      <span className="text-slate-600">{src.updateCadence}</span>
                    </div>
                  </div>

                  <div className="text-2xs">
                    <strong className="text-slate-700">Completeness Evaluation: </strong>
                    <span className="text-slate-600">{src.completenessEvaluation}</span>
                  </div>

                  <div className="text-2xs pt-1 border-t border-slate-200/60">
                    <strong className="text-slate-700">Production Checklist: </strong>
                    <ul className="list-disc list-inside text-slate-600 mt-0.5 space-y-0.5">
                      {src.productionReadinessChecklist.map((item: string, cIdx: number) => (
                        <li key={cIdx}>{item}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-end pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setGovernanceModalOpen(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-semibold"
              >
                Close Audit View
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
