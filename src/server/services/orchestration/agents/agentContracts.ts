import type {
  AgentCapabilityDeclaration,
  AgentId,
} from '../../../../shared/agentContractTypes.js';
import { UnauthorizedToolExecutionError } from '../stateMachine/errors.js';

// ==========================================
// 1. PRESCRIPTION OCR & NORMALIZATION AGENT
// ==========================================

export const PRESCRIPTION_AGENT_DECLARATION: AgentCapabilityDeclaration = {
  agentId: 'prescription_agent',
  name: 'Prescription OCR & Normalization Agent',
  description:
    'Ingests prescription documents and images, performs optical character recognition, and normalizes candidate medication orders against RxNorm standard terminology. Strictly prohibited from marking medication records as confirmed truth.',
  permittedTools: [
    'parse_prescription',
    'submit_candidate_medications',
    'get_patient_context',
    'get_workflow_status',
  ],
  prohibitedTools: [
    'confirm_medication',
    'check_interactions',
    'get_interaction_evidence',
    'evaluate_schedule_constraints',
    'propose_schedule_draft',
    'create_review_request',
    'resolve_review_request',
  ],
  preconditions: [
    'Prescription document file path must reside within authorized sandboxed upload directory.',
    'Target patient identifier must be an authorized clinical or synthetic record.',
  ],
  postconditions: [
    'Candidate medication orders are extracted with dose, frequency, formulation, route, and confidence score.',
    'All candidate medication records are submitted strictly as status "unverified".',
    'Flags low-confidence extractions (<0.85) or missing required clinical instructions (dose/frequency) for pharmacist review.',
  ],
  humanApprovalPolicy:
    'Explicit human clinician or pharmacist verification is mandatory for every extracted candidate order before inclusion in the confirmed active regimen.',
  evidenceAndProvenanceRequirements: [
    'Prescription source document ID, filename, and mime type.',
    'Raw OCR text snippet with bounding box or page context.',
    'RxNorm standard concept mapping with string similarity match score.',
    'Extraction confidence score and ambiguity count.',
  ],
  structuredFailureModes: [
    'FILE_NOT_FOUND',
    'PATH_TRAVERSAL_DETECTED',
    'UNSUPPORTED_FORMAT',
    'OCR_PROCESSING_FAILED',
    'AMBIGUOUS_MEDICATION_ORDER',
    'UNAUTHORIZED_CONFIRMATION_ATTEMPT',
  ],
};

// ==========================================
// 2. PHARMACOKINETIC CONFLICT ENGINE AGENT
// ==========================================

export const INTERACTION_AGENT_DECLARATION: AgentCapabilityDeclaration = {
  agentId: 'interaction_agent',
  name: 'Pharmacokinetic Conflict Engine Agent',
  description:
    'Executes deterministic pharmacokinetic and pharmacodynamic interaction screening across confirmed active regimens, renal/hepatic biomarkers, and chronic diagnoses. Retrieves authoritative clinical trial citations and KDIGO/FDA guidance. Strictly prohibited from inventing citations or overriding deterministic findings.',
  permittedTools: [
    'check_interactions',
    'get_interaction_evidence',
    'get_confirmed_medications',
    'get_patient_context',
    'get_workflow_status',
  ],
  prohibitedTools: [
    'confirm_medication',
    'submit_candidate_medications',
    'propose_schedule_draft',
    'resolve_review_request',
  ],
  preconditions: [
    'All evaluated medications must have verificationStatus = "confirmed" in the patient chart.',
    'Patient renal and hepatic laboratory markers must be accessible (or explicitly recorded as missing data gaps).',
    'Local interaction reference datasets (FDA DDI, KDIGO) must be online and accessible.',
  ],
  postconditions: [
    'Generates deterministic interaction findings categorized by severity (contraindicated, major, moderate, minor).',
    'Identifies duplicate active ingredient therapies and geriatric clearance data gaps.',
    'All returned evidence citations must match local verified monograph database (zero hallucinated citations).',
  ],
  humanApprovalPolicy:
    'Mandatory clinical review item creation for contraindicated or major interactions, renal clearance gaps, and duplicate active therapy.',
  evidenceAndProvenanceRequirements: [
    'Reference dataset version (FDA DDI 2026-Q1, KDIGO 2024.1).',
    'Engine version and provider health status.',
    'Verified monograph identifiers and PubMed/guideline evidence references.',
  ],
  structuredFailureModes: [
    'EVIDENCE_PROVIDER_UNAVAILABLE',
    'DATASET_OFFLINE',
    'UNCONFIRMED_MEDICATIONS_PRESENT',
    'PATIENT_NOT_FOUND',
    'UNAUTHORIZED_MUTATION_ATTEMPT',
  ],
};

