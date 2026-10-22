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
import { ToolExecutionRepository } from '../../src/server/repositories/toolExecutionRepository.js';
import { AuditService } from '../../src/server/services/auditService.js';
import { ChronoService } from '../../src/server/services/chrono/chronoService.js';
import { CircadianScheduleCoordinator } from '../../src/server/services/chrono/scheduleCoordinator.js';
import { LocalDrugReferenceProvider } from '../../src/server/services/interactions/referenceDataProvider.js';
import { LocalInteractionEvidenceProvider } from '../../src/server/services/interactions/interactionEvidenceProvider.js';
import { PharmacokineticConflictEngine } from '../../src/server/services/interactions/conflictEngine.js';
import { LocalOCREngine } from '../../src/server/services/ocr/ocrEngine.js';
import { OCRExtractionService } from '../../src/server/services/ocr/ocrExtractionService.js';
import { LocalRxNormTerminologyProvider } from '../../src/server/services/ocr/terminologyProvider.js';
import { DrugNormalizationService } from '../../src/server/services/ocr/normalizationService.js';
import { ReviewRequestService } from '../../src/server/services/orchestration/reviewRequestService.js';
import { ToolRegistry } from '../../src/server/services/orchestration/tools/toolRegistry.js';
import { createClinicalTools } from '../../src/server/services/orchestration/tools/clinicalTools.js';
import { AgenticWorkflowOrchestrator } from '../../src/server/services/orchestration/agenticWorkflowOrchestrator.js';
import {
  ALL_AGENT_DECLARATIONS,
  getAgentDeclaration,
  validateAgentToolAuthorization,
  isToolPermittedForAgent,
} from '../../src/server/services/orchestration/agents/agentContracts.js';
import {
  sanitizeToolInput,
  computeSanitizedInputHash,
} from '../../src/server/services/orchestration/tools/sanitizer.js';

