import React, { useState, useEffect } from 'react';
import {
  Activity,
  AlertOctagon,
  ArrowRight,
  Bot,
  ChevronRight,
  ClipboardCheck,
  Clock,
  Cpu,
  FileScan,
  FileText,
  FlaskConical,
  History,
  Layers,
  Pill,
  Shield,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';
import type {
  Allergy,
  AuditLog,
  Diagnosis,
  DuplicateIngredientGroup,
  LabMeasurement,
  Medication,
  Patient,
  VerificationStatus,
} from '../../shared/types.js';
import { api } from '../api/apiClient.js';
import { AgentContractPreview } from './AgentContractPreview.js';
import { AllergyList } from './AllergyList.js';
import { AuditTrailView } from './AuditTrailView.js';
import { DiagnosisList } from './DiagnosisList.js';
import { DuplicateIngredientAlert } from './DuplicateIngredientAlert.js';
import { InteractionReviewWorkspace } from './interactions/InteractionReviewWorkspace.js';
import { CircadianScheduleWorkspace } from './chrono/CircadianScheduleWorkspace.js';
import { WorkflowOrchestratorModal } from './orchestration/WorkflowOrchestratorModal.js';
import { ConsolidatedDossierTab } from './orchestration/ConsolidatedDossierTab.js';
import { ReviewQueueTab } from './orchestration/ReviewQueueTab.js';
import { PatientExportPurgeModal } from './governance/PatientExportPurgeModal.js';
import { LabMeasurementList } from './LabMeasurementList.js';
import { MedicationList } from './MedicationList.js';
import { PrescriptionOCRWorkspace } from './ocr/PrescriptionOCRWorkspace.js';

interface PatientDashboardProps {
  patient: Patient;
  medications: Medication[];
  allergies: Allergy[];
  diagnoses: Diagnosis[];
  labMeasurements: LabMeasurement[];
  auditLogs: AuditLog[];
  duplicateIngredients: DuplicateIngredientGroup[];
  // Handlers
  onAddMedication: (data: any) => Promise<void>;
  onUpdateMedication: (id: string, data: any) => Promise<void>;
  onDeleteMedication: (id: string) => Promise<void>;
  onUpdateMedicationVerification: (id: string, status: VerificationStatus) => Promise<void>;
  onMedicationReconciled?: () => Promise<void>;

  onAddAllergy: (data: any) => Promise<void>;
  onUpdateAllergy: (id: string, data: any) => Promise<void>;
  onDeleteAllergy: (id: string) => Promise<void>;
  onUpdateAllergyVerification: (id: string, status: VerificationStatus) => Promise<void>;

  onAddDiagnosis: (data: any) => Promise<void>;
  onUpdateDiagnosis: (id: string, data: any) => Promise<void>;
  onDeleteDiagnosis: (id: string) => Promise<void>;
  onUpdateDiagnosisVerification: (id: string, status: VerificationStatus) => Promise<void>;

  onAddLab: (data: any) => Promise<void>;
  onUpdateLab: (id: string, data: any) => Promise<void>;
  onDeleteLab: (id: string) => Promise<void>;
  onUpdateLabVerification: (id: string, status: VerificationStatus) => Promise<void>;
}

export const PatientDashboard: React.FC<PatientDashboardProps> = ({
  patient,
  medications,
  allergies,
  diagnoses,
  labMeasurements,
  auditLogs,
  duplicateIngredients,
  onAddMedication,
  onUpdateMedication,
  onDeleteMedication,
  onUpdateMedicationVerification,
  onAddAllergy,
  onUpdateAllergy,
  onDeleteAllergy,
  onUpdateAllergyVerification,
  onAddDiagnosis,
  onUpdateDiagnosis,
  onDeleteDiagnosis,
  onUpdateDiagnosisVerification,
  onAddLab,
  onUpdateLab,
  onDeleteLab,
  onUpdateLabVerification,
  onMedicationReconciled,
}) => {
  // Four Primary Navigation Areas
  const [primaryTab, setPrimaryTab] = useState<'overview' | 'medications' | 'reviews' | 'workflow'>('overview');

  // Secondary sub-views within each primary area
  const [overviewSubView, setOverviewSubView] = useState<'summary' | 'allergies' | 'diagnoses' | 'labs' | 'duplicates'>('summary');
  const [medsSubView, setMedsSubView] = useState<'list' | 'ocr'>('list');
  const [reviewsSubView, setReviewsSubView] = useState<'queue' | 'interactions' | 'chrono'>('queue');
  const [workflowSubView, setWorkflowSubView] = useState<'dossier' | 'audit' | 'agents'>('dossier');

  // Modals
  const [workflowModalOpen, setWorkflowModalOpen] = useState(false);
  const [governanceModalOpen, setGovernanceModalOpen] = useState(false);

  // Pending reviews state for badges and next-action panel
  const [pendingReviewsCount, setPendingReviewsCount] = useState<number>(0);

  useEffect(() => {
    const fetchPendingCount = async () => {
      try {
        const list = await api.getPendingReviews();
        setPendingReviewsCount(list ? list.filter((r) => r.status === 'pending').length : 0);
      } catch {
        setPendingReviewsCount(0);
      }
    };
    fetchPendingCount();
  }, [patient.id, medications]);

  const activeMeds = medications.filter((m) => m.status === 'active' || m.status === 'prn');
  const unverifiedMedsCount = medications.filter((m) => m.verificationStatus === 'unverified').length;
  const severeAllergiesCount = allergies.filter(
    (a) => a.severity === 'severe' || a.severity === 'life-threatening'
  ).length;

  // Determine Next Action from persisted clinical state
  const getNextAction = () => {
    if (unverifiedMedsCount > 0) {
      return {
        stateLabel: 'Medication Reconciliation Pending',
        taskTitle: `${unverifiedMedsCount} unverified medication order${unverifiedMedsCount > 1 ? 's' : ''} require clinical confirmation`,
        reason: 'Unverified medication records are blocked by Rule 1 safety gates and cannot be evaluated for pharmacokinetic conflicts or circadian scheduling.',
        buttonText: 'Confirm Medication Orders',
        action: () => {
          setPrimaryTab('medications');
          setMedsSubView('list');
        },
      };
    }

    if (duplicateIngredients.length > 0) {
      return {
        stateLabel: 'Duplicate Pharmaceutical Entity Hazard',
        taskTitle: `${duplicateIngredients.length} active duplicate ingredient conflict(s) detected`,
        reason: 'Co-prescribed products contain identical active molecules, presenting serious risk of cumulative toxicity in geriatric patients.',
        buttonText: 'Review Duplicate Hazards',
        action: () => {
          setPrimaryTab('overview');
          setOverviewSubView('duplicates');
        },
      };
    }

    if (pendingReviewsCount > 0) {
      return {
        stateLabel: 'Clinical Review Gate Awaiting Sign-Off',
        taskTitle: `${pendingReviewsCount} review item${pendingReviewsCount > 1 ? 's' : ''} in clinician queue`,
        reason: 'Autonomous AI sign-off is strictly prohibited. An authorized licensed clinician must review and resolve items in the queue.',
        buttonText: 'Open Review Queue',
        action: () => {
          setPrimaryTab('reviews');
          setReviewsSubView('queue');
        },
      };
    }

    return {
      stateLabel: 'Regimen Reconciled & Deterministically Verified',
      taskTitle: 'All active medications verified with zero unresolved safety gates',
      reason: 'Medication identities, ingredients, and organ thresholds are confirmed. The 3-agent orchestration pipeline can be executed or the consolidated clinical dossier inspected.',
      buttonText: 'View Consolidated Dossier',
      action: () => {
        setPrimaryTab('workflow');
        setWorkflowSubView('dossier');
      },
    };
  };

  const nextAction = getNextAction();

  return (
    <div className="space-y-5">
      {/* 1. Primary Navigation Bar (4 Areas) */}
      <nav
        aria-label="Primary Application Navigation"
        className="bg-white border border-[#E6E3E1] rounded-sm p-1.5 shadow-editorial flex flex-wrap items-center justify-between gap-2"
      >
        <div className="flex items-center gap-1 overflow-x-auto py-0.5">
          {/* 1. Overview */}
          <button
            type="button"
            onClick={() => setPrimaryTab('overview')}
            aria-current={primaryTab === 'overview' ? 'page' : undefined}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-sm transition-all flex items-center gap-2 ${
              primaryTab === 'overview'
                ? 'bg-[#1747E8] text-white shadow-editorial'
                : 'text-[#525252] hover:text-[#171717] hover:bg-[#FAF9F8]'
            }`}
          >
            <Activity className="w-4 h-4" aria-hidden="true" />
            <span>Overview</span>
          </button>

          {/* 2. Medications */}
          <button
            type="button"
            onClick={() => setPrimaryTab('medications')}
            aria-current={primaryTab === 'medications' ? 'page' : undefined}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-sm transition-all flex items-center gap-2 ${
              primaryTab === 'medications'
                ? 'bg-[#1747E8] text-white shadow-editorial'
                : 'text-[#525252] hover:text-[#171717] hover:bg-[#FAF9F8]'
            }`}
          >
            <Pill className="w-4 h-4" aria-hidden="true" />
            <span>Medications</span>
            <span
              className={`px-1.5 py-0.2 rounded-sm text-[10px] font-bold tabular-nums ${
                primaryTab === 'medications'
                  ? 'bg-white/20 text-white'
                  : 'bg-[#FAF9F8] text-[#777777] border border-[#E6E3E1]'
              }`}
            >
              {medications.length}
            </span>
          </button>

          {/* 3. Review Queue */}
          <button
            type="button"
            onClick={() => setPrimaryTab('reviews')}
            aria-current={primaryTab === 'reviews' ? 'page' : undefined}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-sm transition-all flex items-center gap-2 ${
              primaryTab === 'reviews'
                ? 'bg-[#1747E8] text-white shadow-editorial'
                : 'text-[#525252] hover:text-[#171717] hover:bg-[#FAF9F8]'
            }`}
          >
            <ClipboardCheck className="w-4 h-4" aria-hidden="true" />
            <span>Review Queue</span>
            {pendingReviewsCount > 0 ? (
              <span className="px-1.5 py-0.2 rounded-sm text-[10px] font-bold bg-[#FEF3C7] text-[#92400E] border border-[#FDE68A] tabular-nums">
                {pendingReviewsCount}
              </span>
            ) : (
              <span
                className={`px-1.5 py-0.2 rounded-sm text-[10px] font-bold ${
                  primaryTab === 'reviews' ? 'bg-white/20 text-white' : 'bg-[#FAF9F8] text-[#777777] border border-[#E6E3E1]'
                }`}
              >
                Clear
              </span>
            )}
          </button>

          {/* 4. Workflow & Audit */}
          <button
            type="button"
            onClick={() => setPrimaryTab('workflow')}
            aria-current={primaryTab === 'workflow' ? 'page' : undefined}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-sm transition-all flex items-center gap-2 ${
              primaryTab === 'workflow'
                ? 'bg-[#1747E8] text-white shadow-editorial'
                : 'text-[#525252] hover:text-[#171717] hover:bg-[#FAF9F8]'
            }`}
          >
            <Layers className="w-4 h-4" aria-hidden="true" />
            <span>Workflow &amp; Audit</span>
          </button>
        </div>

        {/* Global Quick Actions */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setWorkflowModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-[#F0F3FF] text-[#1747E8] border border-[#D7DEFF] hover:bg-[#D7DEFF] rounded-sm transition-colors"
          >
            <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">Run 3-Agent Workflow</span>
          </button>

          <button
            type="button"
            onClick={() => setGovernanceModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-[#525252] hover:text-[#171717] hover:bg-[#FAF9F8] border border-[#E6E3E1] rounded-sm transition-colors"
            title="Export patient dossier or purge record"
          >
            <Shield className="w-3.5 h-3.5 text-[#B45309]" aria-hidden="true" />
            <span className="hidden sm:inline">Governance</span>
          </button>
        </div>
      </nav>

      {/* Duplicate Ingredient Alert Banner if active in any view */}
      {duplicateIngredients.length > 0 && primaryTab !== 'overview' && (
        <aside
          aria-label="High Priority Duplicate Ingredient Alert"
          className="p-3 bg-[#FFFDF5] border border-[#FECACA] text-[#171717] rounded-sm flex items-center justify-between gap-3 text-xs shadow-editorial"
        >
          <div className="flex items-center gap-2.5">
            <AlertOctagon className="w-4 h-4 text-[#DC2626] flex-shrink-0" aria-hidden="true" />
            <span>
              <strong className="text-[#991B1B]">Duplicate Ingredient Alert:</strong> Patient has{' '}
              {duplicateIngredients.length} active duplicate pharmaceutical ingredient conflict(s).
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              setPrimaryTab('overview');
              setOverviewSubView('duplicates');
            }}
            className="text-[#DC2626] font-bold underline hover:text-[#991B1B] flex-shrink-0"
          >
            Review Hazards &rarr;
          </button>
        </aside>
      )}

      {/* ============================================================== */}
      {/* 1. OVERVIEW VIEW */}
      {/* ============================================================== */}
      {primaryTab === 'overview' && (
        <div className="space-y-4">
          {/* Feature: Next-Action Panel (Cobalt/Periwinkle Swiss Panel) */}
          <section
            aria-label="Clinical Decision Support Next Action"
            className="bg-[#1747E8] text-white rounded-sm p-5 shadow-editorial relative overflow-hidden pattern-dots"
          >
            <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-5">
              <div className="space-y-1.5 max-w-2xl">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-sm bg-white/15 text-white text-[10px] font-bold uppercase tracking-wider border border-white/20">
                    <Sparkles className="w-3 h-3 text-[#D7DEFF]" />
                    <span>CDS Workflow State</span>
                  </span>
                  <span className="text-xs text-[#D7DEFF] font-medium">{nextAction.stateLabel}</span>
                </div>

                <h3 className="text-lg font-bold tracking-tight text-white">
                  {nextAction.taskTitle}
                </h3>

                <p className="text-xs text-white/85 leading-relaxed">
                  {nextAction.reason}
                </p>
              </div>

              <div className="flex-shrink-0">
                <button
                  type="button"
                  onClick={nextAction.action}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-white text-[#1747E8] hover:bg-[#F0F3FF] text-xs font-bold rounded-sm transition-all shadow-editorial focus:ring-2 focus:ring-white"
                >
                  <span>{nextAction.buttonText}</span>
                  <ArrowRight className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>
            </div>
          </section>

          {/* Compact Summary Metrics (Single aligned row with subtle dividers) */}
          <section
            aria-label="Patient Summary Metrics"
            className="bg-white border border-[#E6E3E1] rounded-sm shadow-editorial grid grid-cols-2 sm:grid-cols-5 divide-y sm:divide-y-0 sm:divide-x divide-[#E6E3E1] overflow-hidden"
          >
            {/* Metric 1: Total Medications */}
            <button
              type="button"
              onClick={() => {
                setPrimaryTab('medications');
                setMedsSubView('list');
              }}
              className="p-3.5 text-left hover:bg-[#FAF9F8] transition-colors focus:outline-none"
            >
              <div className="flex items-center justify-between text-[#777777] mb-1">
                <span className="text-[10px] font-bold uppercase tracking-wider">Total Meds</span>
                <Pill className="w-3.5 h-3.5 text-[#1747E8]" />
              </div>
              <div className="text-2xl font-bold text-[#171717] tabular-nums">{medications.length}</div>
              <div className="text-[11px] text-[#777777] mt-0.5">
                {activeMeds.length} active or PRN
              </div>
            </button>

            {/* Metric 2: Unverified Medications */}
            <button
              type="button"
              onClick={() => {
                setPrimaryTab('medications');
                setMedsSubView('list');
              }}
              className={`p-3.5 text-left hover:bg-[#FAF9F8] transition-colors focus:outline-none ${
                unverifiedMedsCount > 0 ? 'bg-[#FEF3C7]/30' : ''
              }`}
            >
              <div className="flex items-center justify-between text-[#777777] mb-1">
                <span className="text-[10px] font-bold uppercase tracking-wider">Unverified</span>
                <AlertOctagon className={`w-3.5 h-3.5 ${unverifiedMedsCount > 0 ? 'text-[#B45309]' : 'text-[#777777]'}`} />
              </div>
              <div className={`text-2xl font-bold tabular-nums ${unverifiedMedsCount > 0 ? 'text-[#92400E]' : 'text-[#171717]'}`}>
                {unverifiedMedsCount}
              </div>
              <div className="text-[11px] text-[#777777] mt-0.5">
                {unverifiedMedsCount > 0 ? (
                  <span className="text-[#92400E] font-semibold">Requires attention</span>
                ) : (
                  <span>All confirmed</span>
                )}
              </div>
            </button>

            {/* Metric 3: Documented Allergies */}
            <button
              type="button"
              onClick={() => setOverviewSubView('allergies')}
              className="p-3.5 text-left hover:bg-[#FAF9F8] transition-colors focus:outline-none"
            >
              <div className="flex items-center justify-between text-[#777777] mb-1">
                <span className="text-[10px] font-bold uppercase tracking-wider">Allergies</span>
                <ShieldAlert className="w-3.5 h-3.5 text-[#B45309]" />
              </div>
              <div className="text-2xl font-bold text-[#171717] tabular-nums">{allergies.length}</div>
              <div className="text-[11px] text-[#777777] mt-0.5">
                {severeAllergiesCount > 0 ? (
                  <span className="text-[#DC2626] font-semibold">{severeAllergiesCount} severe</span>
                ) : (
                  <span>Documented</span>
                )}
              </div>
            </button>

            {/* Metric 4: Diagnoses */}
            <button
              type="button"
              onClick={() => setOverviewSubView('diagnoses')}
              className="p-3.5 text-left hover:bg-[#FAF9F8] transition-colors focus:outline-none"
            >
              <div className="flex items-center justify-between text-[#777777] mb-1">
                <span className="text-[10px] font-bold uppercase tracking-wider">Diagnoses</span>
                <Activity className="w-3.5 h-3.5 text-[#1747E8]" />
              </div>
              <div className="text-2xl font-bold text-[#171717] tabular-nums">{diagnoses.length}</div>
              <div className="text-[11px] text-[#777777] mt-0.5">Problem list</div>
            </button>

            {/* Metric 5: Lab Measurements */}
            <button
              type="button"
              onClick={() => setOverviewSubView('labs')}
              className="p-3.5 text-left hover:bg-[#FAF9F8] transition-colors focus:outline-none"
            >
              <div className="flex items-center justify-between text-[#777777] mb-1">
                <span className="text-[10px] font-bold uppercase tracking-wider">Lab Panels</span>
                <FlaskConical className="w-3.5 h-3.5 text-[#1747E8]" />
              </div>
              <div className="text-2xl font-bold text-[#171717] tabular-nums">{labMeasurements.length}</div>
              <div className="text-[11px] text-[#777777] mt-0.5">Renal &amp; Hepatic</div>
            </button>
          </section>

          {/* Overview Secondary Navigation Tabs */}
          <div className="flex items-center gap-1.5 border-b border-[#E6E3E1] pb-1 overflow-x-auto">
            <button
              type="button"
              onClick={() => setOverviewSubView('summary')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-sm transition-colors ${
                overviewSubView === 'summary'
                  ? 'bg-white text-[#1747E8] border border-[#E6E3E1] shadow-xs'
                  : 'text-[#525252] hover:text-[#171717]'
              }`}
            >
              Regimen Summary
            </button>

            <button
              type="button"
              onClick={() => setOverviewSubView('allergies')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-sm transition-colors flex items-center gap-1.5 ${
                overviewSubView === 'allergies'
                  ? 'bg-white text-[#1747E8] border border-[#E6E3E1] shadow-xs'
                  : 'text-[#525252] hover:text-[#171717]'
              }`}
            >
              <span>Allergies</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-sm bg-[#FAF9F8] border border-[#E6E3E1]">
                {allergies.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setOverviewSubView('diagnoses')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-sm transition-colors flex items-center gap-1.5 ${
                overviewSubView === 'diagnoses'
                  ? 'bg-white text-[#1747E8] border border-[#E6E3E1] shadow-xs'
                  : 'text-[#525252] hover:text-[#171717]'
              }`}
            >
              <span>Problem List</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-sm bg-[#FAF9F8] border border-[#E6E3E1]">
                {diagnoses.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setOverviewSubView('labs')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-sm transition-colors flex items-center gap-1.5 ${
                overviewSubView === 'labs'
                  ? 'bg-white text-[#1747E8] border border-[#E6E3E1] shadow-xs'
                  : 'text-[#525252] hover:text-[#171717]'
              }`}
            >
              <span>Renal &amp; Hepatic Labs</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-sm bg-[#FAF9F8] border border-[#E6E3E1]">
                {labMeasurements.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setOverviewSubView('duplicates')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-sm transition-colors flex items-center gap-1.5 ${
                overviewSubView === 'duplicates'
                  ? 'bg-white text-[#1747E8] border border-[#E6E3E1] shadow-xs'
                  : duplicateIngredients.length > 0
                    ? 'text-[#DC2626]'
                    : 'text-[#525252] hover:text-[#171717]'
              }`}
            >
              <span>Duplicate Ingredients</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-sm ${
                duplicateIngredients.length > 0
                  ? 'bg-[#FEE2E2] text-[#991B1B] border border-[#FECACA]'
                  : 'bg-[#FAF9F8] text-[#777777] border border-[#E6E3E1]'
              }`}>
                {duplicateIngredients.length}
              </span>
            </button>
          </div>

          {/* Sub-view Panels for Overview */}
          <div>
            {overviewSubView === 'summary' && (
              <div className="space-y-4">
                {/* Duplicate ingredient summary if exists */}
                {duplicateIngredients.length > 0 && (
                  <DuplicateIngredientAlert
                    duplicates={duplicateIngredients}
                    onSelectMedication={() => {
                      setPrimaryTab('medications');
                      setMedsSubView('list');
                    }}
                  />
                )}

                {/* Quick Medication Orders Roster */}
                <div className="bg-white border border-[#E6E3E1] rounded-sm p-4 sm:p-5 shadow-editorial space-y-3">
                  <div className="flex items-center justify-between border-b border-[#E6E3E1] pb-2.5">
                    <div>
                      <h4 className="text-sm font-bold text-[#171717]">
                        Active Prescribed Regimen ({activeMeds.length} active orders)
                      </h4>
                      <p className="text-xs text-[#777777]">
                        Current confirmed and unverified medications requiring clinical surveillance.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setPrimaryTab('medications');
                        setMedsSubView('list');
                      }}
                      className="text-xs font-semibold text-[#1747E8] hover:text-[#1238C7] flex items-center gap-1"
                    >
                      <span>Full Medication Workspace</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="divide-y divide-[#E6E3E1]">
                    {activeMeds.slice(0, 6).map((med) => (
                      <div
                        key={med.id}
                        className="py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                      >
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-[#171717]">{med.brand}</span>
                            <span className="text-[#777777] font-medium">({med.genericName})</span>
                            <span className="font-semibold text-[#1747E8] tabular-nums">{med.strength}</span>
                          </div>
                          <div className="text-[11px] text-[#525252]">
                            <span>{med.prescribedDose}</span> &bull; <span>{med.frequency}</span> &bull; <span>{med.route}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className={`px-1.5 py-0.2 rounded-sm text-[10px] font-bold uppercase tracking-wider ${
                            med.verificationStatus === 'confirmed'
                              ? 'bg-[#ECFDF5] text-[#065F46] border border-[#A7F3D0]'
                              : 'bg-[#FEF3C7] text-[#92400E] border border-[#FDE68A]'
                          }`}>
                            {med.verificationStatus}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {activeMeds.length > 6 && (
                    <div className="pt-2 text-center border-t border-[#E6E3E1]">
                      <button
                        type="button"
                        onClick={() => {
                          setPrimaryTab('medications');
                          setMedsSubView('list');
                        }}
                        className="text-xs font-semibold text-[#1747E8] hover:underline"
                      >
                        View all {activeMeds.length} medications &rarr;
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {overviewSubView === 'allergies' && (
              <AllergyList
                allergies={allergies}
                patientId={patient.id}
                onAddAllergy={onAddAllergy}
                onUpdateAllergy={onUpdateAllergy}
                onDeleteAllergy={onDeleteAllergy}
                onUpdateVerification={onUpdateAllergyVerification}
              />
            )}

            {overviewSubView === 'diagnoses' && (
              <DiagnosisList
                diagnoses={diagnoses}
                patientId={patient.id}
                onAddDiagnosis={onAddDiagnosis}
                onUpdateDiagnosis={onUpdateDiagnosis}
                onDeleteDiagnosis={onDeleteDiagnosis}
                onUpdateVerification={onUpdateDiagnosisVerification}
              />
            )}

            {overviewSubView === 'labs' && (
              <LabMeasurementList
                labs={labMeasurements}
                patient={patient}
                onAddLab={onAddLab}
                onUpdateLab={onUpdateLab}
                onDeleteLab={onDeleteLab}
                onUpdateVerification={onUpdateLabVerification}
              />
            )}

            {overviewSubView === 'duplicates' && (
              <DuplicateIngredientAlert
                duplicates={duplicateIngredients}
                onSelectMedication={() => {
                  setPrimaryTab('medications');
                  setMedsSubView('list');
                }}
              />
            )}
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* 2. MEDICATIONS VIEW */}
      {/* ============================================================== */}
      {primaryTab === 'medications' && (
        <div className="space-y-4">
          {/* Secondary Sub-nav for Medications */}
          <div className="flex items-center gap-1.5 border-b border-[#E6E3E1] pb-1 overflow-x-auto">
            <button
              type="button"
              onClick={() => setMedsSubView('list')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-sm transition-colors flex items-center gap-1.5 ${
                medsSubView === 'list'
                  ? 'bg-white text-[#1747E8] border border-[#E6E3E1] shadow-xs'
                  : 'text-[#525252] hover:text-[#171717]'
              }`}
            >
              <Pill className="w-3.5 h-3.5" />
              <span>Medication Orders ({medications.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setMedsSubView('ocr')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-sm transition-colors flex items-center gap-1.5 ${
                medsSubView === 'ocr'
                  ? 'bg-white text-[#1747E8] border border-[#E6E3E1] shadow-xs'
                  : 'text-[#525252] hover:text-[#171717]'
              }`}
            >
              <FileScan className="w-3.5 h-3.5" />
              <span>Prescription OCR Intake</span>
            </button>
          </div>

          {/* Medication List or OCR Intake */}
          {medsSubView === 'list' && (
            <MedicationList
              medications={medications}
              patientId={patient.id}
              onAddMedication={onAddMedication}
              onUpdateMedication={onUpdateMedication}
              onDeleteMedication={onDeleteMedication}
              onUpdateVerification={onUpdateMedicationVerification}
            />
          )}

          {medsSubView === 'ocr' && (
            <PrescriptionOCRWorkspace
              patientId={patient.id}
              patientName={patient.name}
              activeMedications={medications}
              onMedicationReconciled={onMedicationReconciled || (async () => {})}
            />
          )}
        </div>
      )}

      {/* ============================================================== */}
      {/* 3. REVIEW QUEUE VIEW */}
      {/* ============================================================== */}
      {primaryTab === 'reviews' && (
        <div className="space-y-4">
          {/* Secondary Sub-nav for Reviews */}
          <div className="flex items-center gap-1.5 border-b border-[#E6E3E1] pb-1 overflow-x-auto">
            <button
              type="button"
              onClick={() => setReviewsSubView('queue')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-sm transition-colors flex items-center gap-1.5 ${
                reviewsSubView === 'queue'
                  ? 'bg-white text-[#1747E8] border border-[#E6E3E1] shadow-xs'
                  : 'text-[#525252] hover:text-[#171717]'
              }`}
            >
              <ClipboardCheck className="w-3.5 h-3.5" />
              <span>Review Queue</span>
              {pendingReviewsCount > 0 && (
                <span className="text-[10px] px-1.5 py-0.2 rounded-sm bg-[#FEF3C7] text-[#92400E] border border-[#FDE68A]">
                  {pendingReviewsCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setReviewsSubView('interactions')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-sm transition-colors flex items-center gap-1.5 ${
                reviewsSubView === 'interactions'
                  ? 'bg-white text-[#1747E8] border border-[#E6E3E1] shadow-xs'
                  : 'text-[#525252] hover:text-[#171717]'
              }`}
            >
              <Cpu className="w-3.5 h-3.5" />
              <span>PK Conflict Engine</span>
            </button>

            <button
              type="button"
              onClick={() => setReviewsSubView('chrono')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-sm transition-colors flex items-center gap-1.5 ${
                reviewsSubView === 'chrono'
                  ? 'bg-white text-[#1747E8] border border-[#E6E3E1] shadow-xs'
                  : 'text-[#525252] hover:text-[#171717]'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>Circadian Schedule</span>
            </button>
          </div>

          {reviewsSubView === 'queue' && (
            <ReviewQueueTab
              patientId={patient.id}
              onRefreshParent={onMedicationReconciled}
            />
          )}

          {reviewsSubView === 'interactions' && (
            <InteractionReviewWorkspace
              patientId={patient.id}
              patientName={patient.name}
              onRefreshParent={onMedicationReconciled}
            />
          )}

          {reviewsSubView === 'chrono' && (
            <CircadianScheduleWorkspace
              patientId={patient.id}
              patientName={patient.name}
              onRefreshParent={onMedicationReconciled}
            />
          )}
        </div>
      )}

      {/* ============================================================== */}
      {/* 4. WORKFLOW & AUDIT VIEW */}
      {/* ============================================================== */}
      {primaryTab === 'workflow' && (
        <div className="space-y-4">
          {/* Secondary Sub-nav for Workflow & Audit */}
          <div className="flex items-center gap-1.5 border-b border-[#E6E3E1] pb-1 overflow-x-auto">
            <button
              type="button"
              onClick={() => setWorkflowSubView('dossier')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-sm transition-colors flex items-center gap-1.5 ${
                workflowSubView === 'dossier'
                  ? 'bg-white text-[#1747E8] border border-[#E6E3E1] shadow-xs'
                  : 'text-[#525252] hover:text-[#171717]'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Consolidated Dossier</span>
            </button>

            <button
              type="button"
              onClick={() => setWorkflowSubView('audit')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-sm transition-colors flex items-center gap-1.5 ${
                workflowSubView === 'audit'
                  ? 'bg-white text-[#1747E8] border border-[#E6E3E1] shadow-xs'
                  : 'text-[#525252] hover:text-[#171717]'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              <span>Audit Trail ({auditLogs.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setWorkflowSubView('agents')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-sm transition-colors flex items-center gap-1.5 ${
                workflowSubView === 'agents'
                  ? 'bg-white text-[#1747E8] border border-[#E6E3E1] shadow-xs'
                  : 'text-[#525252] hover:text-[#171717]'
              }`}
            >
              <Bot className="w-3.5 h-3.5" />
              <span>Agent Contracts &amp; Rules</span>
            </button>
          </div>

          {workflowSubView === 'dossier' && (
            <ConsolidatedDossierTab
              patientId={patient.id}
              patientName={patient.name}
              mrn={patient.mrn}
              onOpenWorkflow={() => setWorkflowModalOpen(true)}
              onOpenGovernance={() => setGovernanceModalOpen(true)}
            />
          )}

          {workflowSubView === 'audit' && (
            <AuditTrailView auditLogs={auditLogs} />
          )}

          {workflowSubView === 'agents' && (
            <AgentContractPreview patientId={patient.id} />
          )}
        </div>
      )}

      {/* Workflow Orchestrator Stepper Modal */}
      <WorkflowOrchestratorModal
        isOpen={workflowModalOpen}
        onClose={() => setWorkflowModalOpen(false)}
        patientId={patient.id}
        patientName={patient.name}
        onViewReport={() => {
          setWorkflowModalOpen(false);
          setPrimaryTab('workflow');
          setWorkflowSubView('dossier');
        }}
        onMedicationReconciled={onMedicationReconciled}
      />

      {/* Security & Governance Modal */}
      <PatientExportPurgeModal
        isOpen={governanceModalOpen}
        onClose={() => setGovernanceModalOpen(false)}
        patientId={patient.id}
        patientName={patient.name}
        mrn={patient.mrn}
        onPatientPurged={() => {
          setGovernanceModalOpen(false);
          window.location.reload();
        }}
      />
    </div>
  );
};
