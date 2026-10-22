import fs from 'fs';
import path from 'path';
import { z } from 'zod';
import type { OrchestratorTool } from './toolRegistry.js';
import type { PatientRepository } from '../../../repositories/patientRepository.js';
import type { MedicationRepository } from '../../../repositories/medicationRepository.js';
import type { LabMeasurementRepository } from '../../../repositories/labMeasurementRepository.js';
import type { DiagnosisRepository } from '../../../repositories/diagnosisRepository.js';
import type { AuditService } from '../../auditService.js';
import type { PharmacokineticConflictEngine } from '../../interactions/conflictEngine.js';
import type { LocalInteractionEvidenceProvider } from '../../interactions/interactionEvidenceProvider.js';
import type { CircadianScheduleCoordinator } from '../../chrono/scheduleCoordinator.js';
import type { ChronoService } from '../../chrono/chronoService.js';
import type { DrugNormalizationService } from '../../ocr/normalizationService.js';
import type { LocalOCREngine } from '../../ocr/ocrEngine.js';
import type { FileStorageService } from '../../ocr/fileStorageService.js';
import type { WorkflowRepository } from '../../../repositories/workflowRepository.js';
import type { ReviewRequestRepository } from '../../../repositories/reviewRequestRepository.js';
import { ReviewCategorySchema } from '../../../../shared/orchestrationSchemas.js';
import {
  SubmitCandidateMedicationsInputSchema,
  SubmitCandidateMedicationsOutputSchema,
  ProposeScheduleDraftInputSchema,
  ProposeScheduleDraftOutputSchema,
} from '../../../../shared/agentContractTypes.js';

export interface ClinicalToolsDependencies {
  patientRepo: PatientRepository;
  medRepo: MedicationRepository;
  labRepo: LabMeasurementRepository;
  diagRepo: DiagnosisRepository;
  auditService: AuditService;
  conflictEngine: PharmacokineticConflictEngine;
  evidenceProvider: LocalInteractionEvidenceProvider;
  chronoCoordinator: CircadianScheduleCoordinator;
  chronoService: ChronoService;
  workflowRepo: WorkflowRepository;
  reviewRequestRepo: ReviewRequestRepository;
  ocrNormalizationService?: DrugNormalizationService;
  ocrEngine?: LocalOCREngine;
  fileStorageService?: FileStorageService;
}

