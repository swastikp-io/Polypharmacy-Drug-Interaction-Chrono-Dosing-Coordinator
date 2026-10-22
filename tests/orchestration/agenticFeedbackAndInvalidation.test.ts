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

describe('Capability 4: Feedback Loops & Controlled Invalidation', () => {
  let db: Database.Database;
  let orchestrator: AgenticWorkflowOrchestrator;
  let medRepo: MedicationRepository;
  let labRepo: LabMeasurementRepository;
  let workflowRepo: WorkflowRepository;

  const P3_ID = 'p3333333-3333-3333-3333-333333333333'; // Margaret Chen

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initializeSchema(db);
    seedSyntheticData(db);

    const patientRepo = new PatientRepository(db);
    medRepo = new MedicationRepository(db);
    labRepo = new LabMeasurementRepository(db);
    const diagRepo = new DiagnosisRepository(db);
    const auditRepo = new AuditLogRepository(db);
    const auditService = new AuditService(auditRepo);
    const chronoRepo = new ChronoRepository(db);
    const chronoService = new ChronoService(patientRepo, medRepo, chronoRepo, auditService);

    const evidenceProvider = new LocalInteractionEvidenceProvider();
    const conflictEngine = new PharmacokineticConflictEngine(
      new LocalDrugReferenceProvider(),
      evidenceProvider
    );
    const chronoCoordinator = new CircadianScheduleCoordinator();

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
      evidenceProvider,
      chronoCoordinator,
      chronoService,
      workflowRepo,
      reviewRequestRepo: reviewRepo,
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

  describe('5. Medication Corrections Invalidating Dependent Findings & Proposed Schedule', () => {
    it('invalidates interaction findings and draft schedule when a medication is corrected', async () => {
      // 1. Create and advance workflow for Margaret Chen
      const workflow = await orchestrator.createWorkflow({
        patientId: P3_ID,
        actor: 'Clinical Pharmacist',
      });

      // Advance: CREATED -> RETRIEVING_PATIENT_CONTEXT -> MEDICATIONS_CONFIRMED
      await orchestrator.advanceWorkflow(workflow.workflowId, 'Pharmacist');
      // Advance: MEDICATIONS_CONFIRMED -> CHECKING_INTERACTIONS -> AWAITING_CLINICAL_REVIEW
      await orchestrator.advanceWorkflow(workflow.workflowId, 'Pharmacist');

      // Verify findings exist
      let ctx = orchestrator.getWorkflow(workflow.workflowId)!;
      expect(ctx.interactionFindings.length).toBeGreaterThan(0);
      const initialFindingCount = ctx.interactionFindings.length;

      // Resolve pending clinical review to move forward
      for (const review of ctx.pendingHumanApprovals) {
        if (review.status === 'pending') {
          await orchestrator.resolveHumanReview(workflow.workflowId, review.id, {
            status: 'approved',
            reviewerIdentity: 'Dr. Emily Vance, MD',
            reviewerNotes: 'Co-administration separated by 4 hours',
            targetVersion: review.itemVersion,
          });
        }
      }

      // Advance: AWAITING_CLINICAL_REVIEW -> PREPARING_SCHEDULE -> AWAITING_SCHEDULE_REVIEW
      await orchestrator.advanceWorkflow(workflow.workflowId, 'Pharmacist');
      ctx = orchestrator.getWorkflow(workflow.workflowId)!;
      expect(ctx.state).toBe('AWAITING_SCHEDULE_REVIEW');
      expect(ctx.proposedSchedules).toBeDefined();

      // Find an active medication for Margaret
      const meds = medRepo.findByPatientId(P3_ID);
      const levothyroxine = meds.find((m) => m.brand.toLowerCase().includes('synthroid') || m.genericName.toLowerCase().includes('levothyroxine'))!;
      expect(levothyroxine).toBeDefined();

      // 2. Clinician corrects medication dose / instructions
      const updatedCtx = await orchestrator.correctMedication(
        workflow.workflowId,
        levothyroxine.id,
        'Dr. Emily Vance, MD',
        'Dose adjusted from 50mcg to 75mcg following TSH elevated reading'
      );

      // 3. Verify downstream invalidation occurred:
      // State transitioned back to MEDICATIONS_CONFIRMED
      expect(updatedCtx.state).toBe('MEDICATIONS_CONFIRMED');

      // Interaction findings cleared / marked invalidated
      expect(updatedCtx.interactionFindings.length).toBe(0);
      expect(updatedCtx.derivedFindings).toBeUndefined();

      // Proposed schedule invalidated
      expect(updatedCtx.proposedSchedules).toBeUndefined();

      // Dependent completed operations marked as invalidated
      const invalidatedOps = updatedCtx.completedOperations.filter(
        (op) => op.executionStatus === 'invalidated'
      );
      expect(invalidatedOps.length).toBeGreaterThan(0);

      // 4. Re-running advances only the invalidated stages
      const reevaluated = await orchestrator.advanceWorkflow(workflow.workflowId, 'Pharmacist');
      expect(reevaluated.state).toBe('AWAITING_CLINICAL_REVIEW');
      expect(reevaluated.interactionFindings.length).toBeGreaterThan(0);
    });
  });

  describe('6. New Laboratory Data Invalidating Dependent Results', () => {
    it('invalidates findings that explicitly depend on renal/hepatic lab measurements', async () => {
      // 1. Advance workflow to interaction check
      const workflow = await orchestrator.createWorkflow({
        patientId: P3_ID,
        actor: 'Clinical Pharmacist',
      });

      await orchestrator.advanceWorkflow(workflow.workflowId, 'Pharmacist');
      await orchestrator.advanceWorkflow(workflow.workflowId, 'Pharmacist');

      const ctxBefore = orchestrator.getWorkflow(workflow.workflowId)!;
      expect(ctxBefore.interactionFindings.length).toBeGreaterThan(0);

      // 2. New renal lab entered: Serum Creatinine
      const ctxAfterLab = await orchestrator.recordNewLabData(
        workflow.workflowId,
        'Serum Creatinine',
        'Lab Tech'
      );

      // Verify findings invalidated and state reset for re-evaluation
      expect(ctxAfterLab.interactionFindings.length).toBe(0);
      expect(ctxAfterLab.derivedFindings).toBeUndefined();

      // Operations depending on lab are marked invalidated
      const invalidatedOps = ctxAfterLab.completedOperations.filter(
        (op) => op.executionStatus === 'invalidated'
      );
      expect(invalidatedOps.length).toBeGreaterThan(0);

      // Re-evaluation re-calculates interactions
      const freshContext = await orchestrator.advanceWorkflow(workflow.workflowId, 'Pharmacist');
      expect(freshContext.interactionFindings.length).toBeGreaterThan(0);
    });
  });
});
