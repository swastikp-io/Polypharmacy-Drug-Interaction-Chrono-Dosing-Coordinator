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
      <div className="bg-white border border-[#E6E3E1] rounded-sm p-5 shadow-editorial">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-sm bg-[#F0F3FF] text-[#1747E8] border border-[#D7DEFF] flex items-center justify-center flex-shrink-0">
              <Bot className="w-5 h-5" aria-hidden="true" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-[#171717] tracking-tight">
                  Agent Contracts &amp; Rule Engine Preview
                </h3>
                <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-sm bg-[#D7DEFF] text-[#1747E8] border border-[#C0CEFF]">
                  Deterministic Stubs
                </span>
              </div>
              <p className="text-xs text-[#777777] mt-0.5">
                Typed interfaces, pharmacokinetic rule layers, and reproducible contracts designed for future agentic LLM orchestration.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={fetchAgentData}
            disabled={isLoading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#171717] bg-[#FAF9F8] hover:bg-white border border-[#E6E3E1] hover:border-[#1747E8] rounded-sm transition-colors disabled:opacity-50 shadow-editorial"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-[#777777] ${isLoading ? 'animate-spin' : ''}`} aria-hidden="true" />
            <span>Re-evaluate Patient</span>
          </button>
        </div>

        {/* Tab Selection */}
        <div className="flex items-center gap-1.5 mt-4 border-t border-[#E6E3E1] pt-3 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab('interaction')}
            className={`px-3 py-1.5 rounded-sm text-xs font-semibold transition-colors flex items-center gap-1.5 ${
              activeTab === 'interaction'
                ? 'bg-[#1747E8] text-white shadow-xs'
                : 'text-[#525252] hover:text-[#171717] hover:bg-[#FAF9F8]'
            }`}
          >
            <ShieldAlert className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Agent 1: Drug Interaction &amp; Duplicates</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('chrono')}
            className={`px-3 py-1.5 rounded-sm text-xs font-semibold transition-colors flex items-center gap-1.5 ${
              activeTab === 'chrono'
                ? 'bg-[#1747E8] text-white shadow-xs'
                : 'text-[#525252] hover:text-[#171717] hover:bg-[#FAF9F8]'
            }`}
          >
            <Clock className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Agent 2: Chrono-Dosing Coordinator</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('organ')}
            className={`px-3 py-1.5 rounded-sm text-xs font-semibold transition-colors flex items-center gap-1.5 ${
              activeTab === 'organ'
                ? 'bg-[#1747E8] text-white shadow-xs'
                : 'text-[#525252] hover:text-[#171717] hover:bg-[#FAF9F8]'
            }`}
          >
            <FlaskConical className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Agent 3: Renal/Hepatic Clearance &amp; Beers</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-[#FEE2E2] border border-[#FECACA] text-[#991B1B] rounded-sm text-xs">
          <strong>Error:</strong> {error}
        </div>
      )}

      {/* Tab 1: Interaction Agent */}
      {activeTab === 'interaction' && interactionData && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white p-3.5 rounded-sm border border-[#E6E3E1] shadow-editorial">
              <span className="text-[10px] uppercase text-[#777777] font-bold block">Orders Evaluated</span>
              <span className="text-2xl font-bold text-[#171717] tabular-nums">{interactionData.summary.totalChecked}</span>
            </div>
            <div className="bg-white p-3.5 rounded-sm border border-[#E6E3E1] shadow-editorial">
              <span className="text-[10px] uppercase text-[#777777] font-bold block">Duplicate Ingredients</span>
              <span className="text-2xl font-bold text-[#DC2626] tabular-nums">
                {interactionData.summary.duplicateIngredientCount}
              </span>
            </div>
            <div className="bg-white p-3.5 rounded-sm border border-[#E6E3E1] shadow-editorial">
              <span className="text-[10px] uppercase text-[#777777] font-bold block">Major DDIs</span>
              <span className="text-2xl font-bold text-[#B45309] tabular-nums">{interactionData.summary.majorCount}</span>
            </div>
            <div className="bg-white p-3.5 rounded-sm border border-[#E6E3E1] shadow-editorial">
              <span className="text-[10px] uppercase text-[#777777] font-bold block">Allergy Conflicts</span>
              <span className="text-2xl font-bold text-[#6B21A8] tabular-nums">
                {interactionData.summary.allergyConflictCount}
              </span>
            </div>
          </div>

          {/* Drug-Drug Interactions */}
          <div className="bg-white rounded-sm border border-[#E6E3E1] shadow-editorial p-4 space-y-3">
            <h4 className="text-xs font-bold text-[#171717] uppercase tracking-wider">
              Evaluated Drug-Drug Interaction Hazards
            </h4>
            {interactionData.drugInteractions.length === 0 ? (
              <p className="text-xs text-[#777777] italic">No major rule-based DDIs detected for this active regimen.</p>
            ) : (
              <div className="space-y-2.5">
                {interactionData.drugInteractions.map((ddi: any) => (
                  <div key={ddi.id} className="p-3 bg-[#FFFDF5] border border-[#FDE68A] rounded-sm text-xs space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-[#171717]">
                        {ddi.medicationA.brand} + {ddi.medicationB.brand}
                      </span>
                      <span className="px-1.5 py-0.2 rounded-sm text-[10px] uppercase font-bold bg-[#FEF3C7] text-[#92400E] border border-[#FDE68A]">
                        {ddi.severity}
                      </span>
                    </div>
                    <p className="text-[#525252]"><strong>Mechanism:</strong> {ddi.mechanism}</p>
                    <p className="text-[#525252]"><strong>Clinical Impact:</strong> {ddi.clinicalImpact}</p>
                    <p className="text-[#171717] font-medium"><strong>Recommendation:</strong> {ddi.managementRecommendation}</p>
                    <div className="text-[10px] text-[#777777]">Source: {ddi.evidenceSource}</div>
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
            <div className="bg-[#FFFDF5] border border-[#FDE68A] rounded-sm p-4 space-y-2 shadow-editorial">
              <h4 className="text-xs font-bold text-[#92400E] uppercase tracking-wider flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-[#B45309]" aria-hidden="true" />
                Absorption &amp; Chrono-Separation Conflicts Detected
              </h4>
              {chronoData.chronoConflicts.map((conf: any) => (
                <div key={conf.id} className="bg-white p-3 rounded-sm border border-[#E6E3E1] text-xs space-y-1">
                  <div className="font-bold text-[#171717]">
                    {conf.medicationAName} ↔ {conf.medicationBName}
                  </div>
                  <p className="text-[#525252]">{conf.description}</p>
                  <p className="text-[#1747E8] font-semibold">
                    Required Separation: &gt;= {conf.recommendedSeparationHours} hours
                  </p>
                  <p className="text-[#171717]"><strong>Guidance:</strong> {conf.managementGuidance}</p>
                </div>
              ))}
            </div>
          )}

          {/* Chrono Timeline Slots */}
          <div className="bg-white rounded-sm border border-[#E6E3E1] shadow-editorial p-4 space-y-3">
            <h4 className="text-xs font-bold text-[#171717] uppercase tracking-wider">
              Proposed 24-Hour Circadian Dosing Schedule
            </h4>
            <div className="space-y-2.5">
              {chronoData.proposedSchedule.map((slot: any, idx: number) => (
                <div key={idx} className="border border-[#E6E3E1] rounded-sm p-3 space-y-2">
                  <div className="flex items-center justify-between pb-2 border-b border-[#E6E3E1]">
                    <span className="text-xs font-bold text-[#1747E8] uppercase tracking-wider flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-[#1747E8]" aria-hidden="true" />
                      {slot.timeWindow}
                    </span>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-sm bg-[#FAF9F8] border border-[#E6E3E1] text-[#525252]">
                      {slot.targetMedications.length} items
                    </span>
                  </div>

                  <div className="divide-y divide-[#E6E3E1]">
                    {slot.targetMedications.map((m: any) => (
                      <div key={m.medicationId} className="py-2 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-[#171717]">{m.brand} ({m.genericName})</span>
                          <span className="text-[10px] font-mono bg-[#FAF9F8] border border-[#E6E3E1] px-1.5 py-0.2 rounded-sm text-[#171717]">
                            {m.prescribedDose}
                          </span>
                        </div>
                        <p className="text-[#525252] mt-0.5">Instructions: {m.administrationNotes}</p>
                        <p className="text-[#1747E8] text-[11px] mt-0.5 italic">
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
            <div className="bg-white p-4 rounded-sm border border-[#E6E3E1] shadow-editorial space-y-2">
              <span className="text-xs font-bold text-[#171717] uppercase tracking-wider block">
                Renal Clearance Status
              </span>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2.5 bg-[#FAF9F8] rounded-sm border border-[#E6E3E1]">
                  <span className="text-[10px] text-[#777777] uppercase block font-semibold">eGFR</span>
                  <span className="text-sm font-bold text-[#171717]">
                    {organData.renalFunction.latestEGFR ? `${organData.renalFunction.latestEGFR} mL/min` : 'Unknown'}
                  </span>
                </div>
                <div className="p-2.5 bg-[#FAF9F8] rounded-sm border border-[#E6E3E1]">
                  <span className="text-[10px] text-[#777777] uppercase block font-semibold">Stage</span>
                  <span className="text-sm font-bold text-[#171717]">{organData.renalFunction.stage}</span>
                </div>
              </div>
            </div>

            <div className="bg-white p-4 rounded-sm border border-[#E6E3E1] shadow-editorial space-y-2">
              <span className="text-xs font-bold text-[#171717] uppercase tracking-wider block">
                Hepatic Function Status
              </span>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div className="p-2.5 bg-[#FAF9F8] rounded-sm border border-[#E6E3E1]">
                  <span className="text-[10px] text-[#777777] uppercase block font-semibold">ALT</span>
                  <span className="text-sm font-bold text-[#171717]">
                    {organData.hepaticFunction.latestALT ?? 'Unknown'}
                  </span>
                </div>
                <div className="p-2.5 bg-[#FAF9F8] rounded-sm border border-[#E6E3E1]">
                  <span className="text-[10px] text-[#777777] uppercase block font-semibold">AST</span>
                  <span className="text-sm font-bold text-[#171717]">
                    {organData.hepaticFunction.latestAST ?? 'Unknown'}
                  </span>
                </div>
                <div className="p-2.5 bg-[#FAF9F8] rounded-sm border border-[#E6E3E1]">
                  <span className="text-[10px] text-[#777777] uppercase block font-semibold">Bilirubin</span>
                  <span className="text-sm font-bold text-[#171717]">
                    {organData.hepaticFunction.latestBilirubin ?? 'Unknown'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Organ Alerts */}
          <div className="bg-white rounded-sm border border-[#E6E3E1] shadow-editorial p-4 space-y-3">
            <h4 className="text-xs font-bold text-[#171717] uppercase tracking-wider">
              Organ Clearance Dosing Warnings
            </h4>
            {organData.organAlerts.length === 0 ? (
              <p className="text-xs text-[#777777] italic">No dose reduction thresholds triggered by current labs.</p>
            ) : (
              <div className="space-y-2.5">
                {organData.organAlerts.map((alert: any) => (
                  <div key={alert.id} className="p-3 bg-[#FFFDF5] border border-[#FECACA] rounded-sm text-xs space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-[#DC2626]">
                        {alert.brand} ({alert.genericName}) — {alert.organSystem.toUpperCase()} CLEARANCE WARNING
                      </span>
                      <span className="px-1.5 py-0.2 rounded-sm text-[10px] uppercase font-bold bg-[#FEE2E2] text-[#991B1B] border border-[#FECACA]">
                        {alert.riskLevel}
                      </span>
                    </div>
                    <p className="text-[#525252]"><strong>Trigger Threshold:</strong> {alert.guidelineThreshold}</p>
                    <p className="text-[#171717] font-medium"><strong>Clinical Guidance:</strong> {alert.adjustmentRecommendation}</p>
                    <div className="text-[10px] text-[#777777]">Source: {alert.evidenceSource}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Beers Criteria Deprescribing */}
          {organData.deprescribingOpportunities.length > 0 && (
            <div className="bg-white rounded-sm border border-[#E6E3E1] shadow-editorial p-4 space-y-3">
              <h4 className="text-xs font-bold text-[#171717] uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-[#1747E8]" aria-hidden="true" />
                AGS Beers Criteria Geriatric Deprescribing Opportunities
              </h4>
              <div className="space-y-2.5">
                {organData.deprescribingOpportunities.map((dep: any) => (
                  <div key={dep.id} className="p-3 bg-[#FAF9F8] border border-[#E6E3E1] rounded-sm text-xs space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-[#171717]">{dep.brand} ({dep.genericName})</span>
                      <span className="px-1.5 py-0.2 rounded-sm text-[10px] uppercase font-bold bg-[#F3E8FF] text-[#6B21A8] border border-[#E9D5FF]">
                        {dep.priority} priority
                      </span>
                    </div>
                    <p className="text-[#525252]"><strong>Category:</strong> {dep.beersCriteriaCategory}</p>
                    <p className="text-[#525252]"><strong>Geriatric Rationale:</strong> {dep.rationale}</p>
                    <p className="text-[#171717] font-semibold">
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
      <details className="bg-white rounded-sm border border-[#E6E3E1] p-3 text-xs shadow-editorial">
        <summary className="font-semibold text-[#525252] cursor-pointer hover:text-[#171717] flex items-center gap-1.5">
          <Cpu className="w-4 h-4 text-[#777777]" aria-hidden="true" />
          <span>View Raw JSON Agent Service Payload</span>
        </summary>
        <pre className="mt-3 p-3 bg-[#171717] text-[#FAF9F8] rounded-sm text-[10px] font-mono overflow-x-auto max-h-60">
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
