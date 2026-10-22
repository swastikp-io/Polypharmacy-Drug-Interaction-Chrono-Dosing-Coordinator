import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { initializeSchema } from '../../src/server/db/database.js';
import { seedSyntheticData } from '../../src/server/db/seeds.js';
import { AgenticWorkflowOrchestrator } from '../../src/server/services/orchestration/agenticWorkflowOrchestrator.js';
import { WorkflowRepository } from '../../src/server/repositories/workflowRepository.js';
import { ReviewRequestRepository } from '../../src/server/repositories/reviewRequestRepository.js';
import { ApprovalRecordRepository } from '../../src/server/repositories/approvalRecordRepository.js';
import { ToolExecutionRepository } from '../../src/server/repositories/toolExecutionRepository.js';
import { ArtifactHistoryRepository } from '../../src/server/repositories/artifactHistoryRepository.js';
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
  InvalidWorkflowTransitionError,
  UnauthorizedReviewerError,
  UnauthorizedReviewerRoleError,
  WorkflowPrerequisiteError,
} from '../../src/server/services/orchestration/stateMachine/errors.js';
import { ClinicalEngineService } from '../../mcp-server/src/services/clinicalEngineService.js';
import { dispatchTool } from '../../mcp-server/src/tools/registry.js';
import type { ReviewCategory } from '../../src/shared/orchestrationTypes.js';

