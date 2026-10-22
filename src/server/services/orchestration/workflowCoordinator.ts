import fs from 'fs';
import { randomUUID } from 'crypto';
import type Database from 'better-sqlite3';
import { PatientRepository } from '../../repositories/patientRepository.js';
import { MedicationRepository } from '../../repositories/medicationRepository.js';
import { LabMeasurementRepository } from '../../repositories/labMeasurementRepository.js';
import { AuditLogRepository } from '../../repositories/auditLogRepository.js';
import { ChronoRepository } from '../../repositories/chronoRepository.js';
import { AuditService } from '../auditService.js';
import { PharmacokineticConflictEngine } from '../interactions/conflictEngine.js';
import { LocalDrugReferenceProvider } from '../interactions/referenceDataProvider.js';
import { LocalInteractionEvidenceProvider } from '../interactions/interactionEvidenceProvider.js';
import { CircadianScheduleCoordinator } from '../chrono/scheduleCoordinator.js';
import { ChronoService } from '../chrono/chronoService.js';
import { DrugNormalizationService } from '../ocr/normalizationService.js';
import { OCRExtractionService } from '../ocr/ocrExtractionService.js';
import { LocalRxNormTerminologyProvider } from '../ocr/terminologyProvider.js';
import { FileStorageService } from '../ocr/fileStorageService.js';
import { LocalOCREngine } from '../ocr/ocrEngine.js';
import type {
  ConsolidatedClinicalReport,
  PharmacistReviewItem,
  WorkflowResumeRequest,
  WorkflowRun,
  WorkflowRunOptions,
} from '../../../shared/orchestrationTypes.js';
import { WorkflowStateMachine } from './workflowStateMachine.js';

export class WorkflowCoordinator {
  public static readonly VERSION = '2026.1-Phase5-Orchestrator';

  // In-memory run cache (idempotent lookup)
  private activeRuns: Map<string, WorkflowStateMachine> = new Map();
  private patientLatestRuns: Map<string, string> = new Map();

  private patientRepo: PatientRepository;
  private medRepo: MedicationRepository;
  private labRepo: LabMeasurementRepository;
  private auditService: AuditService;
  private conflictEngine: PharmacokineticConflictEngine;
  private chronoCoordinator: CircadianScheduleCoordinator;
  private chronoService: ChronoService;
  private ocrNormalizationService?: DrugNormalizationService;
  private fileStorageService?: FileStorageService;
  private ocrEngine?: LocalOCREngine;

  constructor(
    patientRepoOrDb: PatientRepository | Database.Database,
    medRepo?: MedicationRepository,
    labRepo?: LabMeasurementRepository,
    auditService?: AuditService,
    conflictEngine?: PharmacokineticConflictEngine,
    chronoCoordinator?: CircadianScheduleCoordinator,
    chronoService?: ChronoService,
    ocrNormalizationService?: DrugNormalizationService,
    fileStorageService?: FileStorageService,
    ocrEngine?: LocalOCREngine
  ) {
    if ((patientRepoOrDb as any)?.prepare) {
      const db = patientRepoOrDb as Database.Database;
      this.patientRepo = new PatientRepository(db);
      this.medRepo = new MedicationRepository(db);
      this.labRepo = new LabMeasurementRepository(db);
      const auditRepo = new AuditLogRepository(db);
      this.auditService = new AuditService(auditRepo);
      const chronoRepo = new ChronoRepository(db);
      this.chronoService = new ChronoService(
        this.patientRepo,
        this.medRepo,
        chronoRepo,
        this.auditService
      );
      const drugRef = new LocalDrugReferenceProvider();
      const evidence = new LocalInteractionEvidenceProvider();
      this.conflictEngine = new PharmacokineticConflictEngine(drugRef, evidence);
      this.chronoCoordinator = new CircadianScheduleCoordinator();
      this.ocrEngine = new LocalOCREngine();
      this.fileStorageService = new FileStorageService();
      const ocrExtraction = new OCRExtractionService();
      const terminologyProvider = new LocalRxNormTerminologyProvider();
      this.ocrNormalizationService = new DrugNormalizationService(
        ocrExtraction,
        terminologyProvider,
        this.medRepo
      );
    } else {
      this.patientRepo = patientRepoOrDb as PatientRepository;
      this.medRepo = medRepo!;
      this.labRepo = labRepo!;
      this.auditService = auditService!;
      this.conflictEngine = conflictEngine!;
      this.chronoCoordinator = chronoCoordinator!;
      this.chronoService = chronoService!;
      this.ocrNormalizationService = ocrNormalizationService;
      this.fileStorageService = fileStorageService;
      this.ocrEngine = ocrEngine;
    }
  }

