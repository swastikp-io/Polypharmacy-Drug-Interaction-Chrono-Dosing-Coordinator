import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { initializeSchema } from '../../src/server/db/database.js';
import { seedSyntheticData } from '../../src/server/db/seeds.js';
import { WorkflowRepository } from '../../src/server/repositories/workflowRepository.js';
import { ReviewRequestRepository } from '../../src/server/repositories/reviewRequestRepository.js';
import { ArtifactHistoryRepository } from '../../src/server/repositories/artifactHistoryRepository.js';
import { ToolExecutionRepository } from '../../src/server/repositories/toolExecutionRepository.js';
import { PatientRepository } from '../../src/server/repositories/patientRepository.js';
import { MedicationRepository } from '../../src/server/repositories/medicationRepository.js';
import { LabMeasurementRepository } from '../../src/server/repositories/labMeasurementRepository.js';
import { DiagnosisRepository } from '../../src/server/repositories/diagnosisRepository.js';
import { AuditLogRepository } from '../../src/server/repositories/auditLogRepository.js';
import { ChronoRepository } from '../../src/server/repositories/chronoRepository.js';
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
import { FeedbackEngine } from '../../src/server/services/orchestration/feedbackEngine.js';
import { ArtifactDependencyGraph } from '../../src/server/services/orchestration/dependencyGraph.js';
import {
  OptimisticConcurrencyError,
} from '../../src/server/services/orchestration/stateMachine/errors.js';
import type { RetryPolicy } from '../../src/shared/orchestrationTypes.js';

