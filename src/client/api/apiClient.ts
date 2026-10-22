import type {
  Allergy,
  AuditLog,
  Diagnosis,
  LabMeasurement,
  Medication,
  Patient,
  PatientComprehensiveProfile,
  VerificationStatus,
} from '../../shared/types.js';
import type {
  OCRProcessingResponse,
  TerminologyMatch,
} from '../../shared/ocrTypes.js';
import type {
  ConflictEngineResult,
  RegimenExplanationResult,
} from '../../shared/interactionTypes.js';
import type {
  DailyScheduleTimeline,
  PatientRoutine,
  ScheduleReviewSubmission,
} from '../../shared/chronoTypes.js';
import type {
  ConsolidatedClinicalReport,
  WorkflowResumeRequest,
  WorkflowRun,
  WorkflowRunOptions,
} from '../../shared/orchestrationTypes.js';

const API_BASE = '/api';

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Array<{ field: string; message: string }>;
  };
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }
  if (!headers.has('x-actor')) {
    headers.set('x-actor', 'Clinical Pharmacist User');
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  const body = await response.json();

  if (!response.ok || body.success === false) {
    const errorMsg = body.error?.message || `Request failed with status ${response.status}`;
    const error = new Error(errorMsg) as any;
    error.status = response.status;
    error.code = body.error?.code;
    error.details = body.error?.details;
    throw error;
  }

  return body.data;
}

