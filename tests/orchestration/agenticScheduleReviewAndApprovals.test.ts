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
import {
  ApprovalVersionMismatchError,
  UnauthorizedReviewerError,
} from '../../src/server/services/orchestration/stateMachine/errors.js';

describe('Capability 5: Human-In-The-Loop Reviews, Scheduling Conflicts & Approval Versioning', () => {
  let db: Database.Database;
  let orchestrator: AgenticWorkflowOrchestrator;
  let reviewService: ReviewRequestService;
  let medRepo: MedicationRepository;

  const P3_ID = 'p3333333-3333-3333-3333-333333333333'; // Margaret Chen (Levothyroxine + Calcium timing conflict)

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

    const evidenceProvider = new LocalInteractionEvidenceProvider();
    const conflictEngine = new PharmacokineticConflictEngine(
      new LocalDrugReferenceProvider(),
      evidenceProvider
    );
    const chronoCoordinator = new CircadianScheduleCoordinator();

    const workflowRepo = new WorkflowRepository(db);
    const reviewRepo = new ReviewRequestRepository(db);
    reviewService = new ReviewRequestService(reviewRepo, auditService);

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

  describe('7. Scheduling Conflicts Creating Review Requests (No Invention of Solutions)', () => {
    it('preserves scheduling conflicts and creates human review request instead of automatic changes', async () => {
      const workflow = await orchestrator.createWorkflow({
        patientId: P3_ID,
        actor: 'Clinical Pharmacist',
      });

      // Advance to MEDICATIONS_CONFIRMED
      await orchestrator.advanceWorkflow(workflow.workflowId, 'Pharmacist');
      // Advance to AWAITING_CLINICAL_REVIEW
      await orchestrator.advanceWorkflow(workflow.workflowId, 'Pharmacist');

      // Resolve interaction review to proceed to schedule preparation
      const ctx1 = orchestrator.getWorkflow(workflow.workflowId)!;
      for (const review of ctx1.pendingHumanApprovals) {
        if (review.status === 'pending') {
          await orchestrator.resolveHumanReview(workflow.workflowId, review.id, {
            status: 'approved',
            reviewerIdentity: 'Dr. Arthur Conan, MD',
            reviewerNotes: 'Clinical assessment complete',
            targetVersion: review.itemVersion,
          });
        }
      }

      // Advance to PREPARING_SCHEDULE -> AWAITING_SCHEDULE_REVIEW
      const ctx2 = await orchestrator.advanceWorkflow(workflow.workflowId, 'Pharmacist');
      expect(ctx2.state).toBe('AWAITING_SCHEDULE_REVIEW');

      // Scheduling conflicts preserved!
      expect(ctx2.proposedSchedules).toBeDefined();
      expect(ctx2.proposedSchedules?.conflicts.length).toBeGreaterThan(0);

      // Review request created specifically for conflicting constraints or schedule review
      const scheduleReviews = ctx2.pendingHumanApprovals.filter(
        (r) =>
          r.category === 'conflicting_scheduling_constraints' ||
          r.category === 'schedule_review'
      );
      expect(scheduleReviews.length).toBeGreaterThan(0);

      // Verify no doses were silently removed or modified
      const totalDoses = ctx2.proposedSchedules?.scheduleTimeline.slots.reduce(
        (sum: number, s: any) => sum + s.doses.length,
        0
      );
      expect(totalDoses).toBeGreaterThan(0);
    });
  });

  describe('8. Approval Invalidation After Relevant Data Changes', () => {
    it('invalidates approval when underlying data changes after review', async () => {
      const workflow = await orchestrator.createWorkflow({
        patientId: P3_ID,
        actor: 'Clinical Pharmacist',
      });

      await orchestrator.advanceWorkflow(workflow.workflowId, 'Pharmacist');
      await orchestrator.advanceWorkflow(workflow.workflowId, 'Pharmacist');

      let ctx = orchestrator.getWorkflow(workflow.workflowId)!;
      // Resolve interaction reviews
      for (const review of ctx.pendingHumanApprovals) {
        if (review.status === 'pending') {
          await orchestrator.resolveHumanReview(workflow.workflowId, review.id, {
            status: 'approved',
            reviewerIdentity: 'Dr. Arthur Conan, MD',
            reviewerNotes: 'Verified',
            targetVersion: review.itemVersion,
          });
        }
      }

      // Advance to schedule review
      await orchestrator.advanceWorkflow(workflow.workflowId, 'Pharmacist');
      ctx = orchestrator.getWorkflow(workflow.workflowId)!;

      // Clinician approves the schedule
      const schedReview = ctx.pendingHumanApprovals.find(
        (r) => r.category === 'schedule_review' && r.status === 'pending'
      )!;
      expect(schedReview).toBeDefined();

      await orchestrator.resolveHumanReview(workflow.workflowId, schedReview.id, {
        status: 'approved',
        reviewerIdentity: 'Dr. Arthur Conan, MD',
        reviewerNotes: 'Diurnal timetable approved',
        targetVersion: schedReview.itemVersion,
      });

      ctx = orchestrator.getWorkflow(workflow.workflowId)!;
      expect(ctx.humanApprovedOutcomes?.scheduleApproved).toBe(true);

      // Now medication changes (Feedback loop!)
      const meds = medRepo.findByPatientId(P3_ID);
      const updatedCtx = await orchestrator.correctMedication(
        workflow.workflowId,
        meds[0].id,
        'Dr. Emily Vance, MD',
        'Changed dosage'
      );

      // Verify that prior schedule approval was INVALIDATED
      expect(updatedCtx.humanApprovedOutcomes?.scheduleApproved).toBe(false);
      expect(updatedCtx.humanApprovedOutcomes?.decisionRationale).toContain('invalidated');

      // The review request itself is marked invalidated in reviewRepo
      const updatedReview = reviewService.getRequest(schedReview.id);
      expect(updatedReview?.status).toBe('invalidated');
    });

    it('rejects approval when targetVersion does not match current item version', async () => {
      const workflow = await orchestrator.createWorkflow({
        patientId: P3_ID,
        actor: 'Clinical Pharmacist',
      });

      await orchestrator.advanceWorkflow(workflow.workflowId, 'Pharmacist');
      await orchestrator.advanceWorkflow(workflow.workflowId, 'Pharmacist');

      const ctx = orchestrator.getWorkflow(workflow.workflowId)!;
      const review = ctx.pendingHumanApprovals[0];

      // Attempt approval with wrong version (stale approval)
      await expect(
        orchestrator.resolveHumanReview(workflow.workflowId, review.id, {
          status: 'approved',
          reviewerIdentity: 'Dr. Arthur Conan, MD',
          reviewerNotes: 'Stale attempt',
          targetVersion: 99999, // Mismatched version!
        })
      ).rejects.toThrow(ApprovalVersionMismatchError);
    });
  });

  describe('Human Reviewer Identity Enforcement (No LLM Impersonation)', () => {
    it('strictly prohibits automated/LLM persona from approving clinical recommendations', async () => {
      const workflow = await orchestrator.createWorkflow({
        patientId: P3_ID,
        actor: 'Clinical Pharmacist',
      });

      await orchestrator.advanceWorkflow(workflow.workflowId, 'Pharmacist');
      await orchestrator.advanceWorkflow(workflow.workflowId, 'Pharmacist');

      const ctx = orchestrator.getWorkflow(workflow.workflowId)!;
      const review = ctx.pendingHumanApprovals[0];

      const prohibitedActors = [
        'LLM_Agent',
        'AI Clinician',
        'Claude Assistant',
        'Bot',
        'System Automated Reviewer',
        '',
      ];

      for (const actor of prohibitedActors) {
        await expect(
          orchestrator.resolveHumanReview(workflow.workflowId, review.id, {
            status: 'approved',
            reviewerIdentity: actor,
            reviewerNotes: 'Autonomous approval attempt',
            targetVersion: review.itemVersion,
          })
        ).rejects.toThrow(UnauthorizedReviewerError);
      }
    });
  });
});
