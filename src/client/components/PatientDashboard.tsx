import React, { useState } from 'react';
import {
  Activity,
  AlertOctagon,
  Bot,
  Clock,
  Cpu,
  FileScan,
  FileText,
  FlaskConical,
  History,
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
import { AgentContractPreview } from './AgentContractPreview.js';
import { AllergyList } from './AllergyList.js';
import { AuditTrailView } from './AuditTrailView.js';
import { DiagnosisList } from './DiagnosisList.js';
import { DuplicateIngredientAlert } from './DuplicateIngredientAlert.js';
import { InteractionReviewWorkspace } from './interactions/InteractionReviewWorkspace.js';
import { CircadianScheduleWorkspace } from './chrono/CircadianScheduleWorkspace.js';
import { WorkflowOrchestratorModal } from './orchestration/WorkflowOrchestratorModal.js';
import { ConsolidatedDossierTab } from './orchestration/ConsolidatedDossierTab.js';
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
  const [activeTab, setActiveTab] = useState<
    'dossier' | 'medications' | 'interactions' | 'chrono' | 'ocr' | 'duplicates' | 'allergies' | 'diagnoses' | 'labs' | 'audit' | 'agents'
  >('medications');
  const [workflowModalOpen, setWorkflowModalOpen] = useState(false);
  const [governanceModalOpen, setGovernanceModalOpen] = useState(false);

  const activeMeds = medications.filter((m) => m.status === 'active' || m.status === 'prn');
  const unverifiedMedsCount = medications.filter((m) => m.verificationStatus === 'unverified').length;
  const severeAllergiesCount = allergies.filter(
    (a) => a.severity === 'severe' || a.severity === 'life-threatening'
  ).length;

  return (
    <div className="space-y-5">
      {/* KPI Overview Summary Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Active Meds Card */}
        <button
          type="button"
          onClick={() => setActiveTab('medications')}
          className={`p-3.5 rounded-xl border text-left transition-all shadow-xs ${
            activeTab === 'medications'
              ? 'bg-clinical-50/70 border-clinical-300 ring-2 ring-clinical-500'
              : 'bg-white border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between text-clinical-600 mb-1">
            <Pill className="w-4 h-4" aria-hidden="true" />
            <span className="text-2xs font-bold text-slate-400 uppercase">Meds</span>
          </div>
          <div className="text-xl font-bold text-slate-900">{activeMeds.length}</div>
          <div className="text-2xs text-slate-500 mt-0.5">
            {unverifiedMedsCount > 0 ? (
              <span className="text-amber-600 font-semibold">{unverifiedMedsCount} unverified</span>
            ) : (
              <span>All confirmed</span>
            )}
          </div>
        </button>

        {/* Duplicate Ingredient Hazard Card */}
        <button
          type="button"
          onClick={() => setActiveTab('duplicates')}
          className={`p-3.5 rounded-xl border text-left transition-all shadow-xs ${
            duplicateIngredients.length > 0
              ? activeTab === 'duplicates'
                ? 'bg-red-50 border-red-400 ring-2 ring-red-500'
                : 'bg-red-50/70 border-red-300 hover:bg-red-50'
              : activeTab === 'duplicates'
                ? 'bg-emerald-50 border-emerald-300 ring-2 ring-emerald-500'
                : 'bg-white border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between mb-1">
            <AlertOctagon
              className={`w-4 h-4 ${duplicateIngredients.length > 0 ? 'text-red-600 animate-pulse' : 'text-emerald-600'}`}
              aria-hidden="true"
            />
            <span className="text-2xs font-bold text-slate-400 uppercase">Duplicates</span>
          </div>
          <div
            className={`text-xl font-bold ${
              duplicateIngredients.length > 0 ? 'text-red-700' : 'text-emerald-700'
            }`}
          >
            {duplicateIngredients.length}
          </div>
          <div className="text-2xs text-slate-500 mt-0.5">
            {duplicateIngredients.length > 0 ? (
              <span className="text-red-700 font-bold">Action Needed</span>
            ) : (
              <span>None Detected</span>
            )}
          </div>
        </button>

        {/* Allergies Card */}
        <button
          type="button"
          onClick={() => setActiveTab('allergies')}
          className={`p-3.5 rounded-xl border text-left transition-all shadow-xs ${
            activeTab === 'allergies'
              ? 'bg-amber-50/70 border-amber-300 ring-2 ring-amber-500'
              : 'bg-white border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between text-amber-600 mb-1">
            <ShieldAlert className="w-4 h-4" aria-hidden="true" />
            <span className="text-2xs font-bold text-slate-400 uppercase">Allergies</span>
          </div>
          <div className="text-xl font-bold text-slate-900">{allergies.length}</div>
          <div className="text-2xs text-slate-500 mt-0.5">
            {severeAllergiesCount > 0 ? (
              <span className="text-red-600 font-semibold">{severeAllergiesCount} severe</span>
            ) : (
              <span>Documented</span>
            )}
          </div>
        </button>

        {/* Diagnoses Card */}
        <button
          type="button"
          onClick={() => setActiveTab('diagnoses')}
          className={`p-3.5 rounded-xl border text-left transition-all shadow-xs ${
            activeTab === 'diagnoses'
              ? 'bg-purple-50/70 border-purple-300 ring-2 ring-purple-500'
              : 'bg-white border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between text-purple-600 mb-1">
            <Activity className="w-4 h-4" aria-hidden="true" />
            <span className="text-2xs font-bold text-slate-400 uppercase">Diagnoses</span>
          </div>
          <div className="text-xl font-bold text-slate-900">{diagnoses.length}</div>
          <div className="text-2xs text-slate-500 mt-0.5">Problem List</div>
        </button>

        {/* Lab Measurements Card */}
        <button
          type="button"
          onClick={() => setActiveTab('labs')}
          className={`p-3.5 rounded-xl border text-left transition-all shadow-xs ${
            activeTab === 'labs'
              ? 'bg-blue-50/70 border-blue-300 ring-2 ring-blue-500'
              : 'bg-white border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between text-blue-600 mb-1">
            <FlaskConical className="w-4 h-4" aria-hidden="true" />
            <span className="text-2xs font-bold text-slate-400 uppercase">Labs</span>
          </div>
          <div className="text-xl font-bold text-slate-900">{labMeasurements.length}</div>
          <div className="text-2xs text-slate-500 mt-0.5">Renal &amp; Hepatic</div>
        </button>

        {/* Audit Trail Card */}
        <button
          type="button"
          onClick={() => setActiveTab('audit')}
          className={`p-3.5 rounded-xl border text-left transition-all shadow-xs ${
            activeTab === 'audit'
              ? 'bg-slate-100 border-slate-400 ring-2 ring-slate-500'
              : 'bg-white border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between text-slate-600 mb-1">
            <History className="w-4 h-4" aria-hidden="true" />
            <span className="text-2xs font-bold text-slate-400 uppercase">Audit</span>
          </div>
          <div className="text-xl font-bold text-slate-900">{auditLogs.length}</div>
          <div className="text-2xs text-slate-500 mt-0.5">Logged Actions</div>
        </button>
      </div>

      {/* Duplicate Ingredient Immediate Alert Banner if exists */}
      {duplicateIngredients.length > 0 && activeTab !== 'duplicates' && (
        <aside
          aria-label="High Priority Clinical Alert"
          className="p-3 bg-red-100 border-l-4 border-red-600 text-red-950 rounded-r-lg flex items-center justify-between gap-3 text-xs shadow-xs"
        >
          <div className="flex items-center gap-2">
            <AlertOctagon className="w-4 h-4 text-red-600 flex-shrink-0" aria-hidden="true" />
            <span>
              <strong>Duplicate Ingredient Alert:</strong> Patient has{' '}
              {duplicateIngredients.length} active duplicate pharmaceutical ingredient conflict(s).
            </span>
          </div>
          <button
            type="button"
            onClick={() => setActiveTab('duplicates')}
            className="text-red-900 font-bold underline hover:text-red-800 flex-shrink-0"
          >
            Review Hazards &rarr;
          </button>
        </aside>
      )}

      {/* Clinical Orchestration & Governance Action Bar */}
      <div className="bg-slate-900 text-white rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3 shadow-sm border border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-clinical-500/20 text-clinical-400 flex items-center justify-center border border-clinical-500/30">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <div className="text-xs font-bold text-white flex items-center gap-2">
              <span>Agent Orchestrator &amp; Clinical Safety Suite</span>
              <span className="px-1.5 py-0.2 bg-clinical-500/30 text-clinical-300 rounded text-2xs border border-clinical-500/40">Phase 5 &amp; 6</span>
            </div>
            <p className="text-2xs text-slate-400">
              Run the 3-agent pipeline (OCR &rarr; PK Conflicts &rarr; Chrono-Dosing) or manage patient data governance.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('dossier')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors border ${
              activeTab === 'dossier'
                ? 'bg-clinical-600 text-white border-clinical-500 shadow-xs'
                : 'bg-slate-800 text-slate-300 hover:text-white border-slate-700 hover:bg-slate-700'
            }`}
          >
            <FileText className="w-3.5 h-3.5 text-clinical-400" />
            <span>Consolidated Dossier</span>
          </button>
          <button
            type="button"
            onClick={() => setWorkflowModalOpen(true)}
            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-clinical-600 hover:bg-clinical-500 text-white flex items-center gap-1.5 transition-colors shadow-xs"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Run 3-Agent Workflow</span>
          </button>
          <button
            type="button"
            onClick={() => setGovernanceModalOpen(true)}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center gap-1.5 transition-colors"
          >
            <Shield className="w-3.5 h-3.5 text-amber-400" />
            <span>Export &amp; Governance</span>
          </button>
        </div>
      </div>

      {/* Main Tabbed Navigation */}
      <nav aria-label="Clinical views" className="border-b border-slate-200 flex items-center gap-1 overflow-x-auto pb-px">
        <button
          type="button"
          onClick={() => setActiveTab('dossier')}
          className={`px-4 py-2.5 text-xs font-semibold border-b-2 flex items-center gap-2 whitespace-nowrap transition-colors ${
            activeTab === 'dossier'
              ? 'border-indigo-600 text-indigo-900 bg-indigo-50/50 rounded-t-lg font-bold'
              : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
          }`}
        >
          <FileText className="w-4 h-4 text-indigo-600" aria-hidden="true" />
          <span>Consolidated Dossier</span>
          <span className="px-1.5 py-0.5 rounded text-2xs font-bold bg-indigo-100 text-indigo-800 border border-indigo-200">
            Phase 6
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('medications')}
          className={`px-4 py-2.5 text-xs font-semibold border-b-2 flex items-center gap-2 whitespace-nowrap transition-colors ${
            activeTab === 'medications'
              ? 'border-clinical-600 text-clinical-800 bg-clinical-50/40 rounded-t-lg'
              : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
          }`}
        >
          <Pill className="w-4 h-4" aria-hidden="true" />
          <span>Medication Orders ({medications.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('ocr')}
          className={`px-4 py-2.5 text-xs font-semibold border-b-2 flex items-center gap-2 whitespace-nowrap transition-colors ${
            activeTab === 'ocr'
              ? 'border-clinical-600 text-clinical-800 bg-clinical-50/40 rounded-t-lg font-bold'
              : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
          }`}
        >
          <FileScan className="w-4 h-4 text-clinical-600" aria-hidden="true" />
          <span>Prescription OCR Intake</span>
          <span className="px-1.5 py-0.5 rounded text-2xs font-bold bg-clinical-100 text-clinical-800 border border-clinical-200">
            Phase 2
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('interactions')}
          className={`px-4 py-2.5 text-xs font-semibold border-b-2 flex items-center gap-2 whitespace-nowrap transition-colors ${
            activeTab === 'interactions'
              ? 'border-clinical-600 text-clinical-800 bg-clinical-50/40 rounded-t-lg font-bold'
              : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
          }`}
        >
          <Cpu className="w-4 h-4 text-clinical-600" aria-hidden="true" />
          <span>PK Conflict Engine</span>
          <span className="px-1.5 py-0.5 rounded text-2xs font-bold bg-cyan-100 text-cyan-800 border border-cyan-200">
            Phase 3
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('chrono')}
          className={`px-4 py-2.5 text-xs font-semibold border-b-2 flex items-center gap-2 whitespace-nowrap transition-colors ${
            activeTab === 'chrono'
              ? 'border-clinical-600 text-clinical-800 bg-clinical-50/40 rounded-t-lg font-bold'
              : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
          }`}
        >
          <Clock className="w-4 h-4 text-clinical-600" aria-hidden="true" />
          <span>Circadian Schedule</span>
          <span className="px-1.5 py-0.5 rounded text-2xs font-bold bg-amber-100 text-amber-800 border border-amber-200">
            Phase 4
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('duplicates')}
          className={`px-4 py-2.5 text-xs font-semibold border-b-2 flex items-center gap-2 whitespace-nowrap transition-colors ${
            activeTab === 'duplicates'
              ? 'border-red-600 text-red-800 bg-red-50/40 rounded-t-lg'
              : duplicateIngredients.length > 0
                ? 'border-transparent text-red-600 hover:text-red-800'
                : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <AlertOctagon className="w-4 h-4" aria-hidden="true" />
          <span>Duplicate Ingredients ({duplicateIngredients.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('allergies')}
          className={`px-4 py-2.5 text-xs font-semibold border-b-2 flex items-center gap-2 whitespace-nowrap transition-colors ${
            activeTab === 'allergies'
              ? 'border-amber-600 text-amber-800 bg-amber-50/40 rounded-t-lg'
              : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
          }`}
        >
          <ShieldAlert className="w-4 h-4" aria-hidden="true" />
          <span>Allergies ({allergies.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('diagnoses')}
          className={`px-4 py-2.5 text-xs font-semibold border-b-2 flex items-center gap-2 whitespace-nowrap transition-colors ${
            activeTab === 'diagnoses'
              ? 'border-purple-600 text-purple-800 bg-purple-50/40 rounded-t-lg'
              : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
          }`}
        >
          <Activity className="w-4 h-4" aria-hidden="true" />
          <span>Problem List ({diagnoses.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('labs')}
          className={`px-4 py-2.5 text-xs font-semibold border-b-2 flex items-center gap-2 whitespace-nowrap transition-colors ${
            activeTab === 'labs'
              ? 'border-blue-600 text-blue-800 bg-blue-50/40 rounded-t-lg'
              : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
          }`}
        >
          <FlaskConical className="w-4 h-4" aria-hidden="true" />
          <span>Renal &amp; Hepatic Labs ({labMeasurements.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('audit')}
          className={`px-4 py-2.5 text-xs font-semibold border-b-2 flex items-center gap-2 whitespace-nowrap transition-colors ${
            activeTab === 'audit'
              ? 'border-slate-800 text-slate-900 bg-slate-100 rounded-t-lg'
              : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
          }`}
        >
          <History className="w-4 h-4" aria-hidden="true" />
          <span>Audit Trail ({auditLogs.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('agents')}
          className={`px-4 py-2.5 text-xs font-semibold border-b-2 flex items-center gap-2 whitespace-nowrap transition-colors ${
            activeTab === 'agents'
              ? 'border-clinical-600 text-clinical-900 bg-clinical-50/60 rounded-t-lg'
              : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
          }`}
        >
          <Bot className="w-4 h-4 text-clinical-600" aria-hidden="true" />
          <span>Future Agent Engine Preview</span>
        </button>
      </nav>

      {/* Tab Panels */}
      <div className="pt-2">
        {activeTab === 'dossier' && (
          <ConsolidatedDossierTab
            patientId={patient.id}
            patientName={patient.name}
            mrn={patient.mrn}
            onOpenWorkflow={() => setWorkflowModalOpen(true)}
            onOpenGovernance={() => setGovernanceModalOpen(true)}
          />
        )}

        {activeTab === 'interactions' && (
          <InteractionReviewWorkspace
            patientId={patient.id}
            patientName={patient.name}
            onRefreshParent={onMedicationReconciled}
          />
        )}

        {activeTab === 'chrono' && (
          <CircadianScheduleWorkspace
            patientId={patient.id}
            patientName={patient.name}
            onRefreshParent={onMedicationReconciled}
          />
        )}

        {activeTab === 'ocr' && (
          <PrescriptionOCRWorkspace
            patientId={patient.id}
            patientName={patient.name}
            activeMedications={medications}
            onMedicationReconciled={onMedicationReconciled || (async () => {})}
          />
        )}

        {activeTab === 'medications' && (
          <MedicationList
            medications={medications}
            patientId={patient.id}
            onAddMedication={onAddMedication}
            onUpdateMedication={onUpdateMedication}
            onDeleteMedication={onDeleteMedication}
            onUpdateVerification={onUpdateMedicationVerification}
          />
        )}

        {activeTab === 'duplicates' && (
          <div className="space-y-4">
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
              <h3 className="text-sm font-bold text-slate-900">Active Duplicate Ingredient Analysis</h3>
              <p className="text-xs text-slate-500">
                Detects identical chemical entities co-prescribed across brand, generic, and combination medications.
              </p>
            </div>
            <DuplicateIngredientAlert
              duplicates={duplicateIngredients}
              onSelectMedication={() => setActiveTab('medications')}
            />
          </div>
        )}

        {activeTab === 'allergies' && (
          <AllergyList
            allergies={allergies}
            patientId={patient.id}
            onAddAllergy={onAddAllergy}
            onUpdateAllergy={onUpdateAllergy}
            onDeleteAllergy={onDeleteAllergy}
            onUpdateVerification={onUpdateAllergyVerification}
          />
        )}

        {activeTab === 'diagnoses' && (
          <DiagnosisList
            diagnoses={diagnoses}
            patientId={patient.id}
            onAddDiagnosis={onAddDiagnosis}
            onUpdateDiagnosis={onUpdateDiagnosis}
            onDeleteDiagnosis={onDeleteDiagnosis}
            onUpdateVerification={onUpdateDiagnosisVerification}
          />
        )}

        {activeTab === 'labs' && (
          <LabMeasurementList
            labs={labMeasurements}
            patient={patient}
            onAddLab={onAddLab}
            onUpdateLab={onUpdateLab}
            onDeleteLab={onDeleteLab}
            onUpdateVerification={onUpdateLabVerification}
          />
        )}

        {activeTab === 'audit' && <AuditTrailView auditLogs={auditLogs} />}

        {activeTab === 'agents' && <AgentContractPreview patientId={patient.id} />}
      </div>

      {/* Workflow Orchestrator Stepper Modal */}
      <WorkflowOrchestratorModal
        isOpen={workflowModalOpen}
        onClose={() => setWorkflowModalOpen(false)}
        patientId={patient.id}
        patientName={patient.name}
        onViewReport={() => {
          setWorkflowModalOpen(false);
          setActiveTab('dossier');
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
