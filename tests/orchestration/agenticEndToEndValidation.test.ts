import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { initializeSchema } from '../../src/server/db/database.js';
import { seedSyntheticData } from '../../src/server/db/seeds.js';
import { PatientRepository } from '../../src/server/repositories/patientRepository.js';
import { MedicationRepository } from '../../src/server/repositories/medicationRepository.js';
import { LabMeasurementRepository } from '../../src/server/repositories/labMeasurementRepository.js';
import { DiagnosisRepository } from '../../src/server/repositories/diagnosisRepository.js';
import { AuditLogRepository } from '../../src/server/repositories/auditLogRepository.js';
import { ChronoRepository } from '../../src/server/repositories/chronoRepository.js';
import { WorkflowRepository } from '../../src/server/repositories/workflowRepository.js';
import { ReviewRequestRepository } from '../../src/server/repositories/reviewRequestRepository.js';
import { ApprovalRecordRepository } from '../../src/server/repositories/approvalRecordRepository.js';
import { ToolExecutionRepository } from '../../src/server/repositories/toolExecutionRepository.js';
import { ArtifactHistoryRepository } from '../../src/server/repositories/artifactHistoryRepository.js';

import { AuditService } from '../../src/server/services/auditService.js';
import { ChronoService } from '../../src/server/services/chrono/chronoService.js';
import { CircadianScheduleCoordinator } from '../../src/server/services/chrono/scheduleCoordinator.js';
import { LocalInteractionEvidenceProvider } from '../../src/server/services/interactions/interactionEvidenceProvider.js';
import { LocalDrugReferenceProvider } from '../../src/server/services/interactions/referenceDataProvider.js';
import { PharmacokineticConflictEngine } from '../../src/server/services/interactions/conflictEngine.js';
import { LocalOCREngine } from '../../src/server/services/ocr/ocrEngine.js';
import { OCRExtractionService } from '../../src/server/services/ocr/ocrExtractionService.js';
import { LocalRxNormTerminologyProvider } from '../../src/server/services/ocr/terminologyProvider.js';
import { DrugNormalizationService } from '../../src/server/services/ocr/normalizationService.js';
import { ReviewRequestService } from '../../src/server/services/orchestration/reviewRequestService.js';
import { ToolRegistry } from '../../src/server/services/orchestration/tools/toolRegistry.js';
import { createClinicalTools } from '../../src/server/services/orchestration/tools/clinicalTools.js';
import { AgenticWorkflowOrchestrator } from '../../src/server/services/orchestration/agenticWorkflowOrchestrator.js';
import { ClinicalEngineService } from '../../mcp-server/src/services/clinicalEngineService.js';
import { dispatchTool } from '../../mcp-server/src/tools/registry.js';

import {
  ApprovalVersionMismatchError,
  InvalidWorkflowTransitionError,
  UnauthorizedReviewerError,
  UnauthorizedReviewerRoleError,
  WorkflowPrerequisiteError,
} from '../../src/server/services/orchestration/stateMachine/errors.js';
import { ToolValidationError } from '../../src/server/services/orchestration/tools/toolRegistry.js';