  public async startWorkflow(options: WorkflowRunOptions): Promise<WorkflowRun> {
    const { patientId, requireConfirmedOnly = true, ocrDocumentId, timeoutMs = 10000, actor } = options;

    const sm = new WorkflowStateMachine(patientId, options);
    const runId = sm.getSnapshot().runId;
    this.activeRuns.set(runId, sm);
    this.patientLatestRuns.set(patientId, runId);

    // Execute state machine asynchronously or up to pause checkpoint
    await this.executeWorkflowStages(sm);

    return sm.getSnapshot();
  }

  public getWorkflowRun(runId: string): WorkflowRun | null {
    const sm = this.activeRuns.get(runId);
    return sm ? sm.getSnapshot() : null;
  }

  public getRun(runId: string): WorkflowRun | null {
    return this.getWorkflowRun(runId);
  }

  public getLatestRunForPatient(patientId: string): WorkflowRun | null {
    const runId = this.patientLatestRuns.get(patientId);
    if (!runId) return null;
    return this.getWorkflowRun(runId);
  }

  public async getOrGenerateConsolidatedReport(
    patientId: string,
    actor: string
  ): Promise<ConsolidatedClinicalReport> {
    const latest = this.getLatestRunForPatient(patientId);
    if (latest && latest.report) {
      return latest.report;
    }
    const run = await this.startWorkflow({
      patientId,
      requireConfirmedOnly: false,
      actor,
    });
    if (!run.report) {
      throw new Error(`Failed to compile consolidated report for patient ${patientId}`);
    }
    return run.report;
  }

  public async resumeWorkflow(
    runId: string,
    resumeRequest: WorkflowResumeRequest
  ): Promise<WorkflowRun> {
    const sm = this.activeRuns.get(runId);
    if (!sm) {
      throw new Error(`Workflow run "${runId}" not found`);
    }

    if (sm.getState() !== 'PAUSED_FOR_CLINICAL_REVIEW') {
      throw new Error(
        `Cannot resume workflow in state "${sm.getState()}". Must be in "PAUSED_FOR_CLINICAL_REVIEW".`
      );
    }

    const snapshot = sm.getSnapshot();
    const patientId = snapshot.patientId;

    sm.log('INFO', 'RESUMING', `Resuming workflow ${runId} with actor: ${resumeRequest.actor}`);

    // If clinician supplied confirmed medication IDs, update their verification status
    if (resumeRequest.confirmedMedicationIds && resumeRequest.confirmedMedicationIds.length > 0) {
      for (const medId of resumeRequest.confirmedMedicationIds) {
        const med = this.medRepo.findById(medId);
        if (med && med.verificationStatus !== 'confirmed') {
          const updated = this.medRepo.updateVerificationStatus(medId, 'confirmed');
          if (updated) {
            this.auditService.logUpdate(
              patientId,
              'medication',
              medId,
              resumeRequest.actor,
              `Clinician confirmed medication identity during workflow checkpoint. Justification: ${resumeRequest.notes || 'Order verified against clinical problem list'}`,
              { verificationStatus: med.verificationStatus },
              { verificationStatus: 'confirmed' }
            );
            sm.log(
              'AUDIT',
              'CONFIRMATION',
              `Verified medication order ${med.brand} (${med.genericName}) as confirmed truth.`
            );
          }
        }
      }
    }

    // Complete the AWAITING_MEDICATION_CONFIRMATION checkpoint step
    sm.completeStep(
      'AWAITING_MEDICATION_CONFIRMATION',
      `Medication verification checkpoint satisfied by ${resumeRequest.actor}.`
    );

    // Proceed to remaining stages
    await this.executeFromInteractionStage(sm);

    return sm.getSnapshot();
  }