export const api = {
  // Patients
  getPatients: () => request<Patient[]>('/patients'),
  getPatient: (id: string) => request<Patient>(`/patients/${id}`),
  getPatientComprehensive: (id: string) =>
    request<PatientComprehensiveProfile>(`/patients/${id}/comprehensive`),
  createPatient: (data: Partial<Patient>) =>
    request<Patient>('/patients', { method: 'POST', body: JSON.stringify(data) }),
  updatePatient: (id: string, data: Partial<Patient>) =>
    request<Patient>(`/patients/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deletePatient: (id: string) =>
    request<{ message: string }>(`/patients/${id}`, { method: 'DELETE' }),

  // Medications
  getMedications: (patientId: string) =>
    request<Medication[]>(`/medications/patient/${patientId}`),
  createMedication: (data: any) =>
    request<Medication>('/medications', { method: 'POST', body: JSON.stringify(data) }),
  updateMedication: (id: string, data: any) =>
    request<Medication>(`/medications/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  updateMedicationVerification: (
    id: string,
    verificationStatus: VerificationStatus,
    actor: string,
    reason?: string
  ) =>
    request<Medication>(`/medications/${id}/verification`, {
      method: 'PATCH',
      body: JSON.stringify({ verificationStatus, actor, reason }),
    }),
  deleteMedication: (id: string) =>
    request<{ message: string }>(`/medications/${id}`, { method: 'DELETE' }),

  // Allergies
  getAllergies: (patientId: string) =>
    request<Allergy[]>(`/allergies/patient/${patientId}`),
  createAllergy: (data: any) =>
    request<Allergy>('/allergies', { method: 'POST', body: JSON.stringify(data) }),
  updateAllergy: (id: string, data: any) =>
    request<Allergy>(`/allergies/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  updateAllergyVerification: (
    id: string,
    verificationStatus: VerificationStatus,
    actor: string,
    reason?: string
  ) =>
    request<Allergy>(`/allergies/${id}/verification`, {
      method: 'PATCH',
      body: JSON.stringify({ verificationStatus, actor, reason }),
    }),
  deleteAllergy: (id: string) =>
    request<{ message: string }>(`/allergies/${id}`, { method: 'DELETE' }),

  // Diagnoses
  getDiagnoses: (patientId: string) =>
    request<Diagnosis[]>(`/diagnoses/patient/${patientId}`),
  createDiagnosis: (data: any) =>
    request<Diagnosis>('/diagnoses', { method: 'POST', body: JSON.stringify(data) }),
  updateDiagnosis: (id: string, data: any) =>
    request<Diagnosis>(`/diagnoses/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  updateDiagnosisVerification: (
    id: string,
    verificationStatus: VerificationStatus,
    actor: string,
    reason?: string
  ) =>
    request<Diagnosis>(`/diagnoses/${id}/verification`, {
      method: 'PATCH',
      body: JSON.stringify({ verificationStatus, actor, reason }),
    }),
  deleteDiagnosis: (id: string) =>
    request<{ message: string }>(`/diagnoses/${id}`, { method: 'DELETE' }),

  // Lab Measurements
  getLabs: (patientId: string) =>
    request<LabMeasurement[]>(`/labs/patient/${patientId}`),
  createLab: (data: any) =>
    request<LabMeasurement>('/labs', { method: 'POST', body: JSON.stringify(data) }),
  updateLab: (id: string, data: any) =>
    request<LabMeasurement>(`/labs/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  updateLabVerification: (
    id: string,
    verificationStatus: VerificationStatus,
    actor: string,
    reason?: string
  ) =>
    request<LabMeasurement>(`/labs/${id}/verification`, {
      method: 'PATCH',
      body: JSON.stringify({ verificationStatus, actor, reason }),
    }),
  deleteLab: (id: string) =>
    request<{ message: string }>(`/labs/${id}`, { method: 'DELETE' }),

  // Audit Logs
  getAuditLogs: (patientId: string) =>
    request<AuditLog[]>(`/audit/patient/${patientId}`),

  // Agents
  getDrugInteractions: (patientId: string) =>
    request<any>(`/agents/interactions/${patientId}`),
  getChronoDosing: (patientId: string) =>
    request<any>(`/agents/chrono-dosing/${patientId}`),
  getOrganClearance: (patientId: string) =>
    request<any>(`/agents/organ-clearance/${patientId}`),

  // OCR & Prescription Intake (Phase 2)
  uploadPrescription: async (file: File | Blob, patientId: string, customFileName?: string): Promise<OCRProcessingResponse> => {
    const formData = new FormData();
    formData.append('file', file, customFileName || (file instanceof File ? file.name : 'prescription.png'));
    formData.append('patientId', patientId);

    const res = await fetch(`${API_BASE}/ocr/upload`, {
      method: 'POST',
      body: formData,
      headers: {
        'x-actor': 'Clinical Intake Pharmacist',
      },
    });

    const body = await res.json();
    if (!res.ok || body.success === false) {
      const err = new Error(body.error?.message || 'OCR processing failed') as any;
      err.code = body.error?.code;
      err.details = body.error?.details;
      throw err;
    }
    return body.data;
  },

  getDocumentPreviewUrl: (documentId: string): string => {
    return `${API_BASE}/ocr/documents/${documentId}/preview`;
  },

  deleteDocument: (documentId: string) =>
    request<{ message: string }>(`/ocr/documents/${documentId}`, { method: 'DELETE' }),

  reconcileCandidateMedication: (data: any) =>
    request<Medication>('/ocr/reconcile', { method: 'POST', body: JSON.stringify(data) }),

  searchTerminology: (query: string) =>
    request<TerminologyMatch[]>(`/ocr/terminology/search?q=${encodeURIComponent(query)}`),

  // Phase 3: Pharmacokinetic Conflict Engine
  getPatientInteractionAnalysis: (patientId: string, explain: boolean = true) =>
    request<{ success: boolean; data: ConflictEngineResult; explanation?: RegimenExplanationResult }>(
      `/interactions/patient/${patientId}?explain=${explain}`
    ),

  analyzeCustomRegimen: (payload: any) =>
    request<{ success: boolean; data: ConflictEngineResult; explanation?: RegimenExplanationResult }>(
      '/interactions/analyze',
      { method: 'POST', body: JSON.stringify(payload) }
    ),

  getInteractionProviderStatus: () =>
    request<any>('/interactions/providers/status'),

  toggleProviderOutage: (active: boolean) =>
    request<any>('/interactions/providers/toggle-outage', {
      method: 'POST',
      body: JSON.stringify({ active }),
    }),

  getDataSourcesGovernance: () =>
    request<any>('/interactions/governance/data-sources'),

  // Phase 4: Circadian Schedule Coordinator
  getDraftSchedule: (patientId: string, fresh: boolean = false) =>
    request<DailyScheduleTimeline>(`/chrono/patient/${patientId}/draft${fresh ? '?fresh=true' : ''}`),

  getPatientRoutine: (patientId: string) =>
    request<PatientRoutine>(`/chrono/patient/${patientId}/routine`),

  updatePatientRoutine: (patientId: string, routine: Partial<PatientRoutine>) =>
    request<{ routine: PatientRoutine; newSchedule: DailyScheduleTimeline }>(
      `/chrono/patient/${patientId}/routine`,
      {
        method: 'PUT',
        body: JSON.stringify(routine),
      }
    ),

  submitScheduleReview: (
    patientId: string,
    submission: ScheduleReviewSubmission & { scheduleId: string }
  ) =>
    request<DailyScheduleTimeline>(`/chrono/patient/${patientId}/review`, {
      method: 'POST',
      body: JSON.stringify(submission),
    }),

  getScheduleHistory: (patientId: string) =>
    request<DailyScheduleTimeline[]>(`/chrono/patient/${patientId}/history`),

  // Phase 5: Agent Orchestration
  startWorkflow: (options: WorkflowRunOptions) =>
    request<WorkflowRun>('/orchestration/run', {
      method: 'POST',
      body: JSON.stringify(options),
    }),

  getWorkflowRun: (runId: string) =>
    request<WorkflowRun>(`/orchestration/run/${runId}`),

  resumeWorkflow: (runId: string, data: WorkflowResumeRequest) =>
    request<WorkflowRun>(`/orchestration/run/${runId}/resume`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getConsolidatedReport: (patientId: string) =>
    request<ConsolidatedClinicalReport>(`/orchestration/patient/${patientId}/report`),

  callMcpTool: (toolName: string, args: any) =>
    request<any>('/orchestration/mcp/call', {
      method: 'POST',
      body: JSON.stringify({ toolName, arguments: args }),
    }),

  // Phase 6: Governance, Security & Portability
  exportPatientDossier: (patientId: string) =>
    request<any>(`/governance/patient/${patientId}/export`),

  purgePatientData: (patientId: string, confirmationToken: string, reason: string) =>
    request<{ success: boolean; message: string }>(`/governance/patient/${patientId}/purge`, {
      method: 'POST',
      body: JSON.stringify({ confirmationToken, reason }),
    }),
};