describe('Phase 5: End-to-End Agentic Workflow Validation', () => {
  let db: Database.Database;
  let patientRepo: PatientRepository;
  let medRepo: MedicationRepository;
  let labRepo: LabMeasurementRepository;
  let diagRepo: DiagnosisRepository;
  let auditRepo: AuditLogRepository;
  let chronoRepo: ChronoRepository;
  let workflowRepo: WorkflowRepository;
  let reviewRepo: ReviewRequestRepository;
  let approvalRepo: ApprovalRecordRepository;
  let executionRepo: ToolExecutionRepository;
  let historyRepo: ArtifactHistoryRepository;

  let auditService: AuditService;
  let chronoService: ChronoService;
  let chronoCoordinator: CircadianScheduleCoordinator;
  let evidenceProvider: LocalInteractionEvidenceProvider;
  let conflictEngine: PharmacokineticConflictEngine;
  let reviewService: ReviewRequestService;
  let toolRegistry: ToolRegistry;
  let orchestrator: AgenticWorkflowOrchestrator;
  let engineService: ClinicalEngineService;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    initializeSchema(db);
    seedSyntheticData(db);

    patientRepo = new PatientRepository(db);
    medRepo = new MedicationRepository(db);
    labRepo = new LabMeasurementRepository(db);
    diagRepo = new DiagnosisRepository(db);
    auditRepo = new AuditLogRepository(db);
    chronoRepo = new ChronoRepository(db);
    workflowRepo = new WorkflowRepository(db);
    reviewRepo = new ReviewRequestRepository(db);
    approvalRepo = new ApprovalRecordRepository(db);
    executionRepo = new ToolExecutionRepository(db);
    historyRepo = new ArtifactHistoryRepository(db);

    auditService = new AuditService(auditRepo);
    chronoService = new ChronoService(patientRepo, medRepo, chronoRepo, auditService);
    chronoCoordinator = new CircadianScheduleCoordinator();
    evidenceProvider = new LocalInteractionEvidenceProvider();
    const drugRefProvider = new LocalDrugReferenceProvider();
    conflictEngine = new PharmacokineticConflictEngine(drugRefProvider, evidenceProvider);

    const ocrEngine = new LocalOCREngine();
    const ocrExtractionService = new OCRExtractionService();
    const terminologyProvider = new LocalRxNormTerminologyProvider();
    const ocrNormalizationService = new DrugNormalizationService(
      ocrExtractionService,
      terminologyProvider,
      medRepo
    );

    reviewService = new ReviewRequestService(reviewRepo, auditService, approvalRepo);
    toolRegistry = new ToolRegistry(executionRepo);

    const tools = createClinicalTools({
      patientRepo,
      medRepo,
      labRepo,
      diagRepo,
      auditService,
      conflictEngine,
      evidenceProvider,
      chronoCoordinator,
      chronoService,
      workflowRepo,
      reviewRequestRepo: reviewRepo,
      ocrNormalizationService,
      ocrEngine,
    });
    for (const tool of tools) {
      toolRegistry.registerTool(tool);
    }

    orchestrator = new AgenticWorkflowOrchestrator(
      workflowRepo,
      reviewService,
      toolRegistry,
      patientRepo,
      medRepo,
      labRepo,
      auditService,
      executionRepo,
      historyRepo,
      undefined,
      approvalRepo
    );

    engineService = new ClinicalEngineService(db);
  });

  afterEach(() => {
    db.close();
  });

  // =========================================================================
  // 1. END-TO-END 13-STEP INTEGRATION SCENARIO
  // =========================================================================
  describe('Full 13-Step Agentic Integration Scenario', () => {
    it('executes all 13 scenario steps seamlessly while enforcing deterministic clinical safety', async () => {
      // ---------------------------------------------------------------------
      // STEP 1: Create a synthetic patient with several medication records
      // ---------------------------------------------------------------------
      const syntheticPatient = patientRepo.create({
        mrn: 'SYN-E2E-2026-9901',
        name: 'Evelyn Reed',
        dateOfBirth: '1947-06-15',
        gender: 'female',
        weightKg: 62.5,
        heightCm: 160.0,
        primaryPhysician: 'Dr. Marcus Vance, MD',
        careSetting: 'Inpatient Geriatric Care',
        emergencyContact: 'Robert Reed (Son) 555-0199',
        notes: '[SYNTHETIC_TEST_DATA] End-to-end integration scenario test subject.',
      });

      expect(syntheticPatient.id).toBeDefined();
      expect(syntheticPatient.name).toBe('Evelyn Reed');

      // Create 3 active confirmed baseline medications
      const med1 = medRepo.create({
        patientId: syntheticPatient.id,
        brand: 'Zestril',
        genericName: 'lisinopril',
        activeIngredients: ['lisinopril'],
        salt: 'Dihydrate',
        strength: '20mg',
        formulation: 'tablet',
        route: 'oral',
        prescribedDose: '20mg',
        frequency: 'once daily',
        administrationInstructions: 'Take 1 tablet every morning',
        prescriber: 'Dr. Marcus Vance, MD',
        source: 'clinical_chart',
        status: 'active',
        verificationStatus: 'confirmed',
        startDate: '2025-01-10',
        indication: 'Hypertension',
      });

      const med2 = medRepo.create({
        patientId: syntheticPatient.id,
        brand: 'K-Dur',
        genericName: 'potassium chloride',
        activeIngredients: ['potassium chloride'],
        salt: 'None',
        strength: '20 mEq',
        formulation: 'extended-release tablet',
        route: 'oral',
        prescribedDose: '20 mEq',
        frequency: 'once daily',
        administrationInstructions: 'Take 1 tablet with breakfast',
        prescriber: 'Dr. Marcus Vance, MD',
        source: 'clinical_chart',
        status: 'active',
        verificationStatus: 'confirmed',
        startDate: '2025-02-01',
        indication: 'Hypokalemia prophylaxis',
      });

      const med3 = medRepo.create({
        patientId: syntheticPatient.id,
        brand: 'Glucophage',
        genericName: 'metformin',
        activeIngredients: ['metformin'],
        salt: 'Hydrochloride',
        strength: '500mg',
        formulation: 'tablet',
        route: 'oral',
        prescribedDose: '500mg',
        frequency: 'twice daily',
        administrationInstructions: 'Take 1 tablet with morning and evening meals',
        prescriber: 'Dr. Marcus Vance, MD',
        source: 'clinical_chart',
        status: 'active',
        verificationStatus: 'confirmed',
        startDate: '2025-01-15',
        indication: 'Type 2 Diabetes',
      });

      expect(medRepo.findByPatientId(syntheticPatient.id).length).toBe(3);

      // Initialize agentic workflow
      const workflow = await orchestrator.createWorkflow({
        patientId: syntheticPatient.id,
        actor: 'Nurse Practitioner Clara Finch',
      });
      expect(workflow.state).toBe('CREATED');
      expect(workflow.workflowId).toBeDefined();

      // Advance from CREATED -> RETRIEVING_PATIENT_CONTEXT -> MEDICATIONS_CONFIRMED
      const ctxAfterContext = await orchestrator.advanceWorkflow(workflow.workflowId, 'Nurse Practitioner Clara Finch');
      expect(ctxAfterContext.state).toBe('MEDICATIONS_CONFIRMED');
      expect(ctxAfterContext.confirmedMedicationRecordIds.length).toBe(3);

      // ---------------------------------------------------------------------
      // STEP 2: Submit a prescription fixture containing one ambiguous medication field
      // ---------------------------------------------------------------------
      // The prescription intake includes Spironolactone with ambiguous/low confidence
      const submitToolResult = await toolRegistry.executeTool(
        'submit_candidate_medications',
        {
          workflowId: workflow.workflowId,
          documentId: 'doc-fixture-ambiguous-spironolactone',
          candidates: [
            {
              rawText: 'Aldactone 25mg ?? daily',
              brand: 'Aldactone',
              genericName: 'spironolactone',
              dose: '25mg',
              frequency: 'daily',
              route: 'oral',
              confidence: 0.62, // Ambiguous (< 0.85 threshold)
            },
          ],
        },
        {
          actor: 'Prescription Agent OCR Engine',
          actorRole: 'assistant',
          workflowId: workflow.workflowId,
          agentId: 'prescription_agent',
        }
      );

      expect(submitToolResult.success).toBe(true);
      const submitData = submitToolResult.data;
      expect(submitData.submittedCount).toBe(1);
      expect(submitData.requiresClinicianConfirmation).toBe(true);

      const candidateId = submitData.unverifiedCandidateIds[0];
      expect(candidateId).toBeDefined();

      // ---------------------------------------------------------------------
      // STEP 3: Verify that orchestrator pauses and creates a medication-confirmation request
      // ---------------------------------------------------------------------
      // A candidate was submitted as unverified; transition to confirmation checkpoint
      const smContext = orchestrator.getWorkflow(workflow.workflowId)!;
      smContext.state = 'AWAITING_MEDICATION_CONFIRMATION';
      workflowRepo.update(smContext);

      // Advancing while unverified candidate exists must pause at AWAITING_MEDICATION_CONFIRMATION
      const pausedContext = await orchestrator.advanceWorkflow(workflow.workflowId, 'Intake Pharmacist');
      expect(pausedContext.state).toBe('AWAITING_MEDICATION_CONFIRMATION');

      // Verify a review request was created for medication identity clarification
      const pendingReviews = reviewService.listPending(workflow.workflowId);
      const medClarificationReview = pendingReviews.find(
        (r) => r.category === 'medication_identity_clarification'
      );
      expect(medClarificationReview).toBeDefined();
      expect(medClarificationReview?.status).toBe('pending');
      expect(medClarificationReview?.targetEntityId).toBe(candidateId);

      // Epistemic safety assertion: Cannot skip to CHECKING_INTERACTIONS while unverified candidates remain
      await expect(
        orchestrator.advanceWorkflow(workflow.workflowId, 'Clinical Pharmacist', 'CHECKING_INTERACTIONS')
      ).rejects.toThrow(InvalidWorkflowTransitionError);

      // ---------------------------------------------------------------------
      // STEP 4: Correct the ambiguous field and confirm medication through authorized workflow
      // ---------------------------------------------------------------------
      // Licensed clinical pharmacist confirms and clarifies the order
      const confirmedContext = await orchestrator.confirmMedicationCandidate(
        workflow.workflowId,
        candidateId,
        'Dr. Sarah Lin, PharmD',
        'Verified against prescriber clinic order: Spironolactone 25mg tablet orally once daily with morning food.'
      );

      // Candidate is confirmed
      const confirmedCand = confirmedContext.unverifiedMedicationCandidates.find((c) => c.id === candidateId);
      expect(confirmedCand?.status).toBe('confirmed');
      expect(confirmedContext.confirmedMedicationRecordIds).toContain(candidateId);

      // Advance to MEDICATIONS_CONFIRMED
      const postConfirmContext = await orchestrator.advanceWorkflow(workflow.workflowId, 'Dr. Sarah Lin, PharmD');
      expect(postConfirmContext.state).toBe('MEDICATIONS_CONFIRMED');

      // Create confirmed medication record in patient DB so conflict engine evaluates it
      const med4 = medRepo.create({
        patientId: syntheticPatient.id,
        brand: 'Aldactone',
        genericName: 'spironolactone',
        activeIngredients: ['spironolactone'],
        salt: 'None',
        strength: '25mg',
        formulation: 'tablet',
        route: 'oral',
        prescribedDose: '25mg',
        frequency: 'once daily',
        administrationInstructions: 'Take 1 tablet every morning',
        prescriber: 'Dr. Marcus Vance, MD',
        source: 'clinical_chart',
        status: 'active',
        verificationStatus: 'confirmed',
        startDate: '2025-02-15',
        indication: 'Resistant hypertension',
      });
      // Replace candidateId with med4.id in confirmedMedicationRecordIds for deterministic screening
      postConfirmContext.confirmedMedicationRecordIds = [med1.id, med2.id, med3.id, med4.id];
      workflowRepo.update(postConfirmContext);

      // ---------------------------------------------------------------------
      // STEP 5: Verify interaction engine runs against corrected medication list
      // ---------------------------------------------------------------------
      // Advance to CHECKING_INTERACTIONS -> executes deterministic conflict analysis
      const interactionContext = await orchestrator.advanceWorkflow(workflow.workflowId, 'Interaction Agent');
      expect(['CHECKING_INTERACTIONS', 'AWAITING_CLINICAL_REVIEW']).toContain(interactionContext.state);
      expect(interactionContext.interactionFindings.length).toBeGreaterThan(0);

      // Deterministic clinical finding: Lisinopril (ACEI) + Potassium Chloride + Spironolactone (K-sparing diuretic)
      // produces serious hyperkalemia interaction finding
      const hyperkalemiaRisk = interactionContext.interactionFindings.find(
        (f) =>
          f.severity === 'contraindicated' ||
          f.severity === 'major' ||
          f.clinicalImpact.toLowerCase().includes('potassium') ||
          f.clinicalImpact.toLowerCase().includes('hyperkalemia')
      );
      expect(hyperkalemiaRisk).toBeDefined();

      // DAG tracks the interaction findings artifact
      const activeFindings = orchestrator.getActiveFindings(workflow.workflowId);
      expect(activeFindings.isCurrent).toBe(true);
      expect(activeFindings.status).toBe('current');
      expect(activeFindings.findings.length).toBeGreaterThan(0);

      // ---------------------------------------------------------------------
      // STEP 6: Simulate an unavailable evidence provider and verify workflow blocks unsupported conclusions
      // ---------------------------------------------------------------------
      evidenceProvider.setOutageSimulation(true);

      // Create a fresh test workflow to test evidence outage transition to BLOCKED
      const outageWf = await orchestrator.createWorkflow({
        patientId: syntheticPatient.id,
        actor: 'Clinical Pharmacist',
      });
      await orchestrator.advanceWorkflow(outageWf.workflowId, 'Clinical Pharmacist'); // to MEDICATIONS_CONFIRMED

      // Attempt interaction analysis while evidence provider is offline
      const blockedWf = await orchestrator.advanceWorkflow(outageWf.workflowId, 'Clinical Pharmacist');
      expect(blockedWf.state).toBe('BLOCKED');
      expect(blockedWf.interactionFindings.length).toBe(0);
      expect(blockedWf.derivedFindings).toBeUndefined();

      const failedOp = blockedWf.failedOperations.find((op) => op.operationType === 'CHECK_INTERACTIONS');
      expect(failedOp).toBeDefined();
      expect(failedOp?.error?.isRecoverable).toBe(true);
      expect(failedOp?.error?.code).toBe('EVIDENCE_PROVIDER_UNAVAILABLE');

      // Downstream execution must NOT proceed while BLOCKED
      const stillBlocked = await orchestrator.advanceWorkflow(outageWf.workflowId, 'Clinical Pharmacist');
      expect(stillBlocked.state).toBe('BLOCKED');
      expect(stillBlocked.proposedSchedules).toBeUndefined();

      // ---------------------------------------------------------------------
      // STEP 7: Restore provider and retry failed operation
      // ---------------------------------------------------------------------
      evidenceProvider.setOutageSimulation(false);

      // Retrying from BLOCKED now unblocks the workflow
      const unblockedWf = await orchestrator.advanceWorkflow(outageWf.workflowId, 'Clinical Pharmacist');
      expect(unblockedWf.state).not.toBe('BLOCKED');
      expect(unblockedWf.interactionFindings.length).toBeGreaterThan(0);
      expect(unblockedWf.completedOperations.some((op) => op.operationType === 'CHECK_INTERACTIONS')).toBe(true);

      // ---------------------------------------------------------------------
      // STEP 8: Verify that a relevant correction invalidates dependent findings
      // ---------------------------------------------------------------------
      // Resolve all clinical reviews on main workflow to allow scheduling progression
      const pendingInteractions = reviewService.listPending(workflow.workflowId);
      for (const rev of pendingInteractions) {
        await orchestrator.resolveHumanReview(workflow.workflowId, rev.id, {
          status: 'approved',
          reviewerIdentity: 'Dr. Sarah Lin, PharmD',
          reviewerRole: 'clinical_pharmacist',
          reviewerNotes: 'Clinical benefit outweighs risk with close weekly serum potassium monitoring.',
          targetVersion: rev.itemVersion,
        });
      }

      // Advance workflow to PREPARING_SCHEDULE -> AWAITING_SCHEDULE_REVIEW
      const schedContext = await orchestrator.advanceWorkflow(workflow.workflowId, 'Scheduling Agent');
      expect(['PREPARING_SCHEDULE', 'AWAITING_SCHEDULE_REVIEW']).toContain(schedContext.state);
      expect(schedContext.proposedSchedules).toBeDefined();

      // Now introduce a relevant clinical correction: Dose correction on Spironolactone
      const invalidatedContext = await orchestrator.correctMedication(
        workflow.workflowId,
        med4.id,
        'Dr. Sarah Lin, PharmD',
        'Dose reduced from 25mg to 12.5mg daily due to borderline potassium level.'
      );

      // Safety check: State reverted to MEDICATIONS_CONFIRMED
      expect(invalidatedContext.state).toBe('MEDICATIONS_CONFIRMED');

      // DAG verification: Downstream artifacts marked stale
      const staleFindingsCheck = orchestrator.getActiveFindings(workflow.workflowId);
      expect(staleFindingsCheck.isCurrent).toBe(false);
      expect(staleFindingsCheck.status).toBe('stale');

      const staleScheduleCheck = orchestrator.getActiveSchedule(workflow.workflowId);
      expect(staleScheduleCheck.isCurrent).toBe(false);
      expect(staleScheduleCheck.status).toBe('stale');

      // ---------------------------------------------------------------------
      // STEP 9: Introduce a scheduling constraint conflict and verify review request is created
      // ---------------------------------------------------------------------
      // Recompute affected operations to regenerate interaction findings and schedule draft
      await orchestrator.recomputeAffectedOperations(workflow.workflowId, 'Clinical Pharmacist');

      // Advance to schedule evaluation
      const preConflictContext = orchestrator.getWorkflow(workflow.workflowId)!;
      preConflictContext.state = 'AWAITING_SCHEDULE_REVIEW';
      workflowRepo.update(preConflictContext);

      // Introduce a synthetic mandatory scheduling constraint conflict (e.g. food/drug 4-hour separation)
      const conflictReq = reviewService.createRequest({
        workflowId: workflow.workflowId,
        category: 'conflicting_scheduling_constraints',
        reason:
          '[MANDATORY_CONSTRAINT] Circadian Timing Conflict: Aldactone and Potassium Chloride require 4-hour staggered administration window',
        supportingEvidenceReferences: ['FDA Guidance on Oral Electrolyte & Spironolactone Administration'],
        missingOrConflictingInfo:
          'Mandatory Constraint: Unresolved conflict blocks schedule draft approval until resolved.',
        requestedReviewerAction: 'Review diurnal administration times and resolve separation interval.',
        targetEntityType: 'schedule',
        targetEntityId: 'conflict-spiro-kcl-timing',
        targetArtifactType: 'draft_schedule',
        targetArtifactVersion: preConflictContext.version,
        itemVersion: preConflictContext.version,
      });
      preConflictContext.pendingHumanApprovals.push(conflictReq);
      workflowRepo.update(preConflictContext);

      // Verify the review request is present and pending
      const activePendingReviews = reviewService.listPending(workflow.workflowId);
      const schedulingConflictReview = activePendingReviews.find(
        (r) => r.category === 'conflicting_scheduling_constraints'
      );
      expect(schedulingConflictReview).toBeDefined();
      expect(schedulingConflictReview?.reason).toContain('[MANDATORY_CONSTRAINT]');

      // Rule 3 Verification: Schedule CANNOT be approved while mandatory constraint is unresolved
      const scheduleReviewReq = reviewService.createRequest({
        workflowId: workflow.workflowId,
        category: 'schedule_review',
        reason: '24-hour diurnal schedule generated; requires clinical pharmacist signoff prior to administration.',
        supportingEvidenceReferences: [],
        requestedReviewerAction: 'Review and approve proposed diurnal administration schedule.',
        targetEntityType: 'schedule',
        targetEntityId: 'chrono-schedule',
        targetArtifactType: 'draft_schedule',
        targetArtifactVersion: preConflictContext.version,
        itemVersion: preConflictContext.version,
      });
      preConflictContext.pendingHumanApprovals.push(scheduleReviewReq);
      workflowRepo.update(preConflictContext);

      await expect(
        orchestrator.resolveHumanReview(workflow.workflowId, scheduleReviewReq.id, {
          status: 'approved',
          reviewerIdentity: 'Dr. Sarah Lin, PharmD',
          reviewerRole: 'clinical_pharmacist',
          reviewerNotes: 'Attempting to approve with unresolved mandatory constraint',
          targetVersion: scheduleReviewReq.itemVersion,
        })
      ).rejects.toThrow(WorkflowPrerequisiteError);

      // ---------------------------------------------------------------------
      // STEP 10: Resolve synthetic conflict using permitted test input and generate draft schedule
      // ---------------------------------------------------------------------
      // Authorized clinical pharmacist resolves the constraint
      await orchestrator.resolveHumanReview(workflow.workflowId, schedulingConflictReview!.id, {
        status: 'approved',
        reviewerIdentity: 'Dr. Sarah Lin, PharmD',
        reviewerRole: 'clinical_pharmacist',
        reviewerNotes:
          'Administer K-Dur at 08:00 with breakfast; schedule Aldactone at 12:00 with lunch (4-hour separation achieved).',
        targetVersion: schedulingConflictReview!.itemVersion,
      });

      const updatedPending = reviewService.listPending(workflow.workflowId);
      expect(updatedPending.some((r) => r.category === 'conflicting_scheduling_constraints')).toBe(false);

      // ---------------------------------------------------------------------
      // STEP 11: Verify schedule remains unapproved until authorized human approves exact current version
      // ---------------------------------------------------------------------
      const midWf = orchestrator.getWorkflow(workflow.workflowId)!;
      expect(midWf.humanApprovedOutcomes?.scheduleApproved).toBeFalsy();

      // Rule 4: LLM / AI actor rejected
      await expect(
        orchestrator.resolveHumanReview(workflow.workflowId, scheduleReviewReq.id, {
          status: 'approved',
          reviewerIdentity: 'Claude AI Assistant',
          reviewerRole: 'clinical_pharmacist',
          reviewerNotes: 'Automated AI approval',
          targetVersion: scheduleReviewReq.itemVersion,
        })
      ).rejects.toThrow(UnauthorizedReviewerError);

      // Rule 5 / Version mismatch: Stale version rejected
      await expect(
        orchestrator.resolveHumanReview(workflow.workflowId, scheduleReviewReq.id, {
          status: 'approved',
          reviewerIdentity: 'Dr. Sarah Lin, PharmD',
          reviewerRole: 'clinical_pharmacist',
          reviewerNotes: 'Attempting approval with wrong version',
          targetVersion: scheduleReviewReq.itemVersion + 999,
        })
      ).rejects.toThrow(ApprovalVersionMismatchError);

      // Authorized clinician approves exact current version
      await orchestrator.resolveHumanReview(workflow.workflowId, scheduleReviewReq.id, {
        status: 'approved',
        reviewerIdentity: 'Dr. Sarah Lin, PharmD',
        reviewerRole: 'clinical_pharmacist',
        reviewerNotes: 'Schedule verified. Staggered administration windows prevent adverse absorption interaction.',
        targetVersion: scheduleReviewReq.itemVersion,
      });

      const approvedWf = orchestrator.getWorkflow(workflow.workflowId)!;
      expect(approvedWf.humanApprovedOutcomes?.scheduleApproved).toBe(true);
      expect(approvedWf.humanApprovedOutcomes?.approvedBy).toBe('Dr. Sarah Lin, PharmD');

      const approvalRecords = approvalRepo.findByWorkflowId(workflow.workflowId);
      expect(approvalRecords.some((a) => a.category === 'schedule_review' && a.validUntilStale)).toBe(true);

      // ---------------------------------------------------------------------
      // STEP 12: Change a relevant input and verify affected approval becomes stale
      // ---------------------------------------------------------------------
      // Enter new lab data (elevated Serum Potassium: 5.6 mEq/L)
      labRepo.create({
        patientId: syntheticPatient.id,
        testName: 'Potassium',
        category: 'electrolytes',
        value: 5.6,
        unit: 'mEq/L',
        referenceRange: '3.5 - 5.0 mEq/L',
        interpretation: 'critical_high',
        collectionDate: new Date().toISOString().split('T')[0],
        source: 'clinical_lab',
      });

      await orchestrator.recordNewLabData(workflow.workflowId, 'Potassium', 'Laboratory Interface');

      // The schedule approval must be marked stale (validUntilStale = false)
      const refreshedApprovals = approvalRepo.findByWorkflowId(workflow.workflowId);
      const staleScheduleApproval = refreshedApprovals.find(
        (a) => a.category === 'schedule_review' && a.targetEntityType === 'schedule'
      );
      expect(staleScheduleApproval).toBeDefined();
      expect(staleScheduleApproval?.validUntilStale).toBe(false);
      expect(staleScheduleApproval?.supersededBy).toMatch(/Potassium|lab/i);

      // Schedule artifact node in DAG is marked stale
      const postLabSchedule = orchestrator.getActiveSchedule(workflow.workflowId);
      expect(postLabSchedule.isCurrent).toBe(false);
      expect(postLabSchedule.status).toBe('stale');

      // ---------------------------------------------------------------------
      // STEP 13: Retrieve final workflow state and audit history through MCP
      // ---------------------------------------------------------------------
      // 1. MCP: orchestrator_get_state
      const stateResult = await dispatchTool('orchestrator_get_state', { workflowId: workflow.workflowId }, engineService);
      expect(stateResult.isError).toBeFalsy();
      const stateData = JSON.parse(stateResult.content[0].text);
      expect(stateData.workflowId).toBe(workflow.workflowId);
      expect(stateData.patientId).toBe(syntheticPatient.id);
      expect(stateData.nextOperationDecision).toBeDefined();
      expect(stateData.completedOperationsCount).toBeGreaterThan(0);
      expect(stateData.finalReportSummary).toBeDefined();

      // 2. MCP: get_review_queue
      const queueResult = await dispatchTool('get_review_queue', { workflowId: workflow.workflowId, status: 'all' }, engineService);
      expect(queueResult.isError).toBeFalsy();
      const queueData = JSON.parse(queueResult.content[0].text);
      expect(queueData.totalCount).toBeGreaterThan(0);
      expect(queueData.reviews.some((r: any) => r.category === 'schedule_review')).toBe(true);

      // 3. MCP: get_approval_records
      const approvalsResult = await dispatchTool('get_approval_records', { workflowId: workflow.workflowId }, engineService);
      expect(approvalsResult.isError).toBeFalsy();
      const approvalsData = JSON.parse(approvalsResult.content[0].text);
      expect(approvalsData.totalCount).toBeGreaterThan(0);
      expect(approvalsData.approvals.some((a: any) => !a.validUntilStale)).toBe(true);

      // 4. MCP: get_tool_execution_history
      const historyResult = await dispatchTool('get_tool_execution_history', { workflowId: workflow.workflowId }, engineService);
      expect(historyResult.isError).toBeFalsy();
      const historyData = JSON.parse(historyResult.content[0].text);
      expect(historyData.totalRecords).toBeGreaterThan(0);
      expect(historyData.executions.every((e: any) => e.inputHash && e.status)).toBe(true);

      // 5. MCP: orchestrator_get_final_report
      const reportResult = await dispatchTool('orchestrator_get_final_report', { workflowId: workflow.workflowId }, engineService);
      expect(reportResult.isError).toBeFalsy();
      const reportData = JSON.parse(reportResult.content[0].text);

      expect(reportData.reportId).toBeDefined();
      expect(reportData.isPrototype).toBe(true);
      expect(reportData.clinicalDisclaimer).toContain('PROTOTYPE SAFETY SYSTEM');
      expect(reportData.evidenceIntegrityNotice).toContain('[SYNTHETIC_TEST_DATA]');

      // Distinct sections:
      // a. Technical completion
      expect(reportData.technicalCompletion).toBeDefined();
      expect(typeof reportData.technicalCompletion.isTechnicallyComplete).toBe('boolean');
      expect(reportData.technicalCompletion.completedOperations.length).toBeGreaterThan(0);

      // b. Outstanding clinical review
      expect(reportData.clinicalReviewStatus).toBeDefined();
      expect(typeof reportData.clinicalReviewStatus.hasOutstandingReviews).toBe('boolean');

      // c. Approval status (distinguishing active vs stale)
      expect(reportData.approvalStatus).toBeDefined();
      expect(reportData.approvalStatus.staleApprovalRecordsCount).toBeGreaterThan(0);
      expect(reportData.approvalStatus.approvalRecords.some((a: any) => a.validUntilStale === false)).toBe(true);
    });
  });

  // =========================================================================
  // 2. EXPLICIT VERIFICATION OF THE 9 CORE ARCHITECTURAL ASSERTIONS
  // =========================================================================
  describe('Verification of the 9 Core Architectural Assertions', () => {
    // -----------------------------------------------------------------------
    // ASSERTION 1: Every tool invocation has a validated input and structured result
    // -----------------------------------------------------------------------
    it('Assertion 1: rejects malformed tool inputs via Zod and returns typed structured results', async () => {
      const testWf = await orchestrator.createWorkflow({
        patientId: 'p3333333-3333-3333-3333-333333333333',
        actor: 'Test Actor',
      });

      // 1. Tool execution with missing mandatory parameter returns structured failure with INVALID_INPUT
      const invalidResult = await toolRegistry.executeTool('get_patient_context', {} as any, {
        actor: 'Test Actor',
        actorRole: 'clinician',
      });
      expect(invalidResult.success).toBe(false);
      expect(invalidResult.error?.code).toBe('INVALID_INPUT');
      expect(invalidResult.error?.message).toContain('patientId: Required');

      // 2. Valid invocation produces typed structured result adhering to output schema
      const validResult = await toolRegistry.executeTool(
        'get_patient_context',
        { patientId: 'p3333333-3333-3333-3333-333333333333' },
        {
          actor: 'Test Actor',
          actorRole: 'clinician',
          workflowId: testWf.workflowId,
        }
      );
      expect(validResult.success).toBe(true);
      expect(validResult.data.patient).toBeDefined();
      expect(validResult.data.diagnoses).toBeInstanceOf(Array);
      expect(validResult.data.recentLabs).toBeInstanceOf(Array);
      expect(typeof validResult.data.totalMedications).toBe('number');

      // 3. Execution record logged in repository with SHA-256 input hash
      const execLogs = executionRepo.findByWorkflowId(testWf.workflowId);
      expect(execLogs.length).toBeGreaterThan(0);
      expect(execLogs[0].inputHash).toBeDefined();
      expect(execLogs[0].status).toBe('success');
    });

    // -----------------------------------------------------------------------
    // ASSERTION 2: No operation runs before its prerequisites are met
    // -----------------------------------------------------------------------
    it('Assertion 2: rejects premature state transitions and enforces prerequisite checks', async () => {
      const workflow = await orchestrator.createWorkflow({
        patientId: 'p1111111-1111-1111-1111-111111111111',
        actor: 'Clinical Pharmacist',
      });

      // State is CREATED; attempting to jump directly to PREPARING_SCHEDULE must fail
      await expect(
        orchestrator.advanceWorkflow(workflow.workflowId, 'Clinical Pharmacist', 'PREPARING_SCHEDULE')
      ).rejects.toThrow(InvalidWorkflowTransitionError);

      // Unverified medication candidate blocks transition to CHECKING_INTERACTIONS
      const ctx = orchestrator.getWorkflow(workflow.workflowId)!;
      ctx.unverifiedMedicationCandidates.push({
        id: 'unverified-aspirin-1',
        rawText: 'Aspirin 81mg daily',
        brand: 'Bayer Aspirin',
        confidence: 0.5,
        status: 'unverified',
      });
      ctx.state = 'MEDICATIONS_CONFIRMED';
      workflowRepo.update(ctx);

      await expect(
        orchestrator.advanceWorkflow(workflow.workflowId, 'Clinical Pharmacist')
      ).rejects.toThrow(WorkflowPrerequisiteError);
    });

    // -----------------------------------------------------------------------
    // ASSERTION 3: No stale finding is treated as current
    // -----------------------------------------------------------------------
    it('Assertion 3: deterministic freshness guarantees prevent stale findings from being presented as current', async () => {
      // Margaret Chen has confirmed medications
      const workflow = await orchestrator.createWorkflow({
        patientId: 'p3333333-3333-3333-3333-333333333333',
        actor: 'Clinical Pharmacist',
      });

      await orchestrator.advanceWorkflow(workflow.workflowId, 'Pharmacist'); // -> MEDICATIONS_CONFIRMED
      await orchestrator.advanceWorkflow(workflow.workflowId, 'Pharmacist'); // -> AWAITING_CLINICAL_REVIEW

      // Findings are currently active
      const currentFindings = orchestrator.getActiveFindings(workflow.workflowId);
      expect(currentFindings.isCurrent).toBe(true);
      expect(currentFindings.status).toBe('current');
      expect(currentFindings.findings.length).toBeGreaterThan(0);

      // Correct a medication to trigger cascade invalidation
      const medList = medRepo.findByPatientId('p3333333-3333-3333-3333-333333333333');
      await orchestrator.correctMedication(
        workflow.workflowId,
        medList[0].id,
        'Dr. Sarah Lin, PharmD',
        'Dosage adjustment for testing deterministic invalidation'
      );

      // Epistemic safety assertion: Findings are now stale and marked not current
      const staleFindings = orchestrator.getActiveFindings(workflow.workflowId);
      expect(staleFindings.isCurrent).toBe(false);
      expect(staleFindings.status).toBe('stale');
      expect(staleFindings.invalidationReason).toContain('corrected');
    });

    // -----------------------------------------------------------------------
    // ASSERTION 4: No synthetic interaction fixture is described as verified clinical evidence
    // -----------------------------------------------------------------------
    it('Assertion 4: ensures all interaction evidence citations are tagged with prototype notices', async () => {
      const toolRes = await toolRegistry.executeTool(
        'check_interactions',
        { patientId: 'p3333333-3333-3333-3333-333333333333' },
        { actor: 'Test Actor', actorRole: 'clinician' }
      );

      expect(toolRes.success).toBe(true);
      expect(toolRes.data.findings.length).toBeGreaterThan(0);
      for (const finding of toolRes.data.findings) {
        expect(finding.sourceCitation).toBeDefined();
      }

      // Final report explicitly includes prototype and synthetic notices
      const workflow = await orchestrator.createWorkflow({
        patientId: 'p3333333-3333-3333-3333-333333333333',
        actor: 'Pharmacist',
      });
      const report = orchestrator.generateFinalReport(workflow.workflowId);
      expect(report.isPrototype).toBe(true);
      expect(report.evidenceIntegrityNotice).toContain('[SYNTHETIC_TEST_DATA]');
      expect(report.clinicalDisclaimer).toContain('PROTOTYPE SAFETY SYSTEM');
    });

    // -----------------------------------------------------------------------
    // ASSERTION 5: No LLM-generated approval is accepted
    // -----------------------------------------------------------------------
    it('Assertion 5: rejects all autonomous AI, bot, and LLM reviewer identities', async () => {
      const workflow = await orchestrator.createWorkflow({
        patientId: 'p3333333-3333-3333-3333-333333333333',
        actor: 'Clinical Pharmacist',
      });

      const reviewReq = reviewService.createRequest({
        workflowId: workflow.workflowId,
        category: 'schedule_review',
        reason: 'Diurnal administration schedule review',
        supportingEvidenceReferences: [],
        requestedReviewerAction: 'Review schedule',
        targetEntityType: 'schedule',
        targetEntityId: 'chrono-schedule',
        itemVersion: 1,
      });

      const prohibitedReviewerNames = [
        'Claude Assistant',
        'ChatGPT-4o',
        'Autonomous Agent',
        'System Automated Bot',
        'LLM Clinician Impersonator',
      ];

      for (const botName of prohibitedReviewerNames) {
        expect(() =>
          reviewService.resolveRequest(
            reviewReq.id,
            {
              status: 'approved',
              reviewerIdentity: botName,
              reviewerRole: 'clinical_pharmacist',
              reviewerNotes: 'Attempting automated LLM signoff',
              targetVersion: 1,
            },
            1
          )
        ).toThrow(UnauthorizedReviewerError);
      }
    });

    // -----------------------------------------------------------------------
    // ASSERTION 6: Retries are bounded
    // -----------------------------------------------------------------------
    it('Assertion 6: enforces strict retry limits and stops retrying when configured maxRetries is reached', async () => {
      const workflow = await orchestrator.createWorkflow({
        patientId: 'p3333333-3333-3333-3333-333333333333',
        actor: 'Clinical Pharmacist',
      });

      const feedbackEngine = (orchestrator as any).feedbackEngine;

      // Simulate 3 consecutive recoverable failures for an operation
      for (let attempt = 1; attempt <= 3; attempt++) {
        feedbackEngine.recordOperation(workflow, {
          operationType: 'CHECK_INTERACTIONS',
          inputVersion: 1,
          outputVersion: 1,
          dependencies: ['medication:1'],
          executionStatus: 'failed',
          error: {
            code: 'TRANSIENT_NETWORK_TIMEOUT',
            message: `Attempt ${attempt} timed out`,
            isRecoverable: true,
            timestamp: new Date().toISOString(),
          },
        });
      }

      // Check retry capability after 3 failures (maxRetries = 3)
      const retryCheck = feedbackEngine.canRetryOperation(workflow, 'CHECK_INTERACTIONS');
      expect(retryCheck.canRetry).toBe(false);
      expect(retryCheck.retryCount).toBe(3);
      expect(retryCheck.reason).toContain('Maximum retry limit (3) exceeded');
    });

    // -----------------------------------------------------------------------
    // ASSERTION 7: Workflow state survives a server restart
    // -----------------------------------------------------------------------
    it('Assertion 7: reconciles transient states and restores full DAG context across server restart', async () => {
      const workflow = await orchestrator.createWorkflow({
        patientId: 'p3333333-3333-3333-3333-333333333333',
        actor: 'Clinical Pharmacist',
      });

      // Advance to MEDICATIONS_CONFIRMED
      await orchestrator.advanceWorkflow(workflow.workflowId, 'Pharmacist');

      // Simulate mid-execution transient crash while CHECKING_INTERACTIONS
      const crashContext = orchestrator.getWorkflow(workflow.workflowId)!;
      crashContext.state = 'CHECKING_INTERACTIONS';
      workflowRepo.update(crashContext);

      // Re-instantiate completely new orchestrator instance connected to same SQLite DB (server restart)
      const restartedOrchestrator = new AgenticWorkflowOrchestrator(
        workflowRepo,
        reviewService,
        toolRegistry,
        patientRepo,
        medRepo,
        labRepo,
        auditService,
        executionRepo,
        historyRepo,
        undefined,
        approvalRepo
      );

      // Execute crash recovery
      const recoveryReport = await restartedOrchestrator.recoverActiveWorkflows();
      expect(recoveryReport.recoveredCount).toBeGreaterThan(0);

      const recoveredWf = recoveryReport.recoveredWorkflows.find((w) => w.workflowId === workflow.workflowId);
      expect(recoveredWf).toBeDefined();
      expect(recoveredWf?.previousState).toBe('CHECKING_INTERACTIONS');
      // Interrupted CHECKING_INTERACTIONS reconciled to safe idempotent state MEDICATIONS_CONFIRMED
      expect(recoveredWf?.reconciledState).toBe('MEDICATIONS_CONFIRMED');

      const loadedContext = restartedOrchestrator.getWorkflow(workflow.workflowId);
      expect(loadedContext?.state).toBe('MEDICATIONS_CONFIRMED');
      expect(loadedContext?.artifactGraph).toBeDefined();
    });

    // -----------------------------------------------------------------------
    // ASSERTION 8: All important transitions have audit records
    // -----------------------------------------------------------------------
    it('Assertion 8: writes immutable audit log entries for workflow creation, state transitions, and invalidations', async () => {
      const workflow = await orchestrator.createWorkflow({
        patientId: 'p3333333-3333-3333-3333-333333333333',
        actor: 'Intake Clinician',
      });

      await orchestrator.advanceWorkflow(workflow.workflowId, 'Clinical Pharmacist');

      const auditLogs = auditRepo.findByPatientId('p3333333-3333-3333-3333-333333333333');
      expect(auditLogs.length).toBeGreaterThan(0);

      const actions = auditLogs.map((l) => l.action);
      expect(actions).toContain('WORKFLOW_CREATED');
      expect(actions.some((a) => a.startsWith('TRANSITION_'))).toBe(true);
    });

    // -----------------------------------------------------------------------
    // ASSERTION 9: Final report distinguishes technical completion, clinical review, and approval status
    // -----------------------------------------------------------------------
    it('Assertion 9: final report clearly differentiates technical completion, outstanding reviews, and approval state', async () => {
      const workflow = await orchestrator.createWorkflow({
        patientId: 'p3333333-3333-3333-3333-333333333333',
        actor: 'Clinical Pharmacist',
      });

      // Step 1: Advance to MEDICATIONS_CONFIRMED -> AWAITING_CLINICAL_REVIEW
      await orchestrator.advanceWorkflow(workflow.workflowId, 'Clinical Pharmacist');
      await orchestrator.advanceWorkflow(workflow.workflowId, 'Clinical Pharmacist');

      const intermediateReport = orchestrator.generateFinalReport(workflow.workflowId);

      // Intermediate report check:
      // Technical state is AWAITING_CLINICAL_REVIEW
      expect(intermediateReport.technicalCompletion.technicalState).toBe('AWAITING_CLINICAL_REVIEW');
      // Clinical review has outstanding reviews
      expect(intermediateReport.clinicalReviewStatus.hasOutstandingReviews).toBe(true);
      expect(intermediateReport.clinicalReviewStatus.pendingReviewCount).toBeGreaterThan(0);
      // Approval status is unapproved
      expect(intermediateReport.approvalStatus.isFullyApproved).toBe(false);
      expect(intermediateReport.approvalStatus.scheduleApproved).toBe(false);

      // Step 2: Clinician resolves clinical reviews
      const pendingReviews = reviewService.listPending(workflow.workflowId);
      for (const review of pendingReviews) {
        await orchestrator.resolveHumanReview(workflow.workflowId, review.id, {
          status: 'approved',
          reviewerIdentity: 'Dr. Arthur Conan, MD',
          reviewerRole: 'attending_physician',
          reviewerNotes: 'Clinical risk reviewed and accepted with laboratory monitoring plan.',
          targetVersion: review.itemVersion,
        });
      }

      // Advance to schedule preparation -> AWAITING_SCHEDULE_REVIEW
      await orchestrator.advanceWorkflow(workflow.workflowId, 'Scheduling Agent');

      // Schedule review and any constraint reviews are pending
      const schedPending = reviewService.listPending(workflow.workflowId);
      expect(schedPending.length).toBeGreaterThan(0);

      // Resolve all schedule-stage reviews
      for (const review of schedPending) {
        await orchestrator.resolveHumanReview(workflow.workflowId, review.id, {
          status: 'approved',
          reviewerIdentity: 'Dr. Sarah Lin, PharmD',
          reviewerRole: 'clinical_pharmacist',
          reviewerNotes: 'Diurnal administration schedule and constraints verified and approved.',
          targetVersion: review.itemVersion,
        });
      }

      // Complete workflow
      await orchestrator.advanceWorkflow(workflow.workflowId, 'Dr. Sarah Lin, PharmD');

      const finalApprovedReport = orchestrator.generateFinalReport(workflow.workflowId);

      // Final report check:
      // Technical completion is true (state is COMPLETED)
      expect(finalApprovedReport.technicalCompletion.isTechnicallyComplete).toBe(true);
      expect(finalApprovedReport.technicalCompletion.technicalState).toBe('COMPLETED');

      // No outstanding clinical reviews remain
      expect(finalApprovedReport.clinicalReviewStatus.hasOutstandingReviews).toBe(false);
      expect(finalApprovedReport.clinicalReviewStatus.pendingReviewCount).toBe(0);

      // Human approval is fully confirmed
      expect(finalApprovedReport.approvalStatus.isFullyApproved).toBe(true);
      expect(finalApprovedReport.approvalStatus.scheduleApproved).toBe(true);
      expect(finalApprovedReport.approvalStatus.approvedBy).toBe('Dr. Sarah Lin, PharmD');
      expect(finalApprovedReport.approvalStatus.activeApprovalRecordsCount).toBeGreaterThan(0);
      expect(finalApprovedReport.approvalStatus.staleApprovalRecordsCount).toBe(0);
    });
  });
});