describe('Phase 4: Human Review and Approval Gates', () => {
  let db: Database.Database;
  let orchestrator: AgenticWorkflowOrchestrator;
  let reviewService: ReviewRequestService;
  let workflowRepo: WorkflowRepository;
  let approvalRepo: ApprovalRecordRepository;
  let medRepo: MedicationRepository;
  let engineService: ClinicalEngineService;

  const P1_ID = 'p1111111-1111-1111-1111-111111111111'; // Eleanor Vance
  const P3_ID = 'p3333333-3333-3333-3333-333333333333'; // Margaret Chen (Levothyroxine, Calcium Carbonate timing conflict)

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

    workflowRepo = new WorkflowRepository(db);
    const reviewRepo = new ReviewRequestRepository(db);
    approvalRepo = new ApprovalRecordRepository(db);
    const toolExecRepo = new ToolExecutionRepository(db);
    const historyRepo = new ArtifactHistoryRepository(db);

    reviewService = new ReviewRequestService(reviewRepo, auditService, approvalRepo);

    const toolRegistry = new ToolRegistry(toolExecRepo);
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
      auditService,
      toolExecRepo,
      historyRepo,
      undefined,
      approvalRepo
    );

    // Initialize MCP Clinical Engine using the same in-memory DB
    engineService = new ClinicalEngineService(db);
  });

  // =========================================================================
  // RULE 1: An unverified medication cannot be treated as a confirmed ingredient
  // =========================================================================
  describe('Rule 1: Unverified medication cannot be treated as confirmed ingredient', () => {
    it('blocks interaction analysis when unverified medication candidates are present', async () => {
      const workflow = await orchestrator.createWorkflow({
        patientId: P1_ID,
        actor: 'Intake Clinician',
      });

      // Submit an unverified candidate medication
      const ctx = orchestrator.getWorkflow(workflow.workflowId)!;
      ctx.unverifiedMedicationCandidates.push({
        id: 'cand-amiodarone-1',
        rawText: 'Amiodarone 200mg daily PO',
        brand: 'Cordarone',
        dose: '200mg',
        frequency: 'daily',
        confidence: 0.72,
        status: 'unverified',
      });
      ctx.state = 'MEDICATIONS_CONFIRMED';
      workflowRepo.update(ctx);

      // Attempting to advance to CHECKING_INTERACTIONS when unverified candidates exist must fail
      await expect(
        orchestrator.advanceWorkflow(workflow.workflowId, 'Clinical Pharmacist')
      ).rejects.toThrow(WorkflowPrerequisiteError);
    });

    it('allows progression only after explicit confirmation of candidate medication', async () => {
      const workflow = await orchestrator.createWorkflow({
        patientId: P1_ID,
        actor: 'Intake Clinician',
      });

      const ctx = orchestrator.getWorkflow(workflow.workflowId)!;
      ctx.unverifiedMedicationCandidates.push({
        id: 'cand-metoprolol-1',
        rawText: 'Metoprolol Tartrate 25mg BID',
        brand: 'Lopressor',
        genericName: 'metoprolol tartrate',
        dose: '25mg',
        frequency: 'BID',
        confidence: 0.85,
        status: 'unverified',
      });
      ctx.state = 'AWAITING_MEDICATION_CONFIRMATION';
      workflowRepo.update(ctx);

      // Confirm candidate explicitly
      await orchestrator.confirmMedicationCandidate(
        workflow.workflowId,
        'cand-metoprolol-1',
        'Dr. Clinician, PharmD',
        'Verified against patient discharge paperwork'
      );

      // Now advancing moves to MEDICATIONS_CONFIRMED
      const confirmed = await orchestrator.advanceWorkflow(
        workflow.workflowId,
        'Clinical Pharmacist'
      );

      expect(confirmed.state).toBe('MEDICATIONS_CONFIRMED');
      expect(confirmed.unverifiedMedicationCandidates[0].status).toBe('confirmed');
      expect(confirmed.confirmedMedicationRecordIds.length).toBeGreaterThan(0);
    });
  });

  // =========================================================================
  // RULE 2: A failed evidence lookup cannot be represented as a negative interaction result
  // =========================================================================
  describe('Rule 2: Failed evidence lookup cannot be represented as negative result', () => {
    it('creates an insufficient_clinical_evidence or significant review request and never reports false safe', async () => {
      const workflow = await orchestrator.createWorkflow({
        patientId: P3_ID,
        actor: 'Clinical Pharmacist',
      });

      // Advance to MEDICATIONS_CONFIRMED
      await orchestrator.advanceWorkflow(workflow.workflowId, 'Pharmacist');

      // Execute interaction check -> transitions to AWAITING_CLINICAL_REVIEW
      const afterCheck = await orchestrator.advanceWorkflow(workflow.workflowId, 'Pharmacist');

      const reviews = orchestrator.getReviewQueue(workflow.workflowId);
      expect(reviews.length).toBeGreaterThan(0);

      // Verify findings contain explicit evidence references and data gaps
      expect(afterCheck.interactionFindings.length).toBeGreaterThan(0);
      for (const finding of afterCheck.interactionFindings) {
        expect(finding.sourceCitation).toBeDefined();
        expect(finding.mechanism).toBeDefined();
        if (finding.severity === 'contraindicated' || finding.severity === 'major') {
          expect(finding.sourceCitation.length).toBeGreaterThan(0);
        }
      }
    });
  });

  // =========================================================================
  // RULE 3: A schedule with unresolved mandatory constraints cannot be marked ready for approval
  // =========================================================================
  describe('Rule 3: Unresolved mandatory constraints block schedule approval', () => {
    it('blocks approving schedule_review when conflicting_scheduling_constraints reviews are pending', async () => {
      // Margaret Chen (P3_ID) has Levothyroxine + Calcium timing conflict
      const workflow = await orchestrator.createWorkflow({
        patientId: P3_ID,
        actor: 'Clinical Coordinator',
      });

      // Advance to MEDICATIONS_CONFIRMED
      await orchestrator.advanceWorkflow(workflow.workflowId, 'Pharmacist');
      // Advance to AWAITING_CLINICAL_REVIEW
      await orchestrator.advanceWorkflow(workflow.workflowId, 'Pharmacist');

      // Resolve all clinical interaction reviews so workflow can reach schedule preparation
      const ctxInteractions = orchestrator.getWorkflow(workflow.workflowId)!;
      for (const rev of ctxInteractions.pendingHumanApprovals) {
        if (rev.status === 'pending') {
          await orchestrator.resolveHumanReview(workflow.workflowId, rev.id, {
            status: 'approved',
            reviewerIdentity: 'Dr. Arthur Conan, MD',
            reviewerRole: 'attending_physician',
            reviewerNotes: 'Clinical assessment complete and acceptable',
            targetVersion: rev.itemVersion,
          });
        }
      }

      // Advance to PREPARING_SCHEDULE -> AWAITING_SCHEDULE_REVIEW
      const ctxSchedule = await orchestrator.advanceWorkflow(workflow.workflowId, 'Pharmacist');
      expect(ctxSchedule.state).toBe('AWAITING_SCHEDULE_REVIEW');

      // Add a mandatory scheduling constraint review (Rule 3)
      const mandatoryReview = reviewService.createRequest({
        workflowId: workflow.workflowId,
        category: 'conflicting_scheduling_constraints',
        reason:
          '[MANDATORY_CONSTRAINT] Impossible timing constraint: Drug X and Drug Y require 6-hour bidirectional separation',
        supportingEvidenceReferences: [],
        missingOrConflictingInfo:
          'Mandatory Constraint: Hard physiological absorption conflict',
        requestedReviewerAction: 'Prescriber must alter regimen',
        targetEntityType: 'schedule',
        targetEntityId: 'c-mand-1',
        itemVersion: ctxSchedule.version,
      });
      ctxSchedule.pendingHumanApprovals.push(mandatoryReview);
      workflowRepo.update(ctxSchedule);

      const scheduleReview = ctxSchedule.pendingHumanApprovals.find(
        (r) => r.category === 'schedule_review' && r.status === 'pending'
      );
      expect(scheduleReview).toBeDefined();

      // Attempting to approve the draft schedule before resolving the mandatory conflict MUST fail (Rule 3)
      await expect(
        orchestrator.resolveHumanReview(workflow.workflowId, scheduleReview!.id, {
          status: 'approved',
          reviewerIdentity: 'Dr. Sarah Lin, PharmD',
          reviewerRole: 'clinical_pharmacist',
          reviewerNotes: 'Attempting prematurely to approve schedule',
          targetVersion: scheduleReview!.itemVersion,
        })
      ).rejects.toThrow(WorkflowPrerequisiteError);

      // Now resolve the mandatory constraint first
      await orchestrator.resolveHumanReview(workflow.workflowId, mandatoryReview.id, {
        status: 'approved',
        reviewerIdentity: 'Nurse Kelly, RN',
        reviewerRole: 'registered_nurse',
        reviewerNotes: 'Confirmed 4-hour administration separation on ward schedule',
        targetVersion: mandatoryReview.itemVersion,
      });

      // Now approving the draft schedule succeeds!
      const finalResolution = await orchestrator.resolveHumanReview(
        workflow.workflowId,
        scheduleReview!.id,
        {
          status: 'approved',
          reviewerIdentity: 'Dr. Arthur Conan, MD',
          reviewerRole: 'attending_physician',
          reviewerNotes: 'Schedule approved with 4h separation',
          targetVersion: scheduleReview!.itemVersion,
        }
      );

      expect(finalResolution.humanApprovedOutcomes?.scheduleApproved).toBe(true);
    });
  });

  // =========================================================================
  // RULE 4: An LLM cannot create a clinician identity or impersonate a reviewer
  // =========================================================================
  describe('Rule 4: AI / LLM identities cannot impersonate clinicians or resolve reviews', () => {
    it('rejects AI / LLM reviewer identities with UnauthorizedReviewerError', async () => {
      const workflow = await orchestrator.createWorkflow({
        patientId: P1_ID,
        actor: 'Intake',
      });

      const rev = reviewService.createRequest({
        workflowId: workflow.workflowId,
        category: 'medication_identity_clarification',
        reason: 'Uncertain brand entity',
        supportingEvidenceReferences: [],
        requestedReviewerAction: 'Verify in EHR',
        targetEntityType: 'ocr_candidate',
        targetEntityId: 'cand-1',
        itemVersion: 1,
      });

      const invalidIdentities = [
        'Claude',
        'Claude 3.5 Sonnet',
        'GPT-4o Clinical Assistant',
        'Autonomous AI Agent',
        'System Assistant Bot',
        'LLM Evaluator',
      ];

      for (const aiName of invalidIdentities) {
        expect(() =>
          reviewService.resolveRequest(
            rev.id,
            {
              status: 'approved',
              reviewerIdentity: aiName,
              reviewerRole: 'clinical_pharmacist',
              targetVersion: 1,
            },
            1
          )
        ).toThrow(UnauthorizedReviewerError);
      }
    });

    it('accepts legitimate human clinician credentials', async () => {
      const workflow = await orchestrator.createWorkflow({
        patientId: P1_ID,
        actor: 'Intake',
      });

      const rev = reviewService.createRequest({
        workflowId: workflow.workflowId,
        category: 'missing_prescription_instructions',
        reason: 'Missing frequency',
        supportingEvidenceReferences: [],
        requestedReviewerAction: 'Clarify with prescriber',
        targetEntityType: 'medication',
        targetEntityId: 'med-1',
        itemVersion: 1,
      });

      const result = reviewService.resolveRequest(
        rev.id,
        {
          status: 'approved',
          reviewerIdentity: 'Dr. Maria Chen, MD',
          reviewerRole: 'attending_physician',
          reviewerNotes: 'Verified TID dosing with attending',
          targetVersion: 1,
        },
        1
      );

      expect(result.request.status).toBe('approved');
      expect(result.request.reviewerIdentity).toBe('Dr. Maria Chen, MD');
      expect(result.approvalRecord.reviewerRole).toBe('attending_physician');
    });
  });

  // =========================================================================
  // RULE 5: Changed artifact must be reviewed again (Stale invalidation)
  // =========================================================================
  describe('Rule 5: Changed artifact invalidates prior approvals and requires renew review', () => {
    it('invalidates active approval records when medication identity/dose is corrected', async () => {
      const workflow = await orchestrator.createWorkflow({
        patientId: P3_ID,
        actor: 'Clinical Pharmacist',
      });

      // Advance through confirmed meds & interactions
      await orchestrator.advanceWorkflow(workflow.workflowId, 'Pharmacist');
      await orchestrator.advanceWorkflow(workflow.workflowId, 'Pharmacist');

      // Resolve interaction reviews
      const ctx = orchestrator.getWorkflow(workflow.workflowId)!;
      const review = ctx.pendingHumanApprovals.find(
        (r) => r.status === 'pending'
      );
      expect(review).toBeDefined();

      await orchestrator.resolveHumanReview(workflow.workflowId, review!.id, {
        status: 'approved',
        reviewerIdentity: 'Dr. Sarah Lin, PharmD',
        reviewerRole: 'clinical_pharmacist',
        reviewerNotes: 'Co-administration monitored with clinical separation',
        targetVersion: review!.itemVersion,
      });

      // Verify approval record exists and is fresh
      const activeApprovalsBefore = approvalRepo.findActiveByWorkflowId(workflow.workflowId);
      expect(activeApprovalsBefore.length).toBeGreaterThan(0);
      expect(activeApprovalsBefore[0].validUntilStale).toBe(true);

      // Now trigger medication correction feedback loop
      await orchestrator.correctMedication(
        workflow.workflowId,
        'med-levo-1',
        'Dr. Endocrinologist, MD',
        'Adjusted levothyroxine dose based on TSH lab panel'
      );

      // Verify approval record is now marked STALE (validUntilStale = false)
      const activeApprovalsAfter = approvalRepo.findActiveByWorkflowId(workflow.workflowId);
      expect(activeApprovalsAfter.length).toBe(0); // Active approvals must be 0

      const allApprovals = approvalRepo.findByWorkflowId(workflow.workflowId);
      expect(allApprovals.some((a) => a.validUntilStale === false)).toBe(true);

      // Re-running workflow requires renewed review for updated interaction findings
      const nextDecision = orchestrator.determineNextOperation(workflow.workflowId);
      expect(nextDecision.nextOperation).toBe('CHECK_INTERACTIONS');
    });
  });

  // =========================================================================
  // RULE 6: Approval must be recorded separately from workflow completion
  // =========================================================================
  describe('Rule 6: Approval recorded separately from workflow completion', () => {
    it('maintains approval records in approval_records table without prematurely completing workflow', async () => {
      const workflow = await orchestrator.createWorkflow({
        patientId: P3_ID,
        actor: 'Clinical Pharmacist',
      });

      // Advance to MEDICATIONS_CONFIRMED
      await orchestrator.advanceWorkflow(workflow.workflowId, 'Pharmacist');
      // Advance to AWAITING_CLINICAL_REVIEW
      await orchestrator.advanceWorkflow(workflow.workflowId, 'Pharmacist');

      // Resolve review
      const ctx = orchestrator.getWorkflow(workflow.workflowId)!;
      const review = ctx.pendingHumanApprovals[0];

      await orchestrator.resolveHumanReview(workflow.workflowId, review.id, {
        status: 'approved',
        reviewerIdentity: 'Dr. Sarah Lin, PharmD',
        reviewerRole: 'clinical_pharmacist',
        targetVersion: review.itemVersion,
      });

      // Approval record exists in SQLite
      const dbApprovals = approvalRepo.findByReviewRequestId(review.id);
      expect(dbApprovals.length).toBeGreaterThan(0);
      expect(dbApprovals[0].reviewerIdentity).toBe('Dr. Sarah Lin, PharmD');

      // Workflow state remains AWAITING_CLINICAL_REVIEW (NOT COMPLETED!)
      const ctxAfterApproval = orchestrator.getWorkflow(workflow.workflowId)!;
      expect(ctxAfterApproval.state).toBe('AWAITING_CLINICAL_REVIEW');

      // Attempting to jump directly to COMPLETED without schedule preparation fails
      await expect(
        orchestrator.advanceWorkflow(workflow.workflowId, 'Pharmacist', 'COMPLETED')
      ).rejects.toThrow();
    });

    it('rejects transitioning to COMPLETED if human clinician has not approved schedule draft', async () => {
      const workflow = await orchestrator.createWorkflow({
        patientId: P1_ID,
        actor: 'Clinical Pharmacist',
      });

      const ctx = orchestrator.getWorkflow(workflow.workflowId)!;
      ctx.state = 'AWAITING_SCHEDULE_REVIEW';
      // Deliberately do not set humanApprovedOutcomes.scheduleApproved
      ctx.humanApprovedOutcomes = {
        interactionReviewApproved: true,
        scheduleApproved: false,
      };
      workflowRepo.update(ctx);

      // Advancing to COMPLETED must throw prerequisite / invalid transition error
      await expect(
        orchestrator.advanceWorkflow(workflow.workflowId, 'Pharmacist', 'COMPLETED')
      ).rejects.toThrow();
    });
  });

  // =========================================================================
  // RULE 7: Role-based review permissions enforced on server
  // =========================================================================
  describe('Rule 7: Role-based review permissions enforced on server', () => {
    it('forbids registered nurse from approving drug-drug interactions or medication identities', async () => {
      const wf = await orchestrator.createWorkflow({
        patientId: P1_ID,
        actor: 'Intake',
      });

      const ddiReview = reviewService.createRequest({
        workflowId: wf.workflowId,
        category: 'potentially_significant_interaction',
        reason: 'Apixaban + Fluconazole major CYP3A4 inhibition',
        supportingEvidenceReferences: ['PMID:24608939'],
        requestedReviewerAction: 'Clinical assessment of bleeding risk',
        targetEntityType: 'interaction',
        targetEntityId: 'int-1',
        itemVersion: 1,
      });

      // Nurse attempted resolution must throw UnauthorizedReviewerRoleError
      expect(() =>
        reviewService.resolveRequest(
          ddiReview.id,
          {
            status: 'approved',
            reviewerIdentity: 'Nurse Kelly, RN',
            reviewerRole: 'registered_nurse',
            targetVersion: 1,
          },
          1
        )
      ).toThrow(UnauthorizedReviewerRoleError);
    });

    it('allows registered nurse to resolve scheduling constraint reviews', async () => {
      const wf = await orchestrator.createWorkflow({
        patientId: P1_ID,
        actor: 'Intake',
      });

      const constraintReview = reviewService.createRequest({
        workflowId: wf.workflowId,
        category: 'conflicting_scheduling_constraints',
        reason: 'Levothyroxine must be administered 4 hours away from calcium carbonate',
        supportingEvidenceReferences: [],
        requestedReviewerAction: 'Confirm ward administration timing',
        targetEntityType: 'constraint',
        targetEntityId: 'c-1',
        itemVersion: 1,
      });

      // Nurse resolving scheduling constraint succeeds!
      const resolved = reviewService.resolveRequest(
        constraintReview.id,
        {
          status: 'approved',
          reviewerIdentity: 'Nurse Kelly, RN',
          reviewerRole: 'registered_nurse',
          reviewerNotes: 'Scheduled Levothyroxine at 06:00 and Calcium at 12:00',
          targetVersion: 1,
        },
        1
      );

      expect(resolved.request.status).toBe('approved');
      expect(resolved.approvalRecord.reviewerRole).toBe('registered_nurse');
    });

    it('allows clinical pharmacist and attending physician to resolve all review categories', async () => {
      const wf = await orchestrator.createWorkflow({
        patientId: P1_ID,
        actor: 'Intake',
      });

      const categories: ReviewCategory[] = [
        'medication_identity_clarification',
        'missing_prescription_instructions',
        'potentially_significant_interaction',
        'insufficient_clinical_evidence',
        'conflicting_scheduling_constraints',
        'schedule_review',
      ];

      for (const cat of categories) {
        const req = reviewService.createRequest({
          workflowId: wf.workflowId,
          category: cat,
          reason: `Review for ${cat}`,
          supportingEvidenceReferences: [],
          requestedReviewerAction: 'Review and verify',
          targetEntityType: 'medication',
          targetEntityId: `ent-${cat}`,
          itemVersion: 1,
        });

        const res = reviewService.resolveRequest(
          req.id,
          {
            status: 'approved',
            reviewerIdentity: 'Dr. Sarah Lin, PharmD',
            reviewerRole: 'clinical_pharmacist',
            reviewerNotes: `Signoff for ${cat}`,
            targetVersion: 1,
          },
          1
        );

        expect(res.request.status).toBe('approved');
        expect(res.approvalRecord.reviewerRole).toBe('clinical_pharmacist');
      }
    });
  });

  // =========================================================================
  // MCP TOOLS: get_review_queue, get_approval_records, resolve_review_request
  // =========================================================================
  describe('MCP Tools: Review Queue, Approval Records & Signoff', () => {
    it('inspects review queue via get_review_queue tool', async () => {
      const wf = await orchestrator.createWorkflow({
        patientId: P1_ID,
        actor: 'MCP Test',
      });

      reviewService.createRequest({
        workflowId: wf.workflowId,
        category: 'missing_prescription_instructions',
        reason: 'Missing duration of therapy',
        supportingEvidenceReferences: [],
        requestedReviewerAction: 'Contact prescriber',
        targetEntityType: 'medication',
        targetEntityId: 'med-99',
        itemVersion: 1,
      });

      const response = await dispatchTool(
        'get_review_queue',
        { workflowId: wf.workflowId, status: 'pending' },
        engineService
      );

      expect(response.isError).toBeFalsy();
      const data = JSON.parse(response.content[0].text);
      expect(data.workflowId).toBe(wf.workflowId);
      expect(data.totalCount).toBeGreaterThanOrEqual(1);
      expect(data.reviews[0].category).toBe('missing_prescription_instructions');
    });

    it('retrieves approval records via get_approval_records tool', async () => {
      const wf = await orchestrator.createWorkflow({
        patientId: P1_ID,
        actor: 'MCP Test',
      });

      const req = reviewService.createRequest({
        workflowId: wf.workflowId,
        category: 'schedule_review',
        reason: 'Final schedule approval',
        supportingEvidenceReferences: [],
        requestedReviewerAction: 'Sign off schedule',
        targetEntityType: 'schedule',
        targetEntityId: 'sched-1',
        itemVersion: 1,
      });

      reviewService.resolveRequest(
        req.id,
        {
          status: 'approved',
          reviewerIdentity: 'Dr. Arthur Conan, MD',
          reviewerRole: 'attending_physician',
          reviewerNotes: 'Schedule approved for discharge',
          targetVersion: 1,
        },
        1
      );

      const response = await dispatchTool(
        'get_approval_records',
        { workflowId: wf.workflowId },
        engineService
      );

      expect(response.isError).toBeFalsy();
      const data = JSON.parse(response.content[0].text);
      expect(data.workflowId).toBe(wf.workflowId);
      expect(data.activeCount).toBe(1);
      expect(data.approvals[0].reviewerIdentity).toBe('Dr. Arthur Conan, MD');
      expect(data.approvals[0].category).toBe('schedule_review');
    });

    it('resolves review request via resolve_review_request tool with role enforcement', async () => {
      const wf = await orchestrator.createWorkflow({
        patientId: P1_ID,
        actor: 'MCP Test',
      });

      const req = reviewService.createRequest({
        workflowId: wf.workflowId,
        category: 'conflicting_scheduling_constraints',
        reason: 'Food-drug timing conflict',
        supportingEvidenceReferences: [],
        requestedReviewerAction: 'Confirm administration timing with meals',
        targetEntityType: 'constraint',
        targetEntityId: 'c-2',
        itemVersion: 1,
      });

      const response = await dispatchTool(
        'resolve_review_request',
        {
          reviewId: req.id,
          status: 'approved',
          reviewerIdentity: 'Nurse Kelly, RN',
          reviewerRole: 'registered_nurse',
          reviewerNotes: 'Confirmed patient meal times adjusted',
          targetVersion: 1,
        },
        engineService
      );

      expect(response.isError).toBeFalsy();
      const data = JSON.parse(response.content[0].text);
      expect(data.status).toBe('approved');
      expect(data.reviewerIdentity).toBe('Nurse Kelly, RN');
      expect(data.reviewerRole).toBe('registered_nurse');
      expect(data.approvalRecord).toBeDefined();
      expect(data.approvalRecord.decision).toBe('approved');
    });
  });
});
