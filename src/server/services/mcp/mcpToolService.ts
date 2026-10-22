import type { PatientRepository } from '../../repositories/patientRepository.js';
import type { MedicationRepository } from '../../repositories/medicationRepository.js';
import type { LabMeasurementRepository } from '../../repositories/labMeasurementRepository.js';
import type { DiagnosisRepository } from '../../repositories/diagnosisRepository.js';
import type { AuditService } from '../auditService.js';
import type { PharmacokineticConflictEngine } from '../interactions/conflictEngine.js';
import type { CircadianScheduleCoordinator } from '../chrono/scheduleCoordinator.js';
import type { ChronoService } from '../chrono/chronoService.js';
import type { WorkflowCoordinator } from '../orchestration/workflowCoordinator.js';
import {
  ConfirmMedicationOrderSchema,
  GetCircadianTimetableSchema,
  GetConfirmedMedicationsSchema,
  GetConsolidatedReportSchema,
  GetPatientOverviewSchema,
  RunInteractionAnalysisSchema,
} from '../../../shared/mcpSchemas.js';

export interface McpToolResult {
  toolName: string;
  success: boolean;
  data?: any;
  error?: {
    code: string;
    message: string;
  };
}

export class McpToolService {
  constructor(
    private patientRepo: PatientRepository,
    private medRepo: MedicationRepository,
    private labRepo: LabMeasurementRepository,
    private diagRepo: DiagnosisRepository,
    private auditService: AuditService,
    private conflictEngine: PharmacokineticConflictEngine,
    private chronoCoordinator: CircadianScheduleCoordinator,
    private chronoService: ChronoService,
    private workflowCoordinator: WorkflowCoordinator
  ) {}

