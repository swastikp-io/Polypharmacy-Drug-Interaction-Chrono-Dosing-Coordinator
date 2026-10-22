import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { ClinicalEngineService } from '../services/clinicalEngineService.js';
import { handleListPatients, handleGetPatientMedications } from './patientTools.js';
import { handleParsePrescription } from './ocrTools.js';
import { handleGetInteractionReport, handleGetClinicalEvidence } from './interactionTools.js';
import { handleProposeMedicationSchedule } from './scheduleTools.js';
import { handleGetReviewStatus, handleGetPatientReviewReport } from './reviewTools.js';
import { handleConfirmMedication } from './mutationTools.js';

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
