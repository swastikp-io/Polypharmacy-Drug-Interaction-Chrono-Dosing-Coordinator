import React, { useEffect, useState } from 'react';
import { Bot, Clock, Cpu, FlaskConical, RefreshCw, ShieldAlert, Sparkles } from 'lucide-react';
import { api } from '../api/apiClient.js';

interface AgentContractPreviewProps {
  patientId: string;
}

export const AgentContractPreview: React.FC<AgentContractPreviewProps> = ({ patientId }) => {
  const [activeTab, setActiveTab] = useState<'interaction' | 'chrono' | 'organ'>('interaction');
  const [interactionData, setInteractionData] = useState<any>(null);
  const [chronoData, setChronoData] = useState<any>(null);
  const [organData, setOrganData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAgentData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [ddi, chrono, organ] = await Promise.all([
        api.getDrugInteractions(patientId),
        api.getChronoDosing(patientId),
        api.getOrganClearance(patientId),
      ]);
      setInteractionData(ddi);
      setChronoData(chrono);
      setOrganData(organ);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch agent analysis');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAgentData();
  }, [patientId]);

  return (
    <div className="space-y-4">
      {/* Header Banner */}
      <div className="bg-slate-900 text-white p-5 rounded-xl shadow-md border border-slate-800">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="p-2.5 bg-clinical-500/20 text-clinical-400 border border-clinical-500/30 rounded-lg">
              <Bot className="w-6 h-6" aria-hidden="true" />
            </span>
            <div>
              <h3 className="text-base font-bold flex items-center gap-2">
                Future Agent Service Contracts &amp; Rule Engine
                <span className="text-2xs font-semibold px-2 py-0.5 rounded bg-clinical-500/20 text-clinical-300 border border-clinical-500/40">
                  Phase 1 Deterministic Stubs
                </span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Typed interfaces, pharmacokinetic rule layers, and reproducible contracts designed for future agentic LLM orchestration.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={fetchAgentData}
            disabled={isLoading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} aria-hidden="true" />
            <span>Re-evaluate Patient</span>
          </button>
        </div>

        {/* Tab Selection */}
        <div className="flex items-center gap-2 mt-5 border-t border-slate-800 pt-3">
          <button
            type="button"
            onClick={() => setActiveTab('interaction')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
              activeTab === 'interaction'
                ? 'bg-clinical-600 text-white'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <ShieldAlert className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Agent 1: Drug Interaction &amp; Duplicates</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('chrono')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
              activeTab === 'chrono'
                ? 'bg-clinical-600 text-white'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Clock className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Agent 2: Chrono-Dosing Coordinator</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('organ')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
              activeTab === 'organ'
                ? 'bg-clinical-600 text-white'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <FlaskConical className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Agent 3: Renal/Hepatic Clearance &amp; Beers</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-800 rounded-lg text-xs">
          <strong>Error:</strong> {error}
        </div>
      )}

      {/* Tab 1: Interaction Agent */}
      {activeTab === 'interaction' && interactionData && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
              <span className="text-2xs uppercase text-slate-500 font-bold block">Orders Evaluated</span>
              <span className="text-xl font-bold text-slate-900">{interactionData.summary.totalChecked}</span>
            </div>
            <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
              <span className="text-2xs uppercase text-slate-500 font-bold block">Duplicate Ingredients</span>
              <span className="text-xl font-bold text-red-600">
                {interactionData.summary.duplicateIngredientCount}
              </span>
            </div>
            <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
              <span className="text-2xs uppercase text-slate-500 font-bold block">Major DDIs</span>
              <span className="text-xl font-bold text-amber-600">{interactionData.summary.majorCount}</span>
            </div>
            <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
              <span className="text-2xs uppercase text-slate-500 font-bold block">Allergy Conflicts</span>
              <span className="text-xl font-bold text-purple-600">
                {interactionData.summary.allergyConflictCount}
              </span>
            </div>
          </div>

          {/* Drug-Drug Interactions */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-4 space-y-3">
            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
              Evaluated Drug-Drug Interaction Hazards
            </h4>
            {interactionData.drugInteractions.length === 0 ? (
              <p className="text-xs text-slate-500 italic">No major rule-based DDIs detected for this active regimen.</p>
            ) : (
              <div className="space-y-3">
                {interactionData.drugInteractions.map((ddi: any) => (
                  <div key={ddi.id} className="p-3 bg-amber-50/70 border border-amber-200 rounded-lg text-xs space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-amber-950">
                        {ddi.medicationA.brand} + {ddi.medicationB.brand}
                      </span>
                      <span className="px-2 py-0.5 rounded text-2xs uppercase font-bold bg-amber-200 text-amber-900">
                        {ddi.severity}
                      </span>
                    </div>
                    <p className="text-slate-700"><strong>Mechanism:</strong> {ddi.mechanism}</p>
                    <p className="text-slate-700"><strong>Clinical Impact:</strong> {ddi.clinicalImpact}</p>
                    <p className="text-slate-800 font-medium"><strong>Recommendation:</strong> {ddi.managementRecommendation}</p>
                    <div className="text-2xs text-slate-400">Source: {ddi.evidenceSource}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 2: Chrono-Dosing Agent */}
      {activeTab === 'chrono' && chronoData && (
        <div className="space-y-4">
          {chronoData.chronoConflicts.length > 0 && (
            <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 space-y-2">
              <h4 className="text-xs font-bold text-amber-950 uppercase tracking-wider flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-amber-600" aria-hidden="true" />
                Absorption &amp; Chrono-Separation Conflicts Detected
              </h4>
              {chronoData.chronoConflicts.map((conf: any) => (
                <div key={conf.id} className="bg-white/90 p-3 rounded-lg border border-amber-200 text-xs space-y-1">
                  <div className="font-bold text-slate-900">
                    {conf.medicationAName} ↔ {conf.medicationBName}
                  </div>
                  <p className="text-slate-700">{conf.description}</p>
                  <p className="text-clinical-900 font-semibold">
                    Required Separation: &gt;= {conf.recommendedSeparationHours} hours
                  </p>
                  <p className="text-slate-800"><strong>Guidance:</strong> {conf.managementGuidance}</p>
                </div>
              ))}
            </div>
          )}

          {/* Chrono Timeline Slots */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-4 space-y-3">
            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
              Proposed 24-Hour Circadian Dosing Schedule
            </h4>
            <div className="space-y-3">
              {chronoData.proposedSchedule.map((slot: any, idx: number) => (
                <div key={idx} className="border border-slate-200 rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                    <span className="text-xs font-bold text-clinical-900 uppercase tracking-wider flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-clinical-600" aria-hidden="true" />
                      {slot.timeWindow}
                    </span>
                    <span className="text-2xs font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                      {slot.targetMedications.length} items
                    </span>
                  </div>

                  <div className="divide-y divide-slate-100">
                    {slot.targetMedications.map((m: any) => (
                      <div key={m.medicationId} className="py-2 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-900">{m.brand} ({m.genericName})</span>
                          <span className="text-2xs font-mono bg-slate-100 px-1.5 py-0.5 rounded text-slate-700">
                            {m.prescribedDose}
                          </span>
                        </div>
                        <p className="text-slate-600 mt-0.5">Instructions: {m.administrationNotes}</p>
                        <p className="text-clinical-800 text-2xs mt-0.5 italic">
                          Circadian Rationale: {m.circadianRationale}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Organ Clearance & Beers Agent */}
      {activeTab === 'organ' && organData && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-2">
              <span className="text-xs font-bold text-slate-900 uppercase tracking-wider block">
                Renal Clearance Status
              </span>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2 bg-slate-50 rounded">
                  <span className="text-2xs text-slate-500 uppercase block font-semibold">eGFR</span>
                  <span className="text-sm font-bold text-slate-900">
                    {organData.renalFunction.latestEGFR ? `${organData.renalFunction.latestEGFR} mL/min` : 'Unknown'}
                  </span>
                </div>
                <div className="p-2 bg-slate-50 rounded">
                  <span className="text-2xs text-slate-500 uppercase block font-semibold">Stage</span>
                  <span className="text-sm font-bold text-slate-900">{organData.renalFunction.stage}</span>
                </div>
              </div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-2">
              <span className="text-xs font-bold text-slate-900 uppercase tracking-wider block">
                Hepatic Function Status
              </span>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div className="p-2 bg-slate-50 rounded">
                  <span className="text-2xs text-slate-500 uppercase block font-semibold">ALT</span>
                  <span className="text-sm font-bold text-slate-900">
                    {organData.hepaticFunction.latestALT ?? 'Unknown'}
                  </span>
                </div>
                <div className="p-2 bg-slate-50 rounded">
                  <span className="text-2xs text-slate-500 uppercase block font-semibold">AST</span>
                  <span className="text-sm font-bold text-slate-900">
                    {organData.hepaticFunction.latestAST ?? 'Unknown'}
                  </span>
                </div>
                <div className="p-2 bg-slate-50 rounded">
                  <span className="text-2xs text-slate-500 uppercase block font-semibold">Bilirubin</span>
                  <span className="text-sm font-bold text-slate-900">
                    {organData.hepaticFunction.latestBilirubin ?? 'Unknown'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Organ Alerts */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-4 space-y-3">
            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
              Organ Clearance Dosing Warnings
            </h4>
            {organData.organAlerts.length === 0 ? (
              <p className="text-xs text-slate-500 italic">No dose reduction thresholds triggered by current labs.</p>
            ) : (
              <div className="space-y-3">
                {organData.organAlerts.map((alert: any) => (
                  <div key={alert.id} className="p-3 bg-red-50/70 border border-red-200 rounded-lg text-xs space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-red-950">
                        {alert.brand} ({alert.genericName}) — {alert.organSystem.toUpperCase()} CLEARANCE WARNING
                      </span>
                      <span className="px-2 py-0.5 rounded text-2xs uppercase font-bold bg-red-200 text-red-900">
                        {alert.riskLevel}
                      </span>
                    </div>
                    <p className="text-slate-700"><strong>Trigger Threshold:</strong> {alert.guidelineThreshold}</p>
                    <p className="text-slate-800 font-medium"><strong>Clinical Guidance:</strong> {alert.adjustmentRecommendation}</p>
                    <div className="text-2xs text-slate-400">Source: {alert.evidenceSource}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Beers Criteria Deprescribing */}
          {organData.deprescribingOpportunities.length > 0 && (
            <div className="bg-white rounded-xl border border-purple-200 shadow-xs p-4 space-y-3">
              <h4 className="text-xs font-bold text-purple-950 uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-purple-600" aria-hidden="true" />
                AGS Beers Criteria Geriatric Deprescribing Opportunities
              </h4>
              <div className="space-y-3">
                {organData.deprescribingOpportunities.map((dep: any) => (
                  <div key={dep.id} className="p-3 bg-purple-50/70 border border-purple-200 rounded-lg text-xs space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-purple-950">{dep.brand} ({dep.genericName})</span>
                      <span className="px-2 py-0.5 rounded text-2xs uppercase font-bold bg-purple-200 text-purple-900">
                        {dep.priority} priority
                      </span>
                    </div>
                    <p className="text-slate-700"><strong>Category:</strong> {dep.beersCriteriaCategory}</p>
                    <p className="text-slate-700"><strong>Geriatric Rationale:</strong> {dep.rationale}</p>
                    <p className="text-purple-950 font-semibold">
                      <strong>Deprescribing Approach:</strong> {dep.deprescribingApproach}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Raw JSON Schema Inspector Accordion */}
      <details className="bg-slate-100 rounded-xl border border-slate-200 p-3 text-xs">
        <summary className="font-semibold text-slate-700 cursor-pointer hover:text-slate-900 flex items-center gap-1.5">
          <Cpu className="w-4 h-4 text-slate-500" aria-hidden="true" />
          <span>View Raw JSON Agent Service Payload</span>
        </summary>
        <pre className="mt-3 p-3 bg-slate-900 text-slate-100 rounded-lg text-2xs font-mono overflow-x-auto max-h-60">
          {JSON.stringify(
            activeTab === 'interaction' ? interactionData : activeTab === 'chrono' ? chronoData : organData,
            null,
            2
          )}
        </pre>
      </details>
    </div>
  );
};