  public async callTool(toolName: string, rawArguments: any): Promise<McpToolResult> {
    const dangerousTools = ['execute_command', 'read_arbitrary_file', 'eval', 'system_shell', 'write_file'];
    const allowedTools = [
      'get_patient_overview',
      'get_confirmed_medications',
      'run_interaction_analysis',
      'get_circadian_timetable',
      'get_consolidated_clinical_report',
      'confirm_medication_order',
    ];

    // Explicitly reject prohibited or unknown MCP tools
    if (dangerousTools.includes(toolName) || !allowedTools.includes(toolName)) {
      return {
        toolName,
        success: false,
        error: {
          code: 'SECURITY_VIOLATION',
          message: `Unauthorized or unknown MCP tool: "${toolName}". Access is restricted strictly to registered clinical decision-support tools.`,
        },
      };
    }

    try {
      switch (toolName) {
        case 'get_patient_overview': {
          const args = GetPatientOverviewSchema.parse(rawArguments);
          const patient = this.patientRepo.findById(args.patientId);
          if (!patient) {
            return {
              toolName,
              success: false,
              error: { code: 'PATIENT_NOT_FOUND', message: `Patient "${args.patientId}" not found.` },
            };
          }
          const diagnoses = this.diagRepo.findByPatientId(args.patientId);
          const labs = this.labRepo.findByPatientId(args.patientId);
          const meds = this.medRepo.findByPatientId(args.patientId);

          return {
            toolName,
            success: true,
            data: {
              patient: {
                id: patient.id,
                name: patient.name,
                mrn: patient.mrn,
                gender: patient.gender,
                dob: patient.dateOfBirth,
                careSetting: patient.careSetting,
              },
              diagnosesCount: diagnoses.length,
              diagnoses: diagnoses.map((d) => ({ condition: d.condition, code: d.code })),
              medicationCount: meds.length,
              medicationsSummary: {
                total: meds.length,
                active: meds.filter((m) => m.status === 'active' || m.status === 'prn').length,
                confirmed: meds.filter((m) => m.verificationStatus === 'confirmed').length,
                unverified: meds.filter((m) => m.verificationStatus === 'unverified').length,
              },
              recentLabs: labs.map((l) => ({
                test: l.testName,
                value: l.value,
                unit: l.unit,
                interpretation: l.interpretation,
                date: l.collectionDate,
              })),
            },
          };
        }

        case 'get_confirmed_medications': {
          const args = GetConfirmedMedicationsSchema.parse(rawArguments);
          const meds = this.medRepo.findByPatientId(args.patientId);
          const confirmedMeds = meds.filter(
            (m) => (m.status === 'active' || m.status === 'prn') && m.verificationStatus === 'confirmed'
          );

          return {
            toolName,
            success: true,
            data: {
              patientId: args.patientId,
              confirmedCount: confirmedMeds.length,
              medications: confirmedMeds.map((m) => ({
                id: m.id,
                brand: m.brand,
                genericName: m.genericName,
                strength: m.strength,
                formulation: m.formulation,
                route: m.route,
                prescribedDose: m.prescribedDose,
                frequency: m.frequency,
                administrationInstructions: m.administrationInstructions,
                verificationStatus: m.verificationStatus,
              })),
            },
          };
        }

        case 'run_interaction_analysis': {
          const args = RunInteractionAnalysisSchema.parse(rawArguments);
          const patient = this.patientRepo.findById(args.patientId);
          if (!patient) {
            return {
              toolName,
              success: false,
              error: { code: 'PATIENT_NOT_FOUND', message: `Patient "${args.patientId}" not found.` },
            };
          }
          const meds = this.medRepo.findByPatientId(args.patientId);
          const labs = this.labRepo.findByPatientId(args.patientId);
          const activeMeds = meds.filter((m) => m.status === 'active' || m.status === 'prn');

          const analysis = await this.conflictEngine.evaluateRegimen(patient, activeMeds, labs);

          return {
            toolName,
            success: true,
            data: analysis,
          };
        }

        case 'get_circadian_timetable': {
          const args = GetCircadianTimetableSchema.parse(rawArguments);
          const patient = this.patientRepo.findById(args.patientId);
          if (!patient) {
            return {
              toolName,
              success: false,
              error: { code: 'PATIENT_NOT_FOUND', message: `Patient "${args.patientId}" not found.` },
            };
          }
          const meds = this.medRepo.findByPatientId(args.patientId);
          const activeMeds = meds.filter((m) => m.status === 'active' || m.status === 'prn');
          const routine = this.chronoService.getPatientRoutine(args.patientId);

          const timetable = this.chronoCoordinator.generateSchedule({
            patient,
            medications: activeMeds,
            routine,
          });

          return {
            toolName,
            success: true,
            data: timetable,
          };
        }

        case 'get_consolidated_clinical_report': {
          const args = GetConsolidatedReportSchema.parse(rawArguments);
          const latestRun = this.workflowCoordinator.getLatestRunForPatient(args.patientId);

          if (latestRun && latestRun.report) {
            return {
              toolName,
              success: true,
              data: latestRun.report,
            };
          }

          // Otherwise, run workflow to compile report
          const newRun = await this.workflowCoordinator.startWorkflow({
            patientId: args.patientId,
            requireConfirmedOnly: false,
            actor: 'MCP Clinical Assistant Agent',
          });

          return {
            toolName,
            success: true,
            data: newRun.report || newRun,
          };
        }

        case 'confirm_medication_order': {
          const args = ConfirmMedicationOrderSchema.parse(rawArguments);
          const med = this.medRepo.findById(args.medicationId);
          if (!med) {
            return {
              toolName,
              success: false,
              error: { code: 'MEDICATION_NOT_FOUND', message: `Medication "${args.medicationId}" not found.` },
            };
          }

          const patientId = args.patientId || med.patientId;
          const previous = { verificationStatus: med.verificationStatus };
          this.medRepo.updateVerificationStatus(args.medicationId, 'confirmed');

          this.auditService.logUpdate(
            patientId,
            'medication',
            args.medicationId,
            args.actor,
            `MCP Tool confirmed medication order for ${med.brand} (${med.genericName}). Justification: ${args.justification}`,
            previous,
            { verificationStatus: 'confirmed' }
          );

          return {
            toolName,
            success: true,
            data: {
              medicationId: args.medicationId,
              status: 'confirmed',
              brand: med.brand,
              genericName: med.genericName,
              previousStatus: previous.verificationStatus,
              newStatus: 'confirmed',
              confirmedBy: args.actor,
              justification: args.justification,
            },
          };
        }

        default:
          return {
            toolName,
            success: false,
            error: {
              code: 'SECURITY_VIOLATION',
              message: `Unauthorized or unknown MCP tool: "${toolName}". Access is restricted strictly to registered clinical decision-support tools.`,
            },
          };
      }
    } catch (err: any) {
      if (err.name === 'ZodError' || err.issues) {
        return {
          toolName,
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: `Validation failed: ${err.issues?.map((i: any) => `${i.path.join('.')}: ${i.message}`).join(', ') || err.message}`,
          },
        };
      }

      return {
        toolName,
        success: false,
        error: {
          code: err.code || 'TOOL_EXECUTION_ERROR',
          message: err.message || 'Error occurred while executing MCP tool.',
        },
      };
    }
  }
}