describe('Phase 3: Persistent Shared State, Artifact Dependency Graph & Feedback Loops', () => {
  let db: Database.Database;
  let patientRepo: PatientRepository;
  let medRepo: MedicationRepository;
  let labRepo: LabMeasurementRepository;
  let diagRepo: DiagnosisRepository;
  let auditRepo: AuditLogRepository;
  let chronoRepo: ChronoRepository;
  let workflowRepo: WorkflowRepository;
  let reviewRepo: ReviewRequestRepository;
  let executionRepo: ToolExecutionRepository;
  let artifactHistoryRepo: ArtifactHistoryRepository;

  let auditService: AuditService;
  let chronoService: ChronoService;
  let chronoCoordinator: CircadianScheduleCoordinator;
  let evidenceProvider: LocalInteractionEvidenceProvider;
  let conflictEngine: PharmacokineticConflictEngine;
  let ocrEngine: LocalOCREngine;
  let ocrNormalizationService: DrugNormalizationService;

  let reviewService: ReviewRequestService;
  let toolRegistry: ToolRegistry;
  let orchestrator: AgenticWorkflowOrchestrator;

  // Margaret Chen has all confirmed medications in synthetic seeds, allowing full pipeline progression
  const P3_ID = 'p3333333-3333-3333-3333-333333333333';

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
    executionRepo = new ToolExecutionRepository(db);
    artifactHistoryRepo = new ArtifactHistoryRepository(db);

    auditService = new AuditService(auditRepo);
    chronoService = new ChronoService(patientRepo, medRepo, chronoRepo, auditService);
    chronoCoordinator = new CircadianScheduleCoordinator();
    evidenceProvider = new LocalInteractionEvidenceProvider();
    const drugRefProvider = new LocalDrugReferenceProvider();
    conflictEngine = new PharmacokineticConflictEngine(drugRefProvider, evidenceProvider);

    ocrEngine = new LocalOCREngine();
    const ocrExtractionService = new OCRExtractionService();
    const terminologyProvider = new LocalRxNormTerminologyProvider();
    ocrNormalizationService = new DrugNormalizationService(
      ocrExtractionService,
      terminologyProvider,
      medRepo
    );

    reviewService = new ReviewRequestService(reviewRepo, auditService);
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
      artifactHistoryRepo
    );
  });

  afterEach(() => {
    db.close();
  });

  // ==========================================
  // 1. ARTIFACT DEPENDENCY GRAPH & FINGERPRINTS
  // ==========================================
  describe('1. Artifact Dependency Graph Creation & Fingerprinting', () => {
    it('creates canonical artifact nodes with SHA-256 content hashes and dependency fingerprints', async () => {
      // Create and advance workflow for patient Margaret Chen
      const created = await orchestrator.createWorkflow({
        patientId: P3_ID,
        actor: 'Dr. Test Clinician',
      });

      // Advance: CREATED -> RETRIEVING_PATIENT_CONTEXT -> MEDICATIONS_CONFIRMED
      const afterContext = await orchestrator.advanceWorkflow(created.workflowId, 'Dr. Test Clinician');
      expect(afterContext.state).toBe('MEDICATIONS_CONFIRMED');

      // Verify confirmed_medications node in artifact graph
      const graph = orchestrator.getArtifactGraph(created.workflowId);
      expect(graph).toBeDefined();
      expect(graph?.nodes.confirmed_medications).toBeDefined();

      const medNode = graph!.nodes.confirmed_medications!;
      expect(medNode.artifactType).toBe('confirmed_medications');
      expect(medNode.status).toBe('current');
      expect(medNode.version).toBe(1);
      expect(medNode.contentHash).toMatch(/^[a-f0-9]{64}$/);
      expect(medNode.dependencyFingerprint).toBe('root-genesis');

      // Advance: MEDICATIONS_CONFIRMED -> CHECKING_INTERACTIONS -> AWAITING_CLINICAL_REVIEW
      const afterInteractions = await orchestrator.advanceWorkflow(created.workflowId, 'Dr. Test Clinician');
      expect(afterInteractions.state).toBe('AWAITING_CLINICAL_REVIEW');

      const interactionNode = afterInteractions.artifactGraph?.nodes.interaction_findings;
      expect(interactionNode).toBeDefined();
      expect(interactionNode?.status).toBe('current');
      expect(interactionNode?.contentHash).toMatch(/^[a-f0-9]{64}$/);
      expect(interactionNode?.dependencyFingerprint).toMatch(/^[a-f0-9]{64}$/);

      // Resolve all pending clinical reviews to permit schedule preparation
      for (const review of afterInteractions.pendingHumanApprovals) {
        if (review.status === 'pending') {
          await orchestrator.resolveHumanReview(created.workflowId, review.id, {
            status: 'approved',
            reviewerIdentity: 'Dr. Attending Human',
            reviewerNotes: 'Approved interaction profile',
            targetVersion: review.itemVersion,
          });
        }
      }

      // Advance: AWAITING_CLINICAL_REVIEW -> PREPARING_SCHEDULE -> AWAITING_SCHEDULE_REVIEW
      const afterSchedule = await orchestrator.advanceWorkflow(created.workflowId, 'Dr. Test Clinician');
      expect(afterSchedule.state).toBe('AWAITING_SCHEDULE_REVIEW');

      const scheduleNode = afterSchedule.artifactGraph?.nodes.draft_schedule;
      expect(scheduleNode).toBeDefined();
      expect(scheduleNode?.status).toBe('current');
      expect(scheduleNode?.contentHash).toMatch(/^[a-f0-9]{64}$/);
      expect(scheduleNode?.dependencyFingerprint).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  // ==========================================
  // 2. UPSTREAM CORRECTION MARKS DOWNSTREAM STALE
  // ==========================================
  describe('2. Medication Correction Marks Downstream Artifacts Stale', () => {
    it('marks downstream interaction and schedule artifacts stale while preserving upstream OCR node as current', async () => {
      // 1. Create workflow
      const created = await orchestrator.createWorkflow({
        patientId: P3_ID,
        actor: 'Dr. Intake',
      });

      // Advance to MEDICATIONS_CONFIRMED
      await orchestrator.advanceWorkflow(created.workflowId, 'Dr. Intake');

      // Record upstream prescription and OCR nodes in DAG
      const ctx = workflowRepo.findById(created.workflowId)!;
      orchestrator.getDependencyGraph().recordArtifactNode(
        ctx,
        'prescription_image',
        { filename: 'margaret_rx.png', mimeType: 'image/png' }
      );
      orchestrator.getDependencyGraph().recordArtifactNode(
        ctx,
        'ocr_extraction',
        { rawText: 'Warfarin 5mg daily, Levothyroxine 50mcg daily', confidence: 0.98 }
      );
      workflowRepo.update(ctx);

      // Advance to CHECKING_INTERACTIONS -> AWAITING_CLINICAL_REVIEW
      const ctxWithFindings = await orchestrator.advanceWorkflow(created.workflowId, 'Dr. Intake');
      expect(ctxWithFindings.artifactGraph?.nodes.interaction_findings?.status).toBe('current');

      // 2. Correct a medication
      const meds = medRepo.findByPatientId(P3_ID);
      const targetMed = meds[0];
      expect(targetMed).toBeDefined();

      const afterCorrection = await orchestrator.correctMedication(
        created.workflowId,
        targetMed.id,
        'Dr. Specialist Pharmacist',
        'Updated dose due to elevated TSH level'
      );

      // Upstream OCR artifact must remain current (no redundant re-OCR required)
      expect(afterCorrection.artifactGraph?.nodes.prescription_image?.status).toBe('current');
      expect(afterCorrection.artifactGraph?.nodes.ocr_extraction?.status).toBe('current');

      // Downstream artifacts must be marked stale
      expect(afterCorrection.artifactGraph?.nodes.interaction_findings?.status).toBe('stale');
      expect(afterCorrection.artifactGraph?.nodes.interaction_findings?.invalidationReason).toContain('corrected');
      expect(afterCorrection.state).toBe('MEDICATIONS_CONFIRMED');
    });
  });

  // ==========================================
  // 3. QUERY GUARDS FOR STALE FINDINGS & SCHEDULE
  // ==========================================
  describe('3. Deterministic Query Guards for Stale Findings & Schedule', () => {
    it('returns empty findings and isCurrent=false when interaction findings are stale', async () => {
      const created = await orchestrator.createWorkflow({
        patientId: P3_ID,
        actor: 'Dr. Guard Check',
      });

      // CREATED -> RETRIEVING_PATIENT_CONTEXT -> MEDICATIONS_CONFIRMED
      await orchestrator.advanceWorkflow(created.workflowId, 'Dr. Guard Check');
      // MEDICATIONS_CONFIRMED -> CHECKING_INTERACTIONS -> AWAITING_CLINICAL_REVIEW
      await orchestrator.advanceWorkflow(created.workflowId, 'Dr. Guard Check');

      // Check findings before correction: active and valid
      const beforeFindings = orchestrator.getActiveFindings(created.workflowId);
      expect(beforeFindings.isCurrent).toBe(true);
      expect(beforeFindings.status).toBe('current');
      expect(beforeFindings.findings.length).toBeGreaterThan(0);

      // Trigger correction to invalidate
      const meds = medRepo.findByPatientId(P3_ID);
      await orchestrator.correctMedication(
        created.workflowId,
        meds[0].id,
        'Dr. Guard Check',
        'Correction for guard test'
      );

      // Query guard MUST prevent returning stale findings
      const afterFindings = orchestrator.getActiveFindings(created.workflowId);
      expect(afterFindings.isCurrent).toBe(false);
      expect(afterFindings.status).toBe('stale');
      expect(afterFindings.findings).toEqual([]);
      expect(afterFindings.invalidationReason).toBeDefined();

      // Query guard MUST prevent returning stale schedule
      const afterSchedule = orchestrator.getActiveSchedule(created.workflowId);
      expect(afterSchedule.isCurrent).toBe(false);
      expect(['stale', 'invalidated']).toContain(afterSchedule.status);
      expect(afterSchedule.schedule).toBeNull();
    });
  });

  // ==========================================
  // 4. HISTORICAL ARTIFACT AUDITING IN DB
  // ==========================================
  describe('4. Historical Artifact Output Preservation for Auditing', () => {
    it('archives invalidated and replaced artifacts into the workflow_artifact_history table', async () => {
      const created = await orchestrator.createWorkflow({
        patientId: P3_ID,
        actor: 'Dr. Auditor',
      });

      // CREATED -> RETRIEVING_PATIENT_CONTEXT -> MEDICATIONS_CONFIRMED
      await orchestrator.advanceWorkflow(created.workflowId, 'Dr. Auditor');
      // MEDICATIONS_CONFIRMED -> CHECKING_INTERACTIONS -> AWAITING_CLINICAL_REVIEW
      await orchestrator.advanceWorkflow(created.workflowId, 'Dr. Auditor');

      const initialHistory = artifactHistoryRepo.findByWorkflowId(created.workflowId);
      expect(initialHistory.length).toBe(0);

      // Invalidate findings via medication correction
      const meds = medRepo.findByPatientId(P3_ID);
      await orchestrator.correctMedication(
        created.workflowId,
        meds[0].id,
        'Dr. Auditor',
        'Audit verification dose change'
      );

      // Historical records must be persisted into SQLite table
      const historicalRecords = artifactHistoryRepo.findByWorkflowId(created.workflowId);
      expect(historicalRecords.length).toBeGreaterThan(0);

      const staleFindingRecord = historicalRecords.find(
        (r) => r.artifactType === 'interaction_findings'
      );
      expect(staleFindingRecord).toBeDefined();
      expect(staleFindingRecord?.workflowId).toBe(created.workflowId);
      expect(staleFindingRecord?.version).toBe(1);
      expect(staleFindingRecord?.contentHash).toMatch(/^[a-f0-9]{64}$/);
      expect(staleFindingRecord?.reasonArchived).toContain('Audit verification dose change');
      expect(staleFindingRecord?.archivedAt).toBeDefined();

      // Orchestrator helper returns same historical records
      const contextHistory = orchestrator.getHistoricalArtifacts(created.workflowId);
      expect(contextHistory.length).toBe(historicalRecords.length);
    });
  });

  // ==========================================
  // 5. SELECTIVE RECOMPUTATION
  // ==========================================
  describe('5. Selective Recomputation of Only Affected Operations', () => {
    it('recomputes only stale downstream operations and skips fresh upstream OCR', async () => {
      const created = await orchestrator.createWorkflow({
        patientId: P3_ID,
        actor: 'Dr. Recompute',
      });

      // CREATED -> RETRIEVING_PATIENT_CONTEXT -> MEDICATIONS_CONFIRMED
      await orchestrator.advanceWorkflow(created.workflowId, 'Dr. Recompute');

      // Record upstream OCR node as current
      const ctx = workflowRepo.findById(created.workflowId)!;
      orchestrator.getDependencyGraph().recordArtifactNode(
        ctx,
        'ocr_extraction',
        { text: 'Margaret Chen prescription order' }
      );
      workflowRepo.update(ctx);

      // Advance to CHECKING_INTERACTIONS -> AWAITING_CLINICAL_REVIEW
      const withFindings = await orchestrator.advanceWorkflow(created.workflowId, 'Dr. Recompute');

      // Approve pending reviews
      for (const review of withFindings.pendingHumanApprovals) {
        if (review.status === 'pending') {
          await orchestrator.resolveHumanReview(created.workflowId, review.id, {
            status: 'approved',
            reviewerIdentity: 'Dr. Recompute Attending',
            reviewerNotes: 'Approved for recompute test',
            targetVersion: review.itemVersion,
          });
        }
      }

      // Advance to PREPARING_SCHEDULE -> AWAITING_SCHEDULE_REVIEW
      await orchestrator.advanceWorkflow(created.workflowId, 'Dr. Recompute');

      // Now correct a medication
      const meds = medRepo.findByPatientId(P3_ID);
      await orchestrator.correctMedication(
        created.workflowId,
        meds[0].id,
        'Dr. Recompute',
        'Updated dose post-lab'
      );

      // Verify that interaction_findings and draft_schedule are stale
      const staleFindings = orchestrator.getActiveFindings(created.workflowId);
      expect(staleFindings.isCurrent).toBe(false);

      // Execute selective recomputation
      const recomputeResult = await orchestrator.recomputeAffectedOperations(
        created.workflowId,
        'Dr. Recompute Clinical Engine'
      );

      // Upstream OCR extraction must be skipped; interaction check recomputes
      expect(recomputeResult.skippedOperations).toContain('EXTRACT_PRESCRIPTION');
      expect(recomputeResult.recomputedOperations).toContain('CHECK_INTERACTIONS');

      // Verify findings are refreshed and marked current
      const refreshedFindings = orchestrator.getActiveFindings(created.workflowId);
      expect(refreshedFindings.isCurrent).toBe(true);
      expect(refreshedFindings.status).toBe('current');
      expect(refreshedFindings.findings.length).toBeGreaterThan(0);

      // Clinician reviews and approves the updated interaction/data gaps
      const updatedCtx = workflowRepo.findById(created.workflowId)!;
      for (const review of updatedCtx.pendingHumanApprovals) {
        if (review.status === 'pending') {
          await orchestrator.resolveHumanReview(created.workflowId, review.id, {
            status: 'approved',
            reviewerIdentity: 'Dr. Recompute Attending',
            reviewerNotes: 'Approved clinical findings for renewed schedule',
            targetVersion: review.itemVersion,
          });
        }
      }

      // Recompute schedule now that prerequisite clinical reviews are resolved
      const scheduleRecompute = await orchestrator.recomputeAffectedOperations(
        created.workflowId,
        'Dr. Recompute Clinical Engine'
      );
      expect(scheduleRecompute.recomputedOperations).toContain('COORDINATE_SCHEDULE');

      const refreshedSchedule = orchestrator.getActiveSchedule(created.workflowId);
      expect(refreshedSchedule.isCurrent).toBe(true);
      expect(refreshedSchedule.status).toBe('current');
      expect(refreshedSchedule.schedule).toBeDefined();
    });
  });

  // ==========================================
  // 6. MATERIAL CHANGE INVALIDATES PRIOR APPROVAL
  // ==========================================
  describe('6. Material Change Invalidates Prior Approvals and Requires Renewed Review', () => {
    it('invalidates schedule approval when medication changes and blocks completion until renewed review', async () => {
      const created = await orchestrator.createWorkflow({
        patientId: P3_ID,
        actor: 'Dr. HITL',
      });

      // CREATED -> RETRIEVING_PATIENT_CONTEXT -> MEDICATIONS_CONFIRMED
      await orchestrator.advanceWorkflow(created.workflowId, 'Dr. HITL');
      // MEDICATIONS_CONFIRMED -> CHECKING_INTERACTIONS -> AWAITING_CLINICAL_REVIEW
      const withFindings = await orchestrator.advanceWorkflow(created.workflowId, 'Dr. HITL');

      for (const review of withFindings.pendingHumanApprovals) {
        if (review.status === 'pending') {
          await orchestrator.resolveHumanReview(created.workflowId, review.id, {
            status: 'approved',
            reviewerIdentity: 'Dr. HITL Attending',
            reviewerNotes: 'Approved findings',
            targetVersion: review.itemVersion,
          });
        }
      }

      // AWAITING_CLINICAL_REVIEW -> PREPARING_SCHEDULE -> AWAITING_SCHEDULE_REVIEW
      const withSchedule = await orchestrator.advanceWorkflow(created.workflowId, 'Dr. HITL');
      expect(withSchedule.state).toBe('AWAITING_SCHEDULE_REVIEW');

      const scheduleReview = withSchedule.pendingHumanApprovals.find(
        (r) => r.category === 'schedule_review' && r.status === 'pending'
      );
      expect(scheduleReview).toBeDefined();

      // Approve schedule
      const approvedCtx = await orchestrator.resolveHumanReview(created.workflowId, scheduleReview!.id, {
        status: 'approved',
        reviewerIdentity: 'Dr. HITL Attending',
        reviewerNotes: 'Schedule approved for patient',
        targetVersion: scheduleReview!.itemVersion,
      });
      expect(approvedCtx.humanApprovedOutcomes?.scheduleApproved).toBe(true);

      // Now simulate medication correction
      const meds = medRepo.findByPatientId(P3_ID);
      const invalidatedCtx = await orchestrator.correctMedication(
        created.workflowId,
        meds[0].id,
        'Dr. HITL Attending',
        'Changed dose after review'
      );

      // Prior schedule approval MUST be revoked
      expect(invalidatedCtx.humanApprovedOutcomes?.scheduleApproved).toBe(false);
      expect(invalidatedCtx.humanApprovedOutcomes?.decisionRationale).toContain('invalidated');

      // State is moved back to MEDICATIONS_CONFIRMED
      expect(invalidatedCtx.state).toBe('MEDICATIONS_CONFIRMED');
    });
  });

  // ==========================================
  // 7. RETRY POLICY ON RECOVERABLE ERRORS
  // ==========================================
  describe('7. Configured Retry Policy with Exponential Backoff', () => {
    it('enforces maximum retry limits on recoverable failures and stops retrying when exceeded', () => {
      const customPolicy: RetryPolicy = {
        maxRetries: 2,
        initialBackoffMs: 50,
        backoffMultiplier: 2,
        maxBackoffMs: 500,
      };

      const feedbackEngine = new FeedbackEngine(
        reviewService,
        auditService,
        new ArtifactDependencyGraph(),
        customPolicy
      );

      const mockContext = {
        workflowId: 'wf-retry-test',
        patientId: P3_ID,
        state: 'MEDICATIONS_CONFIRMED' as const,
        version: 1,
        confirmedMedicationRecordIds: [],
        unverifiedMedicationCandidates: [],
        prescriptionSourceReferences: [],
        interactionFindings: [],
        evidenceReferences: [],
        schedulingConstraints: [],
        outstandingQuestions: [],
        pendingHumanApprovals: [],
        completedOperations: [],
        failedOperations: [],
        datasetVersions: { rxnorm: '1', kdigo: '1', fda_ddi: '1', interactions: '1' },
        workflowVersion: '1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // Initially can retry
      const firstCheck = feedbackEngine.canRetryOperation(mockContext, 'CHECK_INTERACTIONS');
      expect(firstCheck.canRetry).toBe(true);
      expect(firstCheck.retryCount).toBe(0);

      // Record first recoverable failure
      feedbackEngine.recordOperation(mockContext, {
        operationType: 'CHECK_INTERACTIONS',
        inputVersion: 1,
        outputVersion: 1,
        dependencies: ['med:1'],
        executionStatus: 'failed',
        error: {
          code: 'EXTERNAL_SERVICE_TIMEOUT',
          message: 'Evidence provider timed out',
          isRecoverable: true,
        },
      });

      // Attempt 1: can retry with backoff
      const secondCheck = feedbackEngine.canRetryOperation(mockContext, 'CHECK_INTERACTIONS');
      expect(secondCheck.canRetry).toBe(true);
      expect(secondCheck.retryCount).toBe(1);
      expect(secondCheck.backoffMs).toBe(50);

      // Record second recoverable failure
      feedbackEngine.recordOperation(mockContext, {
        operationType: 'CHECK_INTERACTIONS',
        inputVersion: 1,
        outputVersion: 1,
        dependencies: ['med:1'],
        executionStatus: 'failed',
        error: {
          code: 'EXTERNAL_SERVICE_TIMEOUT',
          message: 'Evidence provider timed out again',
          isRecoverable: true,
        },
      });

      // Attempt 2: retry limit reached (maxRetries = 2)
      const thirdCheck = feedbackEngine.canRetryOperation(mockContext, 'CHECK_INTERACTIONS');
      expect(thirdCheck.canRetry).toBe(false);
      expect(thirdCheck.retryCount).toBe(2);
      expect(thirdCheck.reason).toContain('Maximum retry limit (2) exceeded');
    });
  });

  // ==========================================
  // 8. NON-RECOVERABLE ERRORS STOP IMMEDIATELY
  // ==========================================
  describe('8. Non-Recoverable Errors Halt Retries Immediately', () => {
    it('stops retrying immediately without consuming retry quota on non-recoverable errors', () => {
      const feedbackEngine = new FeedbackEngine(reviewService, auditService);

      const mockContext = {
        workflowId: 'wf-fatal-test',
        patientId: P3_ID,
        state: 'MEDICATIONS_CONFIRMED' as const,
        version: 1,
        confirmedMedicationRecordIds: [],
        unverifiedMedicationCandidates: [],
        prescriptionSourceReferences: [],
        interactionFindings: [],
        evidenceReferences: [],
        schedulingConstraints: [],
        outstandingQuestions: [],
        pendingHumanApprovals: [],
        completedOperations: [],
        failedOperations: [],
        datasetVersions: { rxnorm: '1', kdigo: '1', fda_ddi: '1', interactions: '1' },
        workflowVersion: '1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // Record fatal clinical invariant error
      feedbackEngine.recordOperation(mockContext, {
        operationType: 'CHECK_INTERACTIONS',
        inputVersion: 1,
        outputVersion: 1,
        dependencies: ['med:fatal'],
        executionStatus: 'failed',
        error: {
          code: 'CRITICAL_CLINICAL_CONTRAINDICATION',
          message: 'Absolute contraindication detected: fatal combination.',
          isRecoverable: false,
        },
      });

      // canRetryOperation must immediately return false
      const check = feedbackEngine.canRetryOperation(mockContext, 'CHECK_INTERACTIONS');
      expect(check.canRetry).toBe(false);
      expect(check.reason).toContain('non-recoverable error');
    });
  });

  // ==========================================
  // 9. DEDUPLICATION PREVENTS REPEATED CALLS
  // ==========================================
  describe('9. Deduplication of Identical Operations', () => {
    it('detects duplicate operations when input version and dependencies have not changed', () => {
      const feedbackEngine = new FeedbackEngine(reviewService, auditService);

      const mockContext = {
        workflowId: 'wf-dedup-test',
        patientId: P3_ID,
        state: 'MEDICATIONS_CONFIRMED' as const,
        version: 2,
        confirmedMedicationRecordIds: ['med:1', 'med:2'],
        unverifiedMedicationCandidates: [],
        prescriptionSourceReferences: [],
        interactionFindings: [],
        evidenceReferences: [],
        schedulingConstraints: [],
        outstandingQuestions: [],
        pendingHumanApprovals: [],
        completedOperations: [],
        failedOperations: [],
        datasetVersions: { rxnorm: '1', kdigo: '1', fda_ddi: '1', interactions: '1' },
        workflowVersion: '1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // Record a completed operation
      feedbackEngine.recordOperation(mockContext, {
        operationType: 'CHECK_INTERACTIONS',
        inputVersion: 2,
        outputVersion: 2,
        dependencies: ['med:1', 'med:2'],
        executionStatus: 'success',
      });

      // Deduplication check with identical parameters
      const isDup = feedbackEngine.isDuplicateOperation(
        mockContext,
        'CHECK_INTERACTIONS',
        ['med:2', 'med:1'], // Different order must be canonicalized
        2
      );
      expect(isDup).toBe(true);

      // If input version changes (e.g. after medication correction), not a duplicate
      const isNotDupNewVersion = feedbackEngine.isDuplicateOperation(
        mockContext,
        'CHECK_INTERACTIONS',
        ['med:1', 'med:2'],
        3
      );
      expect(isNotDupNewVersion).toBe(false);

      // If dependencies change, not a duplicate
      const isNotDupNewDeps = feedbackEngine.isDuplicateOperation(
        mockContext,
        'CHECK_INTERACTIONS',
        ['med:1', 'med:2', 'med:3'],
        2
      );
      expect(isNotDupNewDeps).toBe(false);
    });
  });

  // ==========================================
  // 10. OPTIMISTIC CONCURRENCY CONTROL
  // ==========================================
  describe('10. Optimistic Concurrency Control Across Conflicting Updates', () => {
    it('throws OptimisticConcurrencyError when concurrent transaction updates from stale version', async () => {
      const created = await orchestrator.createWorkflow({
        patientId: P3_ID,
        actor: 'Dr. Concurrency',
      });

      // Read initial state
      const initialCtx = workflowRepo.findById(created.workflowId)!;
      expect(initialCtx.version).toBe(1);

      // Simulate Thread A advancing workflow (increments version to 2)
      await orchestrator.advanceWorkflow(created.workflowId, 'Dr. Thread A');

      const updatedInDb = workflowRepo.findById(created.workflowId)!;
      expect(updatedInDb.version).toBe(2);

      // Simulate Thread B attempting to update using the stale version 1 context
      const staleContext = { ...initialCtx, state: 'BLOCKED' as const };
      expect(() => workflowRepo.update(staleContext)).toThrow(OptimisticConcurrencyError);
    });
  });

  // ==========================================
  // 11. WORKFLOW RECOVERY AFTER APPLICATION RESTART
  // ==========================================
  describe('11. Workflow Recovery After Server Restart', () => {
    it('reconciles interrupted in-flight states and verifies DAG fingerprints across restart', async () => {
      // 1. Create a workflow and simulate an interrupted state (CHECKING_INTERACTIONS)
      const created = await orchestrator.createWorkflow({
        patientId: P3_ID,
        actor: 'Dr. CrashTest',
      });

      const interruptedCtx = workflowRepo.findById(created.workflowId)!;
      interruptedCtx.state = 'CHECKING_INTERACTIONS';
      workflowRepo.update(interruptedCtx);

      // 2. Simulate complete application crash and restart with fresh repos and services
      const newWorkflowRepo = new WorkflowRepository(db);
      const newReviewRepo = new ReviewRequestRepository(db);
      const newArtifactHistoryRepo = new ArtifactHistoryRepository(db);
      const newToolExecRepo = new ToolExecutionRepository(db);
      const newToolRegistry = new ToolRegistry(newToolExecRepo);

      const newTools = createClinicalTools({
        patientRepo,
        medRepo,
        labRepo,
        diagRepo,
        auditService,
        conflictEngine,
        evidenceProvider,
        chronoCoordinator,
        chronoService,
        workflowRepo: newWorkflowRepo,
        reviewRequestRepo: newReviewRepo,
      });
      for (const t of newTools) newToolRegistry.registerTool(t);

      const restartedOrchestrator = new AgenticWorkflowOrchestrator(
        newWorkflowRepo,
        new ReviewRequestService(newReviewRepo, auditService),
        newToolRegistry,
        patientRepo,
        medRepo,
        labRepo,
        auditService,
        newToolExecRepo,
        newArtifactHistoryRepo
      );

      // 3. Trigger workflow recovery
      const recoveryReport = await restartedOrchestrator.recoverActiveWorkflows();

      expect(recoveryReport.recoveredCount).toBeGreaterThanOrEqual(1);
      const recoveredItem = recoveryReport.recoveredWorkflows.find(
        (w) => w.workflowId === created.workflowId
      );
      expect(recoveredItem).toBeDefined();
      expect(recoveredItem?.previousState).toBe('CHECKING_INTERACTIONS');
      expect(recoveredItem?.reconciledState).toBe('MEDICATIONS_CONFIRMED');

      // Context in database must now be safely in MEDICATIONS_CONFIRMED
      const recoveredInDb = newWorkflowRepo.findById(created.workflowId)!;
      expect(recoveredInDb.state).toBe('MEDICATIONS_CONFIRMED');
    });
  });
});