export function createClinicalTools(deps: ClinicalToolsDependencies): OrchestratorTool[] {
  const tools: OrchestratorTool[] = [];

  // ==========================================
  // 1. GET PATIENT CONTEXT (Read-only)
  // ==========================================
  tools.push({
    name: 'get_patient_context',
    description:
      'Retrieve authorized geriatric patient chart, chronic diagnoses, baseline renal/hepatic labs, and care setting.',
    inputSchema: z.object({
      patientId: z.string().min(1, 'patientId is required'),
    }),
    outputSchema: z.object({
      patient: z.object({
        id: z.string(),
        name: z.string(),
        mrn: z.string(),
        gender: z.string(),
        dateOfBirth: z.string(),
        careSetting: z.string(),
        weightKg: z.number().nullable().optional(),
        heightCm: z.number().nullable().optional(),
      }),
      diagnoses: z.array(z.any()),
      recentLabs: z.array(z.any()),
      totalMedications: z.number(),
    }),
    authorizationPolicy: 'authenticated_user',
    isReadOnly: true,
    expectedFailureModes: ['PATIENT_NOT_FOUND', 'DATABASE_ERROR'],
    async execute(input) {
      const patient = deps.patientRepo.findById(input.patientId);
      if (!patient) {
        throw new Error(`Patient "${input.patientId}" was not found.`);
      }
      const diagnoses = deps.diagRepo.findByPatientId(input.patientId);
      const labs = deps.labRepo.findByPatientId(input.patientId);
      const meds = deps.medRepo.findByPatientId(input.patientId);

      return {
        patient: {
          id: patient.id,
          name: patient.name,
          mrn: patient.mrn,
          gender: patient.gender,
          dateOfBirth: patient.dateOfBirth,
          careSetting: patient.careSetting,
          weightKg: patient.weightKg ?? null,
          heightCm: patient.heightCm ?? null,
        },
        diagnoses,
        recentLabs: labs,
        totalMedications: meds.length,
      };
    },
  });

  // ==========================================
  // 2. GET CONFIRMED MEDICATIONS (Read-only)
  // ==========================================
  tools.push({
    name: 'get_confirmed_medications',
    description:
      'Retrieve all active and PRN medications for a patient that have been verified as confirmed truth by clinical review.',
    inputSchema: z.object({
      patientId: z.string().min(1, 'patientId is required'),
    }),
    outputSchema: z.object({
      patientId: z.string(),
      confirmedCount: z.number(),
      medications: z.array(z.any()),
    }),
    authorizationPolicy: 'authenticated_user',
    isReadOnly: true,
    expectedFailureModes: ['PATIENT_NOT_FOUND', 'DATABASE_ERROR'],
    async execute(input) {
      const meds = deps.medRepo.findByPatientId(input.patientId);
      const confirmed = meds.filter(
        (m) =>
          (m.status === 'active' || m.status === 'prn') &&
          m.verificationStatus === 'confirmed'
      );
      return {
        patientId: input.patientId,
        confirmedCount: confirmed.length,
        medications: confirmed,
      };
    },
  });

  // ==========================================
  // 3. PARSE PRESCRIPTION (Read-only / Sandbox File Processing)
  // ==========================================
  tools.push({
    name: 'parse_prescription',
    description:
      'Extract candidate medication orders from a local prescription document using local OCR and drug terminology normalization.',
    inputSchema: z.object({
      filePath: z.string().min(1, 'filePath is required'),
      patientId: z.string().optional(),
    }),
    outputSchema: z.object({
      documentName: z.string(),
      rawText: z.string(),
      candidateMedications: z.array(z.any()),
      ambiguityCount: z.number(),
    }),
    authorizationPolicy: 'authenticated_user',
    isReadOnly: true,
    expectedFailureModes: [
      'FILE_NOT_FOUND',
      'PATH_TRAVERSAL_DETECTED',
      'UNSUPPORTED_FORMAT',
      'OCR_PROCESSING_FAILED',
    ],
    async execute(input) {
      // Path traversal prevention
      const normalizedPath = path.normalize(input.filePath);
      if (normalizedPath.includes('..')) {
        throw new Error('Path traversal is strictly prohibited.');
      }
      if (!fs.existsSync(normalizedPath)) {
        throw new Error(`Prescription file not found at path "${input.filePath}".`);
      }

      if (!deps.ocrEngine || !deps.ocrNormalizationService) {
        throw new Error('OCR and normalization services are not available.');
      }

      const fileBuffer = fs.readFileSync(normalizedPath);
      const filename = path.basename(normalizedPath);
      const ext = path.extname(filename).toLowerCase();
      const mimeType = ext === '.pdf' ? 'application/pdf' : 'image/png';

      const rawOcr = await deps.ocrEngine.processDocument(fileBuffer, filename, mimeType);
      const normalized = await deps.ocrNormalizationService.processAndNormalize(
        rawOcr,
        input.patientId || 'synthetic-patient'
      );

      return {
        documentName: filename,
        rawText: rawOcr.rawText,
        candidateMedications: normalized.candidateMedications,
        ambiguityCount: normalized.summary.ambiguityCount,
      };
    },
  });

  // ==========================================
  // 4. CONFIRM MEDICATION (Mutating, Clinician-Only)
  // ==========================================
  tools.push({
    name: 'confirm_medication',
    description:
      'Confirm a medication order identity, dose, and instructions as verified truth in the patient chart.',
    inputSchema: z.object({
      medicationId: z.string().min(1, 'medicationId is required'),
      actor: z.string().min(1, 'actor is required'),
      justification: z.string().min(1, 'justification is required'),
      confirmationToken: z.literal('CONFIRM_MUTATION', {
        errorMap: () => ({ message: 'Requires confirmationToken: "CONFIRM_MUTATION"' }),
      }),
    }),
    outputSchema: z.object({
      medicationId: z.string(),
      status: z.literal('confirmed'),
      brand: z.string(),
      genericName: z.string(),
      confirmedBy: z.string(),
      justification: z.string(),
    }),
    authorizationPolicy: 'clinician_only',
    isReadOnly: false,
    expectedFailureModes: [
      'MEDICATION_NOT_FOUND',
      'UNAUTHORIZED_ACTOR',
      'TOKEN_MISMATCH',
      'DATABASE_ERROR',
    ],
    async execute(input, context) {
      const med = deps.medRepo.findById(input.medicationId);
      if (!med) {
        throw new Error(`Medication "${input.medicationId}" not found.`);
      }

      const previous = { verificationStatus: med.verificationStatus };
      deps.medRepo.updateVerificationStatus(input.medicationId, 'confirmed');

      deps.auditService.logUpdate(
        med.patientId,
        'medication',
        input.medicationId,
        input.actor,
        `Medication confirmation: ${med.brand} (${med.genericName}). Justification: ${input.justification}`,
        previous,
        { verificationStatus: 'confirmed' }
      );

      return {
        medicationId: input.medicationId,
        status: 'confirmed',
        brand: med.brand,
        genericName: med.genericName,
        confirmedBy: input.actor,
        justification: input.justification,
      };
    },
  });

  // ==========================================
  // 5. CHECK INTERACTIONS (Read-only)
  // ==========================================
  tools.push({
    name: 'check_interactions',
    description:
      'Execute deterministic pharmacokinetic and pharmacodynamic conflict engine against confirmed active medications and renal/hepatic laboratory markers.',
    inputSchema: z.object({
      patientId: z.string().min(1, 'patientId is required'),
      medicationIds: z.array(z.string()).optional(),
    }),
    outputSchema: z.object({
      patientId: z.string(),
      engineVersion: z.string(),
      findings: z.array(z.any()),
      duplicateIngredients: z.array(z.any()),
      dataGaps: z.array(z.any()),
      summary: z.any(),
      providerStatus: z.any(),
    }),
    authorizationPolicy: 'authenticated_user',
    isReadOnly: true,
    expectedFailureModes: [
      'PATIENT_NOT_FOUND',
      'EVIDENCE_PROVIDER_UNAVAILABLE',
      'DATABASE_ERROR',
    ],
    async execute(input) {
      const patient = deps.patientRepo.findById(input.patientId);
      if (!patient) {
        throw new Error(`Patient "${input.patientId}" was not found.`);
      }

      let medications = deps.medRepo.findByPatientId(input.patientId);
      if (input.medicationIds && input.medicationIds.length > 0) {
        medications = medications.filter((m) => input.medicationIds!.includes(m.id));
      }
      const activeMeds = medications.filter(
        (m) => m.status === 'active' || m.status === 'prn'
      );
      const labs = deps.labRepo.findByPatientId(input.patientId);

      const result = await deps.conflictEngine.evaluateRegimen(patient, activeMeds, labs);

      return {
        patientId: input.patientId,
        engineVersion: result.engineVersion,
        findings: result.findings,
        duplicateIngredients: result.duplicateIngredients,
        dataGaps: result.dataGaps,
        summary: result.summary,
        providerStatus: result.providerStatus,
      };
    },
  });

  // ==========================================
  // 6. GET INTERACTION EVIDENCE (Read-only)
  // ==========================================
  tools.push({
    name: 'get_interaction_evidence',
    description:
      'Retrieve authoritative clinical trial evidence, mechanism descriptions, and guideline citations for an active drug pair. Never invents citations.',
    inputSchema: z.object({
      ingredientA: z.string().min(1, 'ingredientA is required'),
      ingredientB: z.string().min(1, 'ingredientB is required'),
    }),
    outputSchema: z.object({
      found: z.boolean(),
      evidence: z.any(),
      datasetVersion: z.string(),
    }),
    authorizationPolicy: 'authenticated_user',
    isReadOnly: true,
    expectedFailureModes: ['EVIDENCE_PROVIDER_UNAVAILABLE', 'DATASET_OFFLINE'],
    async execute(input) {
      if (!deps.evidenceProvider.isAvailable()) {
        throw new Error('Evidence provider is offline or degraded.');
      }

      const rules = await deps.evidenceProvider.findRulesForPair(
        input.ingredientA,
        input.ingredientB
      );
      const metadata = deps.evidenceProvider.getDatasetMetadata();

      return {
        found: rules.length > 0,
        evidence: rules[0] || null,
        datasetVersion: metadata.version,
      };
    },
  });

  // ==========================================
  // 7. EVALUATE SCHEDULE CONSTRAINTS (Read-only)
  // ==========================================
  tools.push({
    name: 'evaluate_schedule_constraints',
    description:
      'Generate diurnal dosing schedule based on patient circadian routine and evaluate potential scheduling conflicts (e.g. bedtime diuretic hazards).',
    inputSchema: z.object({
      patientId: z.string().min(1, 'patientId is required'),
    }),
    outputSchema: z.object({
      patientId: z.string(),
      slots: z.array(z.any()),
      conflicts: z.array(z.any()),
      comparison: z.any(),
    }),
    authorizationPolicy: 'authenticated_user',
    isReadOnly: true,
    expectedFailureModes: [
      'PATIENT_NOT_FOUND',
      'ROUTINE_NOT_FOUND',
      'CONFLICTING_CONSTRAINTS',
    ],
    async execute(input) {
      const patient = deps.patientRepo.findById(input.patientId);
      if (!patient) {
        throw new Error(`Patient "${input.patientId}" was not found.`);
      }

      const meds = deps.medRepo.findByPatientId(input.patientId);
      const activeMeds = meds.filter(
        (m) => m.status === 'active' || m.status === 'prn'
      );
      const routine = deps.chronoService.getPatientRoutine(input.patientId);

      const timetable = deps.chronoCoordinator.generateSchedule({
        patient,
        medications: activeMeds,
        routine,
      });

      return {
        patientId: input.patientId,
        slots: timetable.slots,
        conflicts: timetable.conflicts,
        comparison: timetable.comparison,
      };
    },
  });

  // ==========================================
  // 8. CREATE REVIEW REQUEST (Mutating)
  // ==========================================
  tools.push({
    name: 'create_review_request',
    description:
      'Create a formal clinical review request requiring explicit human pharmacist or physician signoff.',
    inputSchema: z.object({
      workflowId: z.string().min(1, 'workflowId is required'),
      category: ReviewCategorySchema,
      reason: z.string().min(1, 'reason is required'),
      supportingEvidenceReferences: z.array(z.string()).default([]),
      missingOrConflictingInfo: z.string().optional(),
      requestedReviewerAction: z.string().min(1, 'requestedReviewerAction is required'),
      itemVersion: z.number().int().positive().default(1),
      targetEntityType: z.enum(['medication', 'schedule', 'interaction', 'ocr_candidate', 'evidence']),
      targetEntityId: z.string().min(1, 'targetEntityId is required'),
    }),
    outputSchema: z.object({
      reviewId: z.string(),
      status: z.literal('pending'),
      workflowId: z.string(),
    }),
    authorizationPolicy: 'authenticated_user',
    isReadOnly: false,
    expectedFailureModes: ['WORKFLOW_NOT_FOUND', 'DATABASE_ERROR'],
    async execute(input, context) {
      const reviewId = `rev-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const request = {
        id: reviewId,
        workflowId: input.workflowId,
        category: input.category,
        reason: input.reason,
        supportingEvidenceReferences: input.supportingEvidenceReferences,
        missingOrConflictingInfo: input.missingOrConflictingInfo,
        requestedReviewerAction: input.requestedReviewerAction,
        status: 'pending' as const,
        itemVersion: input.itemVersion,
        targetEntityType: input.targetEntityType,
        targetEntityId: input.targetEntityId,
        createdAt: new Date().toISOString(),
      };

      deps.reviewRequestRepo.create(request);

      return {
        reviewId,
        status: 'pending',
        workflowId: input.workflowId,
      };
    },
  });

  // ==========================================
  // 9. GET WORKFLOW STATUS (Read-only)
  // ==========================================
  tools.push({
    name: 'get_workflow_status',
    description:
      'Retrieve current shared WorkflowContext state, completed operations, pending human reviews, and versioning info.',
    inputSchema: z.object({
      workflowId: z.string().min(1, 'workflowId is required'),
    }),
    outputSchema: z.object({
      workflowId: z.string(),
      patientId: z.string(),
      state: z.string(),
      version: z.number(),
      pendingApprovalsCount: z.number(),
      completedOperationsCount: z.number(),
      failedOperationsCount: z.number(),
    }),
    authorizationPolicy: 'authenticated_user',
    isReadOnly: true,
    expectedFailureModes: ['WORKFLOW_NOT_FOUND'],
    async execute(input) {
      const context = deps.workflowRepo.findById(input.workflowId);
      if (!context) {
        throw new Error(`Workflow "${input.workflowId}" was not found.`);
      }

      return {
        workflowId: context.workflowId,
        patientId: context.patientId,
        state: context.state,
        version: context.version,
        pendingApprovalsCount: context.pendingHumanApprovals.filter(
          (a) => a.status === 'pending'
        ).length,
        completedOperationsCount: context.completedOperations.length,
        failedOperationsCount: context.failedOperations.length,
      };
    },
  });

  // ==========================================
  // 10. SUBMIT CANDIDATE MEDICATIONS (Prescription Agent)
  // ==========================================
  tools.push({
    name: 'submit_candidate_medications',
    description:
      'Submit OCR-extracted candidate medication orders into the workflow context. Candidate records are strictly unverified and require explicit human clinician confirmation.',
    inputSchema: SubmitCandidateMedicationsInputSchema,
    outputSchema: SubmitCandidateMedicationsOutputSchema,
    authorizationPolicy: 'authenticated_user',
    isReadOnly: false,
    expectedFailureModes: ['WORKFLOW_NOT_FOUND', 'VALIDATION_FAILED', 'UNAUTHORIZED_ACCESS'],
    async execute(input, context) {
      const wf = deps.workflowRepo.findById(input.workflowId);
      if (!wf) {
        throw new Error(`Workflow "${input.workflowId}" was not found.`);
      }

      const unverifiedIds: string[] = [];
      const createdReviewIds: string[] = [];

      for (const cand of input.candidates) {
        const id = cand.id || `cand-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        const candidateRecord = {
          id,
          rawText: cand.rawText,
          brand: cand.brand,
          genericName: cand.genericName,
          dose: cand.dose,
          frequency: cand.frequency,
          route: cand.route,
          confidence: cand.confidence ?? 0.5,
          // CRITICAL SAFETY GUARDRAIL: An agent cannot mark candidates verified
          status: 'unverified' as const,
        };

        wf.unverifiedMedicationCandidates.push(candidateRecord);
        unverifiedIds.push(id);

        // If dose/frequency is missing or confidence is low, create a clinical review request
        const isAmbiguous = (cand.confidence ?? 0.5) < 0.85 || !cand.dose || !cand.frequency;
        const reviewId = `rev-cand-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        const reviewReq = {
          id: reviewId,
          workflowId: wf.workflowId,
          category: 'medication_identity_clarification' as const,
          reason: isAmbiguous
            ? `Low-confidence or incomplete candidate order: ${cand.brand || cand.rawText} (${cand.dose || 'dose missing'})`
            : `Unverified prescription intake order: ${cand.brand || cand.rawText}`,
          supportingEvidenceReferences: input.documentId ? [input.documentId] : [],
          missingOrConflictingInfo: !cand.dose
            ? 'Missing prescribed dose and strength.'
            : !cand.frequency
            ? 'Missing prescribed administration frequency.'
            : `Confidence score: ${cand.confidence}`,
          requestedReviewerAction: 'Verify brand name, generic entity, strength, and administration instructions.',
          status: 'pending' as const,
          itemVersion: wf.version,
          targetEntityType: 'ocr_candidate' as const,
          targetEntityId: id,
          createdAt: new Date().toISOString(),
        };

        deps.reviewRequestRepo.create(reviewReq);
        wf.pendingHumanApprovals.push(reviewReq);
        createdReviewIds.push(reviewId);
      }

      deps.workflowRepo.update(wf);

      return {
        workflowId: wf.workflowId,
        submittedCount: input.candidates.length,
        unverifiedCandidateIds: unverifiedIds,
        requiresClinicianConfirmation: true,
        createdReviewRequestIds: createdReviewIds,
      };
    },
  });

  // ==========================================
  // 11. PROPOSE SCHEDULE DRAFT (Scheduling Agent)
  // ==========================================
  tools.push({
    name: 'propose_schedule_draft',
    description:
      'Generate a draft 24-hour diurnal administration schedule. Preserves 100% of prescribed doses and cannot approve its own schedule.',
    inputSchema: ProposeScheduleDraftInputSchema,
    outputSchema: ProposeScheduleDraftOutputSchema,
    authorizationPolicy: 'authenticated_user',
    isReadOnly: false,
    expectedFailureModes: [
      'WORKFLOW_NOT_FOUND',
      'PATIENT_NOT_FOUND',
      'UNCONFIRMED_MEDICATIONS_PRESENT',
      'DOSE_ALTERATION_PROHIBITED',
    ],
    async execute(input, context) {
      const wf = deps.workflowRepo.findById(input.workflowId);
      if (!wf) {
        throw new Error(`Workflow "${input.workflowId}" was not found.`);
      }

      const patient = deps.patientRepo.findById(input.patientId);
      if (!patient) {
        throw new Error(`Patient "${input.patientId}" was not found.`);
      }

      const meds = deps.medRepo.findByPatientId(input.patientId);
      const activeConfirmed = meds.filter(
        (m) =>
          (m.status === 'active' || m.status === 'prn') &&
          m.verificationStatus === 'confirmed'
      );

      const routine = deps.chronoService.getPatientRoutine(input.patientId);
      const timetable = deps.chronoCoordinator.generateSchedule({
        patient,
        medications: activeConfirmed,
        routine,
      });

      // CRITICAL SAFETY GUARDRAIL: 100% Prescribed Doses Preserved
      const is100PercentPreserved =
        timetable.comparison.totalMedications === 0 ||
        timetable.comparison.unchangedDoseCount === timetable.comparison.totalMedications;
      if (!is100PercentPreserved) {
        throw new Error(
          'CRITICAL SAFETY VIOLATION: Proposed schedule failed 100% prescribed dose preservation check.'
        );
      }

      // Record draft in context
      wf.proposedSchedules = {
        scheduleTimeline: timetable.slots,
        conflicts: timetable.conflicts,
        generatedAt: new Date().toISOString(),
      };

      // CRITICAL SAFETY GUARDRAIL: Cannot self-approve
      wf.humanApprovedOutcomes = {
        scheduleApproved: false,
      };

      // Create schedule review request if not already present
      const existing = wf.pendingHumanApprovals.find(
        (a) => a.category === 'schedule_review' && a.status === 'pending'
      );
      if (!existing) {
        const reviewId = `rev-sched-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        const reviewReq = {
          id: reviewId,
          workflowId: wf.workflowId,
          category: 'schedule_review' as const,
          reason: `Diurnal schedule draft proposed with ${timetable.slots.length} dosing windows. Review required.`,
          supportingEvidenceReferences: ['Chrono-Dosing-Guideline-2026.1'],
          missingOrConflictingInfo:
            timetable.conflicts.length > 0
              ? `${timetable.conflicts.length} timing conflict(s) detected.`
              : undefined,
          requestedReviewerAction: 'Review administration timetable and sign off on diurnal dosing plan.',
          status: 'pending' as const,
          itemVersion: wf.version,
          targetEntityType: 'schedule' as const,
          targetEntityId: wf.workflowId,
          createdAt: new Date().toISOString(),
        };

        deps.reviewRequestRepo.create(reviewReq);
        wf.pendingHumanApprovals.push(reviewReq);
      }

      deps.workflowRepo.update(wf);

      const totalDoses = timetable.slots.reduce(
        (acc: number, s: any) => acc + (s.doses?.length || 0),
        0
      );

      return {
        workflowId: wf.workflowId,
        patientId: input.patientId,
        totalSlots: timetable.slots.length,
        totalDoses,
        prescribedDosesPreserved100Percent: true,
        conflictsDetected: timetable.conflicts.length,
        requiresClinicianApproval: true,
        scheduleDraft: timetable,
      };
    },
  });

  return tools;
}