describe('Phase 2: Agent Tool Contracts, Capability Declarations & Execution Records', () => {
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
      executionRepo
    );
  });

  afterEach(() => {
    db.close();
  });

  // ==========================================
  // 1. CAPABILITY DECLARATIONS & POLICIES
  // ==========================================
  describe('Agent Capability Declarations & Tool Authorization Boundaries', () => {
    it('declares valid contracts and policies for all 3 specialized agents', () => {
      expect(ALL_AGENT_DECLARATIONS.prescription_agent).toBeDefined();
      expect(ALL_AGENT_DECLARATIONS.interaction_agent).toBeDefined();
      expect(ALL_AGENT_DECLARATIONS.scheduling_agent).toBeDefined();

      const rxAgent = getAgentDeclaration('prescription_agent');
      expect(rxAgent.permittedTools).toContain('submit_candidate_medications');
      expect(rxAgent.permittedTools).toContain('parse_prescription');
      expect(rxAgent.prohibitedTools).toContain('confirm_medication');
      expect(rxAgent.humanApprovalPolicy).toContain('Explicit human clinician');

      const ixAgent = getAgentDeclaration('interaction_agent');
      expect(ixAgent.permittedTools).toContain('check_interactions');
      expect(ixAgent.permittedTools).toContain('get_interaction_evidence');
      expect(ixAgent.prohibitedTools).toContain('confirm_medication');
      expect(ixAgent.prohibitedTools).toContain('propose_schedule_draft');

      const schedAgent = getAgentDeclaration('scheduling_agent');
      expect(schedAgent.permittedTools).toContain('evaluate_schedule_constraints');
      expect(schedAgent.permittedTools).toContain('propose_schedule_draft');
      expect(schedAgent.prohibitedTools).toContain('confirm_medication');
      expect(schedAgent.postconditions).toContain('Preserves 100% of prescribed doses, formulations, and instructions (zero dose modification).');
    });

    it('rejects unknown agent identifiers', () => {
      expect(() => getAgentDeclaration('arbitrary_agent' as any)).toThrow(/Unknown agent identifier/);
    });

    it('validates tool authorization correctly per agent', () => {
      expect(isToolPermittedForAgent('prescription_agent', 'submit_candidate_medications')).toBe(true);
      expect(isToolPermittedForAgent('prescription_agent', 'confirm_medication')).toBe(false);

      expect(isToolPermittedForAgent('interaction_agent', 'check_interactions')).toBe(true);
      expect(isToolPermittedForAgent('interaction_agent', 'submit_candidate_medications')).toBe(false);

      expect(isToolPermittedForAgent('scheduling_agent', 'propose_schedule_draft')).toBe(true);
      expect(isToolPermittedForAgent('scheduling_agent', 'check_interactions')).toBe(false);

      // Throws UnauthorizedToolExecutionError for unauthorized tool
      expect(() =>
        validateAgentToolAuthorization('prescription_agent', 'confirm_medication')
      ).toThrow(/prohibited for agent "prescription_agent"/);
    });
  });

  // ==========================================
  // 2. CAPABILITY 1: PRESCRIPTION AGENT GUARDRAILS
  // ==========================================
  describe('Capability 1: Prescription OCR & Normalization Agent Guardrails', () => {
    it('submits candidate medication records strictly as unverified and creates review requests', async () => {
      const patient = patientRepo.findAll()[0];
      const wf = await orchestrator.createWorkflow({
        patientId: patient.id,
        actor: 'Intake Staff',
      });

      // Prescription agent calls submit_candidate_medications
      const result = await toolRegistry.executeTool(
        'submit_candidate_medications',
        {
          workflowId: wf.workflowId,
          candidates: [
            {
              rawText: 'Metformin 500mg BID with meals',
              brand: 'Glucophage',
              genericName: 'metformin',
              dose: '500 mg',
              frequency: 'BID',
              route: 'oral',
              confidence: 0.95,
              status: 'unverified',
            },
            {
              rawText: 'Furosemide ??mg daily in morning',
              brand: 'Lasix',
              genericName: 'furosemide',
              // missing dose
              frequency: 'daily',
              route: 'oral',
              confidence: 0.72, // low confidence
              status: 'unverified',
            },
          ],
        },
        {
          actor: 'prescription_agent',
          actorRole: 'assistant',
          agentId: 'prescription_agent',
          workflowId: wf.workflowId,
        }
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.submittedCount).toBe(2);
        expect(result.data.requiresClinicianConfirmation).toBe(true);
        expect(result.data.createdReviewRequestIds.length).toBe(2);
      }

      const updated = orchestrator.getWorkflow(wf.workflowId)!;
      expect(updated.unverifiedMedicationCandidates.length).toBe(2);
      expect(updated.unverifiedMedicationCandidates.every((c) => c.status === 'unverified')).toBe(true);

      // Review requests created for human clinician review
      expect(updated.pendingHumanApprovals.length).toBe(2);
      const ambiguousReview = updated.pendingHumanApprovals.find((r) =>
        r.reason.includes('Low-confidence or incomplete candidate order')
      );
      expect(ambiguousReview).toBeDefined();
      expect(ambiguousReview?.status).toBe('pending');
    });

    it('CRITICAL SAFETY: prescription agent is strictly blocked from calling confirm_medication', async () => {
      const patient = patientRepo.findAll()[0];
      const med = medRepo.findByPatientId(patient.id)[0];

      // Prescription agent tries to confirm medication
      const res = await toolRegistry.executeTool(
        'confirm_medication',
        {
          medicationId: med.id,
          actor: 'prescription_agent',
          justification: 'Automated agent attempting confirmation',
          confirmationToken: 'CONFIRM_MUTATION',
        },
        {
          actor: 'prescription_agent',
          actorRole: 'assistant',
          agentId: 'prescription_agent',
        }
      );

      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.code).toBe('UNAUTHORIZED_ACCESS');
        expect(res.error.message).toContain('prohibited for agent "prescription_agent"');
      }
    });
  });

  // ==========================================
  // 3. CAPABILITY 2: INTERACTION AGENT GUARDRAILS
  // ==========================================
  describe('Capability 2: Pharmacokinetic Conflict Engine Agent Guardrails', () => {
    it('evaluates deterministic rules and evidence without inventing clinical findings', async () => {
      const eleanor = patientRepo.findAll().find((p) => p.name.includes('Eleanor'))!;

      const result = await toolRegistry.executeTool(
        'check_interactions',
        { patientId: eleanor.id },
        {
          actor: 'interaction_agent',
          actorRole: 'assistant',
          agentId: 'interaction_agent',
        }
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.engineVersion).toBeDefined();
        expect(result.data.findings).toBeInstanceOf(Array);
        // Eleanor has duplicate APAP and apixaban+naproxen interaction
        expect(result.data.findings.length).toBeGreaterThan(0);
        expect(result.data.duplicateIngredients.length).toBeGreaterThan(0);
      }

      // Interaction agent retrieves authoritative evidence
      const evResult = await toolRegistry.executeTool(
        'get_interaction_evidence',
        { ingredientA: 'apixaban', ingredientB: 'naproxen' },
        {
          actor: 'interaction_agent',
          actorRole: 'assistant',
          agentId: 'interaction_agent',
        }
      );

      expect(evResult.success).toBe(true);
      if (evResult.success) {
        expect(evResult.data.found).toBe(true);
        expect(evResult.data.evidence.sourceCitation).toContain('FDA');
        expect(evResult.data.datasetVersion).toBeDefined();
      }
    });

    it('CRITICAL SAFETY: interaction agent is prohibited from calling mutating or scheduling tools', async () => {
      const res = await toolRegistry.executeTool(
        'propose_schedule_draft',
        { workflowId: 'wf-test', patientId: 'p-test' },
        {
          actor: 'interaction_agent',
          actorRole: 'assistant',
          agentId: 'interaction_agent',
        }
      );

      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.code).toBe('UNAUTHORIZED_ACCESS');
        expect(res.error.message).toContain('prohibited for agent "interaction_agent"');
      }
    });
  });

  // ==========================================
  // 4. CAPABILITY 3: SCHEDULING AGENT GUARDRAILS
  // ==========================================
  describe('Capability 3: Circadian Schedule Coordinator Agent Guardrails', () => {
    it('proposes draft schedule preserving 100% of prescribed doses and cannot self-approve', async () => {
      const eleanor = patientRepo.findAll().find((p) => p.name.includes('Eleanor'))!;
      const wf = await orchestrator.createWorkflow({
        patientId: eleanor.id,
        actor: 'Clinical Team',
      });

      const result = await toolRegistry.executeTool(
        'propose_schedule_draft',
        { workflowId: wf.workflowId, patientId: eleanor.id },
        {
          actor: 'scheduling_agent',
          actorRole: 'assistant',
          agentId: 'scheduling_agent',
          workflowId: wf.workflowId,
        }
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.prescribedDosesPreserved100Percent).toBe(true);
        expect(result.data.requiresClinicianApproval).toBe(true);
        expect(result.data.totalSlots).toBeGreaterThan(0);
      }

      const updated = orchestrator.getWorkflow(wf.workflowId)!;
      expect(updated.proposedSchedules).toBeDefined();
      // CRITICAL: Cannot self-approve
      expect(updated.humanApprovedOutcomes?.scheduleApproved).toBe(false);

      // Schedule review request was automatically created
      const schedReview = updated.pendingHumanApprovals.find(
        (r) => r.category === 'schedule_review'
      );
      expect(schedReview).toBeDefined();
      expect(schedReview?.status).toBe('pending');
    });

    it('CRITICAL SAFETY: scheduling agent cannot mark its own schedule approved', async () => {
      const schedAgent = getAgentDeclaration('scheduling_agent');
      expect(schedAgent.prohibitedTools).toContain('confirm_medication');
      expect(schedAgent.prohibitedTools).toContain('resolve_review_request');

      expect(() =>
        validateAgentToolAuthorization('scheduling_agent', 'resolve_review_request')
      ).toThrow(/prohibited for agent "scheduling_agent"/);
    });
  });

  // ==========================================
  // 5. CAPABILITY 4: ORCHESTRATOR DECISION ENGINE
  // ==========================================
  describe('Capability 4: Orchestrator determineNextOperation', () => {
    it('determines the next permitted operation, agent, and dependencies across lifecycle', async () => {
      const patient = patientRepo.findAll()[0];
      const wf = await orchestrator.createWorkflow({
        patientId: patient.id,
        prescriptionDocumentId: 'doc-rx-01',
        prescriptionFilePath: 'data/test-fixtures/rx_01_clean_printed.png',
        actor: 'Dr. Sarah',
      });

      // 1. Initial State: CREATED
      let decision = orchestrator.determineNextOperation(wf.workflowId);
      expect(decision.currentState).toBe('CREATED');
      expect(decision.nextOperation).toBe('RETRIEVE_PATIENT_CONTEXT');
      expect(decision.permittedAgent).toBe('prescription_agent');
      expect(decision.permittedTools).toContain('get_patient_context');
      expect(decision.canAutoAdvance).toBe(true);

      // Advance to RETRIEVING_PATIENT_CONTEXT -> EXTRACTING_PRESCRIPTION
      await orchestrator.advanceWorkflow(wf.workflowId);
      decision = orchestrator.determineNextOperation(wf.workflowId);
      expect(decision.permittedAgent).toBe('prescription_agent');

      // Add unverified candidate to simulate AWAITING_MEDICATION_CONFIRMATION
      const context = orchestrator.getWorkflow(wf.workflowId)!;
      context.state = 'AWAITING_MEDICATION_CONFIRMATION';
      context.unverifiedMedicationCandidates = [
        {
          id: 'cand-01',
          rawText: 'Warfarin 2mg QD',
          confidence: 0.6,
          status: 'unverified',
        },
      ];
      workflowRepo.update(context);

      // In AWAITING_MEDICATION_CONFIRMATION: blocked on human clinician
      decision = orchestrator.determineNextOperation(wf.workflowId);
      expect(decision.currentState).toBe('AWAITING_MEDICATION_CONFIRMATION');
      expect(decision.permittedAgent).toBe('human_clinician');
      expect(decision.permittedTools).toContain('confirm_medication');
      expect(decision.prohibitedTools).toContain('check_interactions');
      expect(decision.canAutoAdvance).toBe(false);
      expect(decision.blockingDependencies.length).toBeGreaterThan(0);

      // In MEDICATIONS_CONFIRMED: next is interaction_agent
      context.state = 'MEDICATIONS_CONFIRMED';
      context.unverifiedMedicationCandidates = [];
      workflowRepo.update(context);

      decision = orchestrator.determineNextOperation(wf.workflowId);
      expect(decision.currentState).toBe('MEDICATIONS_CONFIRMED');
      expect(decision.permittedAgent).toBe('interaction_agent');
      expect(decision.permittedTools).toContain('check_interactions');
      expect(decision.canAutoAdvance).toBe(true);

      // In PREPARING_SCHEDULE: next is scheduling_agent
      context.state = 'PREPARING_SCHEDULE';
      workflowRepo.update(context);

      decision = orchestrator.determineNextOperation(wf.workflowId);
      expect(decision.currentState).toBe('PREPARING_SCHEDULE');
      expect(decision.permittedAgent).toBe('scheduling_agent');
      expect(decision.permittedTools).toContain('propose_schedule_draft');
      expect(decision.canAutoAdvance).toBe(true);

      // In AWAITING_SCHEDULE_REVIEW: blocked on human clinician
      context.state = 'AWAITING_SCHEDULE_REVIEW';
      workflowRepo.update(context);

      decision = orchestrator.determineNextOperation(wf.workflowId);
      expect(decision.currentState).toBe('AWAITING_SCHEDULE_REVIEW');
      expect(decision.permittedAgent).toBe('human_clinician');
      expect(decision.canAutoAdvance).toBe(false);

      // In COMPLETED: no further operation
      context.state = 'COMPLETED';
      workflowRepo.update(context);

      decision = orchestrator.determineNextOperation(wf.workflowId);
      expect(decision.currentState).toBe('COMPLETED');
      expect(decision.nextOperation).toBe('NONE');
      expect(decision.permittedAgent).toBe('none');
      expect(decision.canAutoAdvance).toBe(false);
    });
  });

  // ==========================================
  // 6. TOOL EXECUTION RECORDS & SANITIZED HASHING
  // ==========================================
  describe('Tool Execution Records & Input Sanitization', () => {
    it('redacts binary buffers and credentials, producing deterministic SHA-256 hash', () => {
      const rawInputWithBuffer = {
        patientId: 'patient-123',
        documentBuffer: Buffer.from('FAKE_BINARY_IMAGE_BYTES'),
        secretToken: 'secret_value_123',
        filePath: 'C:\\Users\\admin\\sensitive\\rx_image.png',
      };

      const sanitized = sanitizeToolInput('parse_prescription', rawInputWithBuffer);
      expect(sanitized.documentBuffer).toBe('[REDACTED_BINARY_BUFFER]');
      expect(sanitized.filePath).toBe('rx_image.png');

      const hash1 = computeSanitizedInputHash('parse_prescription', rawInputWithBuffer);
      const hash2 = computeSanitizedInputHash('parse_prescription', {
        filePath: 'C:\\Users\\admin\\sensitive\\rx_image.png',
        patientId: 'patient-123',
        secretToken: 'secret_value_123',
        documentBuffer: Buffer.from('FAKE_BINARY_IMAGE_BYTES'),
      });

      // Key order does not affect hash
      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^[a-f0-9]{64}$/);
    });

    it('records immutable tool executions in SQLite tool_executions table', async () => {
      const patient = patientRepo.findAll()[0];
      const wf = await orchestrator.createWorkflow({
        patientId: patient.id,
        actor: 'Auditor',
      });

      // Execute tool
      const res = await toolRegistry.executeTool(
        'get_patient_context',
        { patientId: patient.id },
        {
          actor: 'Dr. Jane',
          actorRole: 'clinician',
          agentId: 'prescription_agent',
          workflowId: wf.workflowId,
        }
      );

      expect(res.success).toBe(true);
      expect(res.executionRecord).toBeDefined();
      expect(res.executionRecord?.toolName).toBe('get_patient_context');
      expect(res.executionRecord?.inputHash).toMatch(/^[a-f0-9]{64}$/);
      expect(res.executionRecord?.durationMs).toBeGreaterThanOrEqual(0);

      // Verify persisted in repository
      const executions = executionRepo.findByWorkflowId(wf.workflowId);
      expect(executions.length).toBeGreaterThanOrEqual(1);
      const latest = executions[executions.length - 1];
      expect(latest.toolName).toBe('get_patient_context');
      expect(latest.status).toBe('success');
      expect(latest.agentId).toBe('prescription_agent');
    });

    it('records structured errors when tool validation fails or prohibited tool is invoked', async () => {
      const patient = patientRepo.findAll()[0];
      const wf = await orchestrator.createWorkflow({
        patientId: patient.id,
        actor: 'Auditor',
      });

      // 1. Malformed input (missing required field)
      const badInputRes = await toolRegistry.executeTool(
        'get_patient_context',
        { wrongField: 123 },
        {
          actor: 'Test Actor',
          workflowId: wf.workflowId,
        }
      );

      expect(badInputRes.success).toBe(false);
      expect(badInputRes.executionRecord?.status).toBe('failed');
      expect(badInputRes.executionRecord?.error?.code).toBe('INVALID_INPUT');

      // 2. Prohibited tool invocation
      const prohibitedRes = await toolRegistry.executeTool(
        'system_shell',
        { cmd: 'whoami' },
        {
          actor: 'Test Actor',
          workflowId: wf.workflowId,
        }
      );

      expect(prohibitedRes.success).toBe(false);
      expect(prohibitedRes.executionRecord?.status).toBe('blocked');
      expect(prohibitedRes.executionRecord?.error?.code).toBe('SECURITY_VIOLATION');
    });
  });
});
