import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { ClinicalEngineService } from '../services/clinicalEngineService.js';
import { handleListPatients, handleGetPatientMedications } from './patientTools.js';
import { handleParsePrescription } from './ocrTools.js';
import { handleGetInteractionReport, handleGetClinicalEvidence } from './interactionTools.js';
import { handleProposeMedicationSchedule } from './scheduleTools.js';
import { handleGetReviewStatus, handleGetPatientReviewReport } from './reviewTools.js';
import { handleConfirmMedication } from './mutationTools.js';
import {
  handleListSyntheticPatients,
  handleGetSyntheticMedications,
  handleLoadOcrFixture,
  handleRunInteractionFixture,
  handleRunScheduleFixture,
  handleGetTestResults,
} from './syntheticDataTools.js';
import {
  handleOrchestratorGetState,
  handleOrchestratorStep,
  handleGetToolExecutionHistory,
  handleGetAgentCapabilities,
  handleSubmitCandidateMedications,
  handleProposeScheduleDraft,
  handleResolveReviewRequest,
  handleGetReviewQueue,
  handleGetApprovalRecords,
  handleOrchestratorGetFinalReport,
} from './orchestratorTools.js';

export const MCP_TOOLS: Tool[] = [
  {
    name: 'list_patients',
    description:
      'List all authorized geriatric patient records available in the local clinical database. Returns minimal identifiers, MRNs, and care settings.',
    inputSchema: {
      type: 'object',
      properties: {
        search: {
          type: 'string',
          description: 'Optional search filter matching name, MRN, or care setting.',
        },
      },
    },
  },
  {
    name: 'get_patient_medications',
    description:
      'Retrieve active medications for an authorized patient record. By default returns only confirmed records; set confirmedOnly to false to inspect unverified orders.',
    inputSchema: {
      type: 'object',
      properties: {
        patientId: {
          type: 'string',
          description: 'Unique patient UUID identifier.',
        },
        confirmedOnly: {
          type: 'boolean',
          description: 'Whether to restrict results to confirmed orders only (default: true).',
          default: true,
        },
      },
      required: ['patientId'],
    },
  },
  {
    name: 'parse_prescription',
    description:
      'Extract and normalize candidate medication orders from a local prescription image (.png, .jpg, .jpeg, .webp) or PDF document using local OCR. Access is strictly confined to local storage directories.',
    inputSchema: {
      type: 'object',
      properties: {
        filePath: {
          type: 'string',
          description: 'Path to local prescription file within authorized application boundaries.',
        },
        patientId: {
          type: 'string',
          description: 'Optional patient UUID to evaluate against active medications for duplicate active ingredients.',
        },
      },
      required: ['filePath'],
    },
  },
  {
    name: 'get_interaction_report',
    description:
      'Execute the deterministic pharmacokinetic and pharmacodynamic conflict engine against a patient active medications, chronic diagnoses, and renal/hepatic laboratory markers. Returns categorized findings, evidence citations, and clinical data gaps.',
    inputSchema: {
      type: 'object',
      properties: {
        patientId: {
          type: 'string',
          description: 'Unique patient UUID identifier.',
        },
      },
      required: ['patientId'],
    },
  },
  {
    name: 'get_clinical_evidence',
    description:
      'Retrieve authoritative, un-fabricated clinical trial evidence, mechanism descriptions, and guideline citations for an active drug-pair or interaction finding. Never invents citations.',
    inputSchema: {
      type: 'object',
      properties: {
        findingId: {
          type: 'string',
          description: 'Specific interaction finding identifier.',
        },
        ingredientPair: {
          type: 'array',
          items: { type: 'string' },
          minItems: 2,
          maxItems: 2,
          description: 'Pair of pharmacological active ingredient names (e.g. ["apixaban", "fluconazole"]).',
        },
      },
    },
  },
  {
    name: 'propose_medication_schedule',
    description:
      'Invoke the deterministic constraint-based circadian scheduling coordinator to propose a 24-hour diurnal administration draft. Preserves 100% of prescribed doses and flags timing/absorption conflicts.',
    inputSchema: {
      type: 'object',
      properties: {
        patientId: {
          type: 'string',
          description: 'Unique patient UUID identifier.',
        },
      },
      required: ['patientId'],
    },
  },
  {
    name: 'get_review_status',
    description:
      'Inspect the current orchestration workflow state, unconfirmed medication orders requiring pharmacist verification, and outstanding clinical review items.',
    inputSchema: {
      type: 'object',
      properties: {
        patientId: {
          type: 'string',
          description: 'Unique patient UUID identifier.',
        },
      },
      required: ['patientId'],
    },
  },
  {
    name: 'confirm_medication',
    description:
      'Explicitly confirm an unverified or OCR candidate medication order as verified truth. Requires an explicit confirmation token ("CONFIRM_MUTATION") and writes a permanent entry to the SQLite audit log.',
    inputSchema: {
      type: 'object',
      properties: {
        medicationId: {
          type: 'string',
          description: 'Unique medication UUID to verify.',
        },
        actor: {
          type: 'string',
          description: 'Clinician or pharmacist verifying the medication.',
        },
        confirmationToken: {
          type: 'string',
          enum: ['CONFIRM_MUTATION'],
          description: 'Mandatory confirmation token "CONFIRM_MUTATION" verifying human review.',
        },
        justification: {
          type: 'string',
          description: 'Clinical justification for confirming the medication order.',
        },
      },
      required: ['medicationId', 'actor', 'confirmationToken'],
    },
  },
  {
    name: 'get_patient_review_report',
    description:
      'Generate a consolidated clinical dossier synthesizing the active confirmed regimen, interaction findings, draft diurnal schedule, data gaps, and prioritized pharmacist action items.',
    inputSchema: {
      type: 'object',
      properties: {
        patientId: {
          type: 'string',
          description: 'Unique patient UUID identifier.',
        },
        actor: {
          type: 'string',
          description: 'Clinician requesting the review report.',
          default: 'Claude MCP Clinician',
        },
      },
      required: ['patientId'],
    },
  },
  {
    name: 'list_synthetic_patients',
    description:
      'List all 8 synthetic clinical test cohort patients with scenario summaries, clinical focus, and non-identifying IDs.',
    inputSchema: {
      type: 'object',
      properties: {
        scenarioFilter: {
          type: 'string',
          description: 'Optional filter for scenario type.',
        },
      },
    },
  },
  {
    name: 'get_synthetic_medications',
    description:
      'Retrieve synthetic medication records for a synthetic patient profile including active ingredients, strengths, frequencies, prescribers, verification status, and synthetic provenance.',
    inputSchema: {
      type: 'object',
      properties: {
        patientId: {
          type: 'string',
          description: 'Synthetic patient UUID.',
        },
      },
      required: ['patientId'],
    },
  },
  {
    name: 'load_ocr_fixture',
    description:
      'Load a synthetic prescription fixture from data/test-fixtures/, execute local OCR extraction and drug normalization, and compare results against expected outputs.',
    inputSchema: {
      type: 'object',
      properties: {
        fixtureId: {
          type: 'string',
          description: 'Unique OCR fixture ID (e.g. fix-rx-01-clean-printed, fix-rx-04-missing-dose).',
        },
      },
      required: ['fixtureId'],
    },
  },
  {
    name: 'run_interaction_fixture',
    description:
      'Execute the pharmacokinetic and pharmacodynamic conflict engine against a synthetic interaction fixture, verifying rule-matching, data gaps, or outage resilience.',
    inputSchema: {
      type: 'object',
      properties: {
        fixtureId: {
          type: 'string',
          description: 'Unique interaction fixture ID (e.g. fix-ix-01-verified-apixaban-naproxen, fix-ix-04-duplicate-ingredient-apap).',
        },
      },
      required: ['fixtureId'],
    },
  },
  {
    name: 'run_schedule_fixture',
    description:
      'Execute the deterministic circadian schedule engine on a synthetic schedule scenario, verifying timing constraints and conflict handling.',
    inputSchema: {
      type: 'object',
      properties: {
        scenarioId: {
          type: 'string',
          description: 'Unique schedule scenario ID (e.g. fix-sched-01-meal-relative, fix-sched-03-validated-minimum-interval).',
        },
      },
      required: ['scenarioId'],
    },
  },
  {
    name: 'get_test_results',
    description:
      'Retrieve aggregated synthetic test fixture inventory and verification status across OCR, interaction, and schedule scenarios.',
    inputSchema: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          enum: ['all', 'ocr', 'interaction', 'schedule'],
          description: 'Category of test fixtures to retrieve.',
        },
      },
    },
  },
  {
    name: 'orchestrator_get_state',
    description:
      'Inspect agentic workflow state, current stage, next operation decision, unverified candidates, pending reviews, and execution records.',
    inputSchema: {
      type: 'object',
      properties: {
        workflowId: {
          type: 'string',
          description: 'Unique workflow identifier.',
        },
      },
      required: ['workflowId'],
    },
  },
  {
    name: 'orchestrator_step',
    description:
      'Advance the agentic workflow to its next permitted state using deterministic rules, safety preconditions, and the orchestrator decision engine.',
    inputSchema: {
      type: 'object',
      properties: {
        workflowId: {
          type: 'string',
          description: 'Unique workflow identifier.',
        },
        actor: {
          type: 'string',
          description: 'Actor advancing the workflow (defaults to Claude Desktop MCP).',
          default: 'Claude Desktop MCP',
        },
      },
      required: ['workflowId'],
    },
  },
  {
    name: 'get_tool_execution_history',
    description:
      'Retrieve immutable tool execution records for a workflow, including operation IDs, tool names, sanitized input hashes, dependency versions, execution durations, and structured errors.',
    inputSchema: {
      type: 'object',
      properties: {
        workflowId: {
          type: 'string',
          description: 'Unique workflow identifier.',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of execution records to return (default 50).',
          default: 50,
        },
      },
      required: ['workflowId'],
    },
  },
  {
    name: 'get_agent_capabilities',
    description:
      'Retrieve capability declarations, permitted tools, prohibited tools, preconditions, postconditions, and human approval policies for specialized agents.',
    inputSchema: {
      type: 'object',
      properties: {
        agentId: {
          type: 'string',
          enum: ['prescription_agent', 'interaction_agent', 'scheduling_agent'],
          description: 'Optional agent identifier to inspect specific capability declaration.',
        },
      },
    },
  },
  {
    name: 'submit_candidate_medications',
    description:
      'Submit OCR-extracted candidate medication orders into the workflow context. Candidate records are submitted strictly as unverified and cannot be marked verified without explicit clinician confirmation.',
    inputSchema: {
      type: 'object',
      properties: {
        workflowId: {
          type: 'string',
          description: 'Unique workflow identifier.',
        },
        documentId: {
          type: 'string',
          description: 'Prescription document source reference identifier.',
        },
        candidates: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              rawText: { type: 'string' },
              brand: { type: 'string' },
              genericName: { type: 'string' },
              dose: { type: 'string' },
              frequency: { type: 'string' },
              route: { type: 'string' },
              confidence: { type: 'number' },
            },
            required: ['rawText'],
          },
          description: 'List of candidate medication orders extracted by OCR.',
        },
      },
      required: ['workflowId', 'candidates'],
    },
  },
  {
    name: 'propose_schedule_draft',
    description:
      'Evaluate circadian constraints and generate a draft 24-hour diurnal administration schedule. Preserves 100% of prescribed doses and cannot approve its own schedule.',
    inputSchema: {
      type: 'object',
      properties: {
        workflowId: {
          type: 'string',
          description: 'Unique workflow identifier.',
        },
        patientId: {
          type: 'string',
          description: 'Unique patient identifier.',
        },
        allowTimingShifts: {
          type: 'boolean',
          description: 'Whether minor timing shifts within safe windows are permitted.',
          default: true,
        },
      },
      required: ['workflowId', 'patientId'],
    },
  },
  {
    name: 'resolve_review_request',
    description:
      'Resolve an outstanding human clinical review request (medication confirmation, interaction review, or schedule approval) with target version verification, role-based authorization, and permanent audit logging.',
    inputSchema: {
      type: 'object',
      properties: {
        reviewId: {
          type: 'string',
          description: 'Unique review request identifier.',
        },
        status: {
          type: 'string',
          enum: ['approved', 'rejected', 'modified'],
          description: 'Clinical decision status.',
        },
        reviewerIdentity: {
          type: 'string',
          description: 'Identity of the licensed clinician or pharmacist performing the review (LLM/AI identities are rejected).',
        },
        reviewerRole: {
          type: 'string',
          enum: [
            'attending_physician',
            'clinical_pharmacist',
            'registered_nurse',
            'medical_director',
          ],
          description: 'Authorized clinical role of the reviewer.',
          default: 'clinical_pharmacist',
        },
        reviewerNotes: {
          type: 'string',
          description: 'Clinical rationale and review notes.',
        },
        targetVersion: {
          type: 'number',
          description: 'Exact version of the item when reviewed to prevent race conditions.',
        },
      },
      required: ['reviewId', 'status', 'reviewerIdentity', 'targetVersion'],
    },
  },
  {
    name: 'get_review_queue',
    description:
      'Read-only MCP tool to inspect the queue of pending, approved, or rejected human clinical reviews across workflows or for a specific workflow.',
    inputSchema: {
      type: 'object',
      properties: {
        workflowId: {
          type: 'string',
          description: 'Optional workflow ID filter. If omitted, returns all pending reviews.',
        },
        status: {
          type: 'string',
          enum: ['pending', 'approved', 'rejected', 'modified', 'invalidated', 'all'],
          description: 'Filter reviews by status (default: "pending").',
          default: 'pending',
        },
      },
    },
  },
  {
    name: 'get_approval_records',
    description:
      'Read-only MCP tool to inspect immutable approval records for a specific workflow, including role, artifact version, and freshness status.',
    inputSchema: {
      type: 'object',
      properties: {
        workflowId: {
          type: 'string',
          description: 'Unique workflow identifier.',
        },
      },
      required: ['workflowId'],
    },
  },
  {
    name: 'orchestrator_get_final_report',
    description:
      'Generate a consolidated clinical and technical report for a workflow run, distinguishing technical completion, outstanding clinical reviews, and human approval status.',
    inputSchema: {
      type: 'object',
      properties: {
        workflowId: {
          type: 'string',
          description: 'Unique workflow identifier.',
        },
      },
      required: ['workflowId'],
    },
  },
];