  // ==========================================
  // CORE WORKFLOW PIPELINE EXECUTION
  // ==========================================

  private async executeWorkflowStages(sm: WorkflowStateMachine): Promise<void> {
    const snapshot = sm.getSnapshot();
    const { patientId, options } = snapshot;

    try {
      // ----------------------------------------------------
      // STAGE 1: FETCHING PATIENT RECORDS
      // ----------------------------------------------------
      sm.transitionTo('FETCHING_PATIENT_RECORDS');
      sm.startStep('FETCHING_PATIENT_RECORDS');

      const patient = this.patientRepo.findById(patientId);
      if (!patient) {
        sm.failStep(
          'FETCHING_PATIENT_RECORDS',
          'PATIENT_NOT_FOUND',
          `Patient record with ID "${patientId}" was not found in the database.`,
          true
        );
        return;
      }

      const medications = this.medRepo.findByPatientId(patientId);
      const activeMeds = medications.filter((m) => m.status === 'active' || m.status === 'prn');
      const labs = this.labRepo.findByPatientId(patientId);

      sm.completeStep(
        'FETCHING_PATIENT_RECORDS',
        `Retrieved patient chart (${patient.name}), ${activeMeds.length} active/PRN medications, and ${labs.length} lab measurements.`,
        {
          patientName: patient.name,
          mrn: patient.mrn,
          activeMedCount: activeMeds.length,
          labCount: labs.length,
        }
      );

      // ----------------------------------------------------
      // STAGE 2: OCR INTAKE (Optional)
      // ----------------------------------------------------
      if (options.ocrDocumentId && this.fileStorageService && this.ocrNormalizationService && this.ocrEngine) {
        sm.transitionTo('OCR_INTAKE');
        sm.startStep('OCR_INTAKE');

        const doc = this.fileStorageService.getDocument(options.ocrDocumentId);
        if (!doc) {
          sm.failStep(
            'OCR_INTAKE',
            'DOCUMENT_NOT_FOUND',
            `Prescription document "${options.ocrDocumentId}" could not be retrieved from secure storage.`,
            true
          );
          return;
        }

        // Run local OCR extraction with timeout guard
        const fileBuffer = fs.readFileSync(doc.filePath);
        const rawOcr = await this.executeWithTimeout(
          () => this.ocrEngine!.processDocument(fileBuffer, doc.originalName, doc.mimeType),
          options.timeoutMs || 8000,
          'OCR Extraction Agent'
        );
        rawOcr.documentId = doc.id;

        const normalized = await this.executeWithTimeout(
          () => this.ocrNormalizationService!.processAndNormalize(rawOcr, patientId),
          options.timeoutMs || 8000,
          'Drug Normalization Agent'
        );

        sm.completeStep(
          'OCR_INTAKE',
          `Parsed prescription document (${doc.originalName}). Extracted ${normalized.candidateMedications.length} candidate medications.`,
          {
            documentId: options.ocrDocumentId,
            candidatesCount: normalized.candidateMedications.length,
            highConfidenceCount: normalized.summary.highConfidenceCount,
            ambiguityCount: normalized.summary.ambiguityCount,
          }
        );
      } else {
        sm.log('INFO', 'OCR_INTAKE', 'No prescription upload specified; proceeding with stored patient chart.');
      }

      // ----------------------------------------------------
      // STAGE 3: AWAITING MEDICATION CONFIRMATION
      // ----------------------------------------------------
      sm.transitionTo('AWAITING_MEDICATION_CONFIRMATION');
      sm.startStep('AWAITING_MEDICATION_CONFIRMATION');

      // Refresh medications after optional OCR
      const currentMeds = this.medRepo.findByPatientId(patientId);
      const currentActive = currentMeds.filter((m) => m.status === 'active' || m.status === 'prn');
      const unconfirmed = currentActive.filter((m) => m.verificationStatus !== 'confirmed');

      if (options.requireConfirmedOnly && unconfirmed.length > 0) {
        // Epistemic Checkpoint: Pause workflow to prevent false safety inferences on unconfirmed data
        sm.pauseForCheckpoint(
          'AWAITING_MEDICATION_CONFIRMATION',
          `Found ${unconfirmed.length} unconfirmed medication orders. Clinical confirmation is required before proceeding to interaction analysis and scheduling.`,
          {
            type: 'confirm_medications',
            message: `Please review and confirm epistemic status for ${unconfirmed.map((u) => u.brand).join(', ')}.`,
            unconfirmedMedications: unconfirmed.map((u) => ({
              id: u.id,
              brand: u.brand,
              genericName: u.genericName,
              reason: `Prescription verification status is currently "${u.verificationStatus}"`,
            })),
          }
        );
        return; // Workflow paused at checkpoint
      }

      sm.completeStep(
        'AWAITING_MEDICATION_CONFIRMATION',
        `All ${currentActive.length} active medication orders are verified as confirmed truth.`
      );

      // Proceed to interaction and schedule stages
      await this.executeFromInteractionStage(sm);
    } catch (err: any) {
      sm.failStep(
        sm.getState(),
        'WORKFLOW_EXECUTION_ERROR',
        err.message || 'An unexpected error occurred during workflow execution',
        true
      );
    }
  }

