import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { initializeSchema } from '../../src/server/db/database.js';
import { seedSyntheticData } from '../../src/server/db/seeds.js';
import { AgenticWorkflowOrchestrator } from '../../src/server/services/orchestration/agenticWorkflowOrchestrator.js';
import { WorkflowRepository } from '../../src/server/repositories/workflowRepository.js';
import { ReviewRequestRepository } from '../../src/server/repositories/reviewRequestRepository.js';
import { ReviewRequestService } from '../../src/server/services/orchestration/reviewRequestService.js';
import { ToolRegistry } from '../../src/server/services/orchestration/tools/toolRegistry.js';
import { createClinicalTools } from '../../src/server/services/orchestration/tools/clinicalTools.js';
import { PatientRepository } from '../../src/server/repositories/patientRepository.js';
import { MedicationRepository } from '../../src/server/repositories/medicationRepository.js';
import { LabMeasurementRepository } from '../../src/server/repositories/labMeasurementRepository.js';
import { DiagnosisRepository } from '../../src/server/repositories/diagnosisRepository.js';
import { AuditLogRepository } from '../../src/server/repositories/auditLogRepository.js';
import { ChronoRepository } from '../../src/server/repositories/chronoRepository.js';
import { AuditService } from '../../src/server/services/auditService.js';
import { PharmacokineticConflictEngine } from '../../src/server/services/interactions/conflictEngine.js';
import { LocalDrugReferenceProvider } from '../../src/server/services/interactions/referenceDataProvider.js';
import { LocalInteractionEvidenceProvider } from '../../src/server/services/interactions/interactionEvidenceProvider.js';
import { CircadianScheduleCoordinator } from '../../src/server/services/chrono/scheduleCoordinator.js';
import { ChronoService } from '../../src/server/services/chrono/chronoService.js';
import { LocalOCREngine } from '../../src/server/services/ocr/ocrEngine.js';
import { FileStorageService } from '../../src/server/services/ocr/fileStorageService.js';
import { DrugNormalizationService } from '../../src/server/services/ocr/normalizationService.js';
import { OCRExtractionService } from '../../src/server/services/ocr/ocrExtractionService.js';
import { LocalRxNormTerminologyProvider } from '../../src/server/services/ocr/terminologyProvider.js';
import path from 'path';