export async function dispatchTool(
  name: string,
  args: unknown,
  engine: ClinicalEngineService
): Promise<{ content: Array<{ type: 'text'; text: string }>; isError?: boolean }> {
  try {
    let result: unknown;

    switch (name) {
      case 'list_patients':
        result = handleListPatients(args, engine);
        break;

      case 'get_patient_medications':
        result = handleGetPatientMedications(args, engine);
        break;

      case 'parse_prescription':
        result = await handleParsePrescription(args, engine);
        break;

      case 'get_interaction_report':
        result = await handleGetInteractionReport(args, engine);
        break;

      case 'get_clinical_evidence':
        result = await handleGetClinicalEvidence(args, engine);
        break;

      case 'propose_medication_schedule':
        result = await handleProposeMedicationSchedule(args, engine);
        break;

      case 'get_review_status':
        result = await handleGetReviewStatus(args, engine);
        break;

      case 'confirm_medication':
        result = handleConfirmMedication(args, engine);
        break;

      case 'get_patient_review_report':
        result = await handleGetPatientReviewReport(args, engine);
        break;

      case 'list_synthetic_patients':
        result = await handleListSyntheticPatients(args, engine);
        break;

      case 'get_synthetic_medications':
        result = await handleGetSyntheticMedications(args, engine);
        break;

      case 'load_ocr_fixture':
        result = await handleLoadOcrFixture(args, engine);
        break;

      case 'run_interaction_fixture':
        result = await handleRunInteractionFixture(args, engine);
        break;

      case 'run_schedule_fixture':
        result = await handleRunScheduleFixture(args, engine);
        break;

      case 'get_test_results':
        result = await handleGetTestResults(args, engine);
        break;

      case 'orchestrator_get_state':
        result = await handleOrchestratorGetState(args, engine);
        break;

      case 'orchestrator_step':
        result = await handleOrchestratorStep(args, engine);
        break;

      case 'get_tool_execution_history':
        result = await handleGetToolExecutionHistory(args, engine);
        break;

      case 'get_agent_capabilities':
        result = await handleGetAgentCapabilities(args, engine);
        break;

      case 'submit_candidate_medications':
        result = await handleSubmitCandidateMedications(args, engine);
        break;

      case 'propose_schedule_draft':
        result = await handleProposeScheduleDraft(args, engine);
        break;

      case 'resolve_review_request':
        result = await handleResolveReviewRequest(args, engine);
        break;

      case 'get_review_queue':
        result = await handleGetReviewQueue(args, engine);
        break;

      case 'get_approval_records':
        result = await handleGetApprovalRecords(args, engine);
        break;

      case 'orchestrator_get_final_report':
        result = await handleOrchestratorGetFinalReport(args, engine);
        break;

      default:
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `Unknown MCP tool "${name}". Registered tools: ${MCP_TOOLS.map((t) => t.name).join(', ')}`,
            },
          ],
        };
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (err: any) {
    console.error(`[MCP Tool Error] [${name}]:`, err.message || err);
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `Clinical Decision-Support Error in "${name}": ${err.message || 'An unexpected error occurred'}`,
        },
      ],
    };
  }
}