// ==========================================
// 3. CIRCADIAN SCHEDULE COORDINATOR AGENT
// ==========================================

export const SCHEDULING_AGENT_DECLARATION: AgentCapabilityDeclaration = {
  agentId: 'scheduling_agent',
  name: 'Circadian Schedule Coordinator Agent',
  description:
    'Evaluates chronological dosing constraints, food-drug absorption relationships, and diurnal patient routines to propose a 24-hour administration draft. Must preserve 100% of prescribed doses and cannot approve its own schedule.',
  permittedTools: [
    'evaluate_schedule_constraints',
    'propose_schedule_draft',
    'get_confirmed_medications',
    'get_patient_context',
    'get_workflow_status',
  ],
  prohibitedTools: [
    'confirm_medication',
    'submit_candidate_medications',
    'check_interactions',
    'resolve_review_request',
  ],
  preconditions: [
    'Patient active medications must be verified as confirmed truth.',
    'Patient diurnal routine (wake, meals, bedtime) must be recorded.',
    'Interaction analysis must be evaluated prior to scheduling.',
  ],
  postconditions: [
    'Proposes a 24-hour administration timetable aligned with circadian pharmacodynamics.',
    'Preserves 100% of prescribed doses, formulations, and instructions (zero dose modification).',
    'Preserves scheduling conflicts without fabricating unverified solutions.',
    'Marks proposed schedule strictly as draft (requiresClinicianApproval = true).',
  ],
  humanApprovalPolicy:
    'All generated schedules require human clinician or pharmacist review and explicit signoff before clinical administration.',
  evidenceAndProvenanceRequirements: [
    'Circadian schedule coordinator engine version.',
    'Patient diurnal routine timestamp and version.',
    'Circadian guideline monograph citations for timing recommendations.',
  ],
  structuredFailureModes: [
    'PATIENT_NOT_FOUND',
    'ROUTINE_NOT_FOUND',
    'CONFLICTING_CONSTRAINTS',
    'DOSE_ALTERATION_PROHIBITED',
    'SELF_APPROVAL_PROHIBITED',
  ],
};

export const ALL_AGENT_DECLARATIONS: Record<AgentId, AgentCapabilityDeclaration> = {
  prescription_agent: PRESCRIPTION_AGENT_DECLARATION,
  interaction_agent: INTERACTION_AGENT_DECLARATION,
  scheduling_agent: SCHEDULING_AGENT_DECLARATION,
};

export function getAgentDeclaration(agentId: AgentId): AgentCapabilityDeclaration {
  const decl = ALL_AGENT_DECLARATIONS[agentId];
  if (!decl) {
    throw new Error(`Unknown agent identifier "${agentId}". Valid agents: prescription_agent, interaction_agent, scheduling_agent`);
  }
  return decl;
}

export function isToolPermittedForAgent(agentId: AgentId, toolName: string): boolean {
  const decl = ALL_AGENT_DECLARATIONS[agentId];
  if (!decl) return false;
  return decl.permittedTools.includes(toolName);
}

export function validateAgentToolAuthorization(agentId: string, toolName: string): void {
  // If human clinician or admin, not constrained by agent declarations
  if (['clinician', 'pharmacist', 'admin', 'human_clinician', 'system'].includes(agentId)) {
    return;
  }

  const decl = ALL_AGENT_DECLARATIONS[agentId as AgentId];
  if (!decl) {
    // If an unknown agent ID was provided, reject
    throw new UnauthorizedToolExecutionError(
      toolName,
      'agent_role_authorization',
      agentId,
      `Agent "${agentId}" is not a recognized agent in the multi-agent architecture.`
    );
  }

  if (decl.prohibitedTools.includes(toolName) || !decl.permittedTools.includes(toolName)) {
    throw new UnauthorizedToolExecutionError(
      toolName,
      `permitted_for_${agentId}`,
      agentId,
      `Tool "${toolName}" is prohibited for agent "${agentId}". Permitted tools: ${decl.permittedTools.join(', ')}`
    );
  }
}