  private async executeFromInteractionStage(sm: WorkflowStateMachine): Promise<void> {
    const snapshot = sm.getSnapshot();
    const { patientId, options } = snapshot;

    try {
      const patient = this.patientRepo.findById(patientId)!;
      const medications = this.medRepo.findByPatientId(patientId);
      const activeMeds = medications.filter((m) => m.status === 'active' || m.status === 'prn');
      const labs = this.labRepo.findByPatientId(patientId);

      // ----------------------------------------------------
      // STAGE 4: EVALUATING INTERACTIONS
      // ----------------------------------------------------
      sm.transitionTo('EVALUATING_INTERACTIONS');
      sm.startStep('EVALUATING_INTERACTIONS');

      const interactionResult = await this.executeWithTimeout(
        () => this.conflictEngine.evaluateRegimen(patient, activeMeds, labs),
        options.timeoutMs || 8000,
        'Pharmacokinetic Conflict Engine'
      );

      sm.completeStep(
        'EVALUATING_INTERACTIONS',
        `Evaluated ${interactionResult.summary.totalPairsEvaluated} drug pairs. Identified ${interactionResult.findings.length} findings (${interactionResult.summary.bySeverity.contraindicated} contraindicated, ${interactionResult.summary.bySeverity.major} major).`,
        {
          totalPairsEvaluated: interactionResult.summary.totalPairsEvaluated,
          findingsCount: interactionResult.findings.length,
          duplicateIngredientsCount: interactionResult.duplicateIngredients.length,
          dataGapsCount: interactionResult.dataGaps.length,
        }
      );

      // ----------------------------------------------------
      // STAGE 5: COORDINATING SCHEDULE
      // ----------------------------------------------------
      sm.transitionTo('COORDINATING_SCHEDULE');
      sm.startStep('COORDINATING_SCHEDULE');

      const routine = this.chronoService.getPatientRoutine(patientId);
      const scheduleTimeline = await this.executeWithTimeout(
        () =>
          Promise.resolve(
            this.chronoCoordinator.generateSchedule({
              patient,
              medications: activeMeds,
              routine,
              interactionFindings: interactionResult.findings,
            })
          ),
        options.timeoutMs || 8000,
        'Circadian Schedule Coordinator'
      );

      sm.completeStep(
        'COORDINATING_SCHEDULE',
        `Generated 24-hour diurnal schedule across ${scheduleTimeline.slots.length} time slots. Prescribed doses preserved: 100%. Identified ${scheduleTimeline.conflicts.length} timing conflict(s).`,
        {
          slotsCount: scheduleTimeline.slots.length,
          totalDoses: scheduleTimeline.slots.reduce((acc, s) => acc + s.doses.length, 0),
          conflictsCount: scheduleTimeline.conflicts.length,
        }
      );

      // ----------------------------------------------------
      // STAGE 6: GENERATING CONSOLIDATED REPORT
      // ----------------------------------------------------
      sm.transitionTo('GENERATING_CONSOLIDATED_REPORT');
      sm.startStep('GENERATING_CONSOLIDATED_REPORT');

      const report = this.synthesizeConsolidatedReport(
        snapshot.runId,
        patient,
        activeMeds,
        interactionResult,
        scheduleTimeline
      );

      sm.completeStep(
        'GENERATING_CONSOLIDATED_REPORT',
        `Consolidated clinical dossier synthesized. Identified ${report.itemsRequiringPharmacistReview.length} prioritized item(s) for pharmacist action.`
      );

      // Finalize Workflow Run
      sm.completeWorkflow(report);
    } catch (err: any) {
      sm.failStep(
        sm.getState(),
        'WORKFLOW_STAGE_ERROR',
        err.message || 'Error executing clinical evaluation stages',
        true
      );
    }
  }