describe('Capability 1 & 2: Uncertain OCR Checkpoint & Confirmed Medications Enabling Downstream Analysis', () => {
  let db: Database.Database;
  let orchestrator: AgenticWorkflowOrchestrator;
  let workflowRepo: WorkflowRepository;
  let medRepo: MedicationRepository;

  const P1_ID = 'p1111111-1111-1111-1111-111111111111'; // Eleanor Vance (has unverified Atorvastatin)
  const P3_ID = 'p3333333-3333-3333-3333-333333333333'; // Margaret Chen (all confirmed)

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initializeSchema(db);
    seedSyntheticData(db);

    const patientRepo = new PatientRepository(db);
    medRepo = new MedicationRepository(db);
    const labRepo = new LabMeasurementRepository(db);
    const diagRepo = new DiagnosisRepository(db);
    const auditRepo = new AuditLogRepository(db);
    const auditService = new AuditService(auditRepo);
    const chronoRepo = new ChronoRepository(db);
    const chronoService = new ChronoService(patientRepo, medRepo, chronoRepo, auditService);
    const conflictEngine = new PharmacokineticConflictEngine(
      new LocalDrugReferenceProvider(),
      new LocalInteractionEvidenceProvider()
    );
    const chronoCoordinator = new CircadianScheduleCoordinator();
    const ocrEngine = new LocalOCREngine();
    const fileStorageService = new FileStorageService();
    const normalizationService = new DrugNormalizationService(
      new OCRExtractionService(),
      new LocalRxNormTerminologyProvider(),
      medRepo
    );

    workflowRepo = new WorkflowRepository(db);
    const reviewRepo = new ReviewRequestRepository(db);
    const reviewService = new ReviewRequestService(reviewRepo, auditService);

    const toolRegistry = new ToolRegistry();
    const tools = createClinicalTools({
      patientRepo,
      medRepo,
      labRepo,
      diagRepo,
      auditService,
      conflictEngine,
      evidenceProvider: new LocalInteractionEvidenceProvider(),
      chronoCoordinator,
      chronoService,
      workflowRepo,
      reviewRequestRepo: reviewRepo,
      ocrEngine,
      fileStorageService,
      ocrNormalizationService: normalizationService,
    });
    for (const t of tools) toolRegistry.registerTool(t);

    orchestrator = new AgenticWorkflowOrchestrator(
      workflowRepo,
      reviewService,
      toolRegistry,
      patientRepo,
      medRepo,
      labRepo,
      auditService
    );
  });

  it('2. Uncertain OCR output stops downstream execution at AWAITING_MEDICATION_CONFIRMATION', async () => {
    // Eleanor Vance has unverified Atorvastatin in her record
    const workflow = await orchestrator.createWorkflow({
      patientId: P1_ID,
      actor: 'Clinical Pharmacist',
    });

    expect(workflow.state).toBe('CREATED');

    // Step 1: Advances to retrieve context and detects unverified candidate
    const advanced = await orchestrator.advanceWorkflow(workflow.workflowId, 'Clinical Pharmacist');

    expect(advanced.state).toBe('AWAITING_MEDICATION_CONFIRMATION');
    expect(advanced.unverifiedMedicationCandidates.length).toBeGreaterThan(0);

    const unverifiedCand = advanced.unverifiedMedicationCandidates[0];
    expect(unverifiedCand.status).toBe('unverified');

    // Human review request created for medication identity clarification
    expect(advanced.pendingHumanApprovals.length).toBeGreaterThan(0);
    const review = advanced.pendingHumanApprovals.find(
      (r) => r.category === 'medication_identity_clarification'
    );
    expect(review).toBeDefined();
    expect(review?.status).toBe('pending');

    // Attempting to advance again without confirming MUST NOT proceed to interaction analysis
    const halted = await orchestrator.advanceWorkflow(workflow.workflowId, 'Clinical Pharmacist');
    expect(halted.state).toBe('AWAITING_MEDICATION_CONFIRMATION');
    expect(halted.interactionFindings.length).toBe(0);
    expect(halted.proposedSchedules).toBeUndefined();
  });

  it('3. Confirmed medications enable downstream interaction analysis and schedule coordination', async () => {
    // 1. Start for Eleanor Vance (halts at confirmation checkpoint)
    const workflow = await orchestrator.createWorkflow({
      patientId: P1_ID,
      actor: 'Clinical Pharmacist',
    });

    const halted = await orchestrator.advanceWorkflow(workflow.workflowId, 'Clinical Pharmacist');
    expect(halted.state).toBe('AWAITING_MEDICATION_CONFIRMATION');

    const unverifiedId = halted.unverifiedMedicationCandidates[0].id;

    // 2. Clinician explicitly confirms the medication
    const confirmed = await orchestrator.confirmMedicationCandidate(
      workflow.workflowId,
      unverifiedId,
      'Dr. Alice Attending, MD',
      'Verified with outpatient cardiology clinic note'
    );

    // 3. Advancing now moves to MEDICATIONS_CONFIRMED
    const postConfirm = await orchestrator.advanceWorkflow(workflow.workflowId, 'Clinical Pharmacist');
    expect(postConfirm.state).toBe('MEDICATIONS_CONFIRMED');

    // 4. Advancing again executes deterministic interaction analysis
    const interactionChecked = await orchestrator.advanceWorkflow(workflow.workflowId, 'Clinical Pharmacist');

    // Eleanor Vance has severe/contraindicated duplicate APAP therapy and clearance gaps
    expect(['AWAITING_CLINICAL_REVIEW', 'PREPARING_SCHEDULE']).toContain(interactionChecked.state);
    expect(interactionChecked.interactionFindings.length).toBeGreaterThan(0);
    expect(interactionChecked.completedOperations.some((op) => op.operationType === 'CHECK_INTERACTIONS')).toBe(true);
  });

  it('runs cleanly to schedule coordination for Margaret Chen who has all confirmed medications', async () => {
    const workflow = await orchestrator.createWorkflow({
      patientId: P3_ID,
      actor: 'Clinical Pharmacist',
    });

    // Advance 1: Context retrieved -> MEDICATIONS_CONFIRMED (since all meds confirmed)
    const step1 = await orchestrator.advanceWorkflow(workflow.workflowId, 'Pharmacist');
    expect(step1.state).toBe('MEDICATIONS_CONFIRMED');
    expect(step1.confirmedMedicationRecordIds.length).toBeGreaterThan(0);

    // Advance 2: Interaction evaluation -> AWAITING_CLINICAL_REVIEW (Margaret has Levothyroxine-Calcium interaction)
    const step2 = await orchestrator.advanceWorkflow(workflow.workflowId, 'Pharmacist');
    expect(step2.state).toBe('AWAITING_CLINICAL_REVIEW');
    expect(step2.interactionFindings.length).toBeGreaterThan(0);
  });
});