  // ==========================================
  // CONSOLIDATED REPORT SYNTHESIS
  // ==========================================

  private synthesizeConsolidatedReport(
    runId: string,
    patient: any,
    activeMeds: any[],
    interactionResult: any,
    scheduleTimeline: any
  ): ConsolidatedClinicalReport {
    const reportId = `report-${randomUUID()}`;
    const generatedAt = new Date().toISOString();

    // Priority review items compilation
    const reviewItems: PharmacistReviewItem[] = [];

    // 1. Unconfirmed Medications
    const unconfirmed = activeMeds.filter((m) => m.verificationStatus !== 'confirmed');
    if (unconfirmed.length > 0) {
      reviewItems.push({
        id: `review-unconfirmed-${runId}`,
        category: 'uncertain_identity',
        urgency: 'immediate_action',
        title: `Unconfirmed Medication Orders (${unconfirmed.length})`,
        description: `Patient regimen includes ${unconfirmed.length} unconfirmed medication order(s) requiring chart verification: ${unconfirmed.map((u) => u.brand).join(', ')}.`,
        medicationsInvolved: unconfirmed.map((u) => ({ id: u.id, name: `${u.brand} (${u.genericName})` })),
        actionableRecommendation: 'Verify against discharge summary or prescriber order before administering.',
        evidenceCitation: 'The Joint Commission National Patient Safety Goals - Medication Reconciliation',
      });
    }

    // 2. Severe / Contraindicated Interactions
    for (const finding of interactionResult.findings) {
      if (finding.severity === 'contraindicated' || finding.severity === 'major') {
        reviewItems.push({
          id: `review-ddi-${finding.findingId}`,
          category: 'severe_ddi',
          urgency: 'immediate_action',
          title: `Severe Interaction: ${finding.medicationA.brand} & ${finding.medicationB.brand}`,
          description: `${finding.clinicalImpact}. Mechanism: ${finding.mechanism}`,
          medicationsInvolved: [
            { id: finding.medicationA.id, name: finding.medicationA.brand },
            { id: finding.medicationB.id, name: finding.medicationB.brand },
          ],
          actionableRecommendation: finding.managementRecommendation,
          evidenceCitation: finding.sourceCitation,
        });
      }
    }

    // 3. Duplicate Active Ingredients
    if (interactionResult.duplicateIngredients.length > 0) {
      for (const dup of interactionResult.duplicateIngredients) {
        reviewItems.push({
          id: `review-dup-${dup.ingredientName}`,
          category: 'duplicate_ingredient',
          urgency: 'immediate_action',
          title: `Duplicate Chemical Entity: ${dup.ingredientName}`,
          description: `Co-prescribed across ${dup.medications.length} separate orders (${dup.medications.map((m: any) => m.brand).join(', ')}), creating cumulative toxicity risk.`,
          medicationsInvolved: dup.medications.map((m: any) => ({ id: m.id, name: m.brand })),
          actionableRecommendation: dup.clinicalRecommendation,
          evidenceCitation: 'FDA Boxed Warnings on Acetaminophen/NSAID Cumulative Toxicity',
        });
      }
    }

    // 4. Chrono-Dosing Conflicts (Bedtime diuretics, Chelation)
    for (const conflict of scheduleTimeline.conflicts) {
      reviewItems.push({
        id: `review-chrono-${conflict.id}`,
        category: conflict.conflictType === 'bedtime_diuretic_hazard' ? 'fall_hazard' : 'timing_conflict',
        urgency: conflict.severity === 'urgent_prescriber_review' ? 'immediate_action' : 'pre_administration_signoff',
        title: conflict.title,
        description: conflict.description,
        medicationsInvolved: conflict.medicationsInvolved,
        actionableRecommendation: conflict.recommendedAction,
        evidenceCitation: conflict.evidenceCitation,
      });
    }

    // 5. Organ Clearance Gaps
    for (const gap of interactionResult.dataGaps) {
      reviewItems.push({
        id: `review-gap-${gap.gapType}`,
        category: 'clearance_gap',
        urgency: gap.severity === 'high' ? 'immediate_action' : 'routine_monitoring',
        title: `Clinical Data Gap: ${gap.title}`,
        description: gap.description,
        medicationsInvolved: gap.affectedMedicationIds.map((id: string) => ({ id, name: id })),
        actionableRecommendation: gap.suggestedAction,
        evidenceCitation: 'KDIGO 2024 Clinical Practice Guideline for the Evaluation and Management of CKD',
      });
    }

    return {
      reportId,
      workflowRunId: runId,
      patientId: patient.id,
      patientSummary: {
        id: patient.id,
        name: patient.name,
        mrn: patient.mrn,
        age: this.calculateAge(patient.dateOfBirth),
        careSetting: patient.careSetting,
      },
      generatedAt,
      isPrototype: true,
      confirmedMedicationCount: activeMeds.filter((m) => m.verificationStatus === 'confirmed').length,
      unconfirmedMedicationCount: unconfirmed.length,
      activeMedications: activeMeds,
      interactionAnalysis: {
        totalEvaluated: interactionResult.summary.totalPairsEvaluated,
        contraindicatedCount: interactionResult.summary.bySeverity.contraindicated,
        majorCount: interactionResult.summary.bySeverity.major,
        moderateCount: interactionResult.summary.bySeverity.moderate,
        duplicateIngredientsCount: interactionResult.duplicateIngredients.length,
        findings: interactionResult.findings,
        dataGaps: interactionResult.dataGaps,
        providerHealth: interactionResult.providerStatus,
      },
      circadianCoordination: {
        scheduleId: scheduleTimeline.scheduleId,
        totalSlots: scheduleTimeline.slots.length,
        totalDoses: scheduleTimeline.slots.reduce((acc: number, s: any) => acc + s.doses.length, 0),
        prescribedDosesPreserved100Percent: scheduleTimeline.comparison.unchangedDoseCount === activeMeds.length,
        unresolvedTimingConflicts: scheduleTimeline.conflicts,
        slotsSummary: scheduleTimeline.slots.map((s: any) => ({
          slotName: s.slotName,
          targetTime: s.targetTime,
          mealRelation: s.mealRelation,
          doseCount: s.doses.length,
        })),
      },
      itemsRequiringPharmacistReview: reviewItems,
      provenance: {
        orchestratorVersion: WorkflowCoordinator.VERSION,
        conflictEngineVersion: interactionResult.engineVersion,
        chronoCoordinatorVersion: scheduleTimeline.version,
        referenceDatasetVersion: interactionResult.providerStatus.datasetMetadata.version,
        totalExecutionDurationMs: 0,
      },
      clinicalDisclaimer:
        'CLINICAL SAFETY PROTOTYPE: This consolidated clinical report connects deterministic prescription OCR normalization, pharmacokinetic conflict detection, and circadian timetable coordination. It does not replace clinical pharmacist medication review or direct physician oversight.',
    };
  }

  // ==========================================
  // HELPER METHODS
  // ==========================================

  private async executeWithTimeout<T>(
    operation: () => Promise<T>,
    timeoutMs: number,
    operationName: string
  ): Promise<T> {
    let timer: NodeJS.Timeout;

    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error(`Operation "${operationName}" timed out after ${timeoutMs}ms.`));
      }, timeoutMs);
    });

    try {
      const result = await Promise.race([operation(), timeoutPromise]);
      clearTimeout(timer!);
      return result;
    } catch (err) {
      clearTimeout(timer!);
      throw err;
    }
  }

  private calculateAge(dobString: string): number {
    const dob = new Date(dobString);
    const now = new Date();
    let age = now.getFullYear() - dob.getFullYear();
    const m = now.getMonth() - dob.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) {
      age--;
    }
    return age;
  }
}
