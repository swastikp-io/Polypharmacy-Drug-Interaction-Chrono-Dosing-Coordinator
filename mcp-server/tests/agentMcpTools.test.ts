import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { initializeSchema } from '../../src/server/db/database.js';
import { seedSyntheticData } from '../../src/server/db/seeds.js';
import { ClinicalEngineService } from '../src/services/clinicalEngineService.js';
import { dispatchTool, MCP_TOOLS } from '../src/tools/registry.js';

describe('Phase 2: Agent Tool Contracts & MCP Integration', () => {
  let db: Database.Database;
  let engine: ClinicalEngineService;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    initializeSchema(db);
    seedSyntheticData(db);

    engine = ClinicalEngineService.createWithDb(db);
  });

  afterEach(() => {
    db.close();
  });

  // ==========================================
  // 1. GET AGENT CAPABILITIES MCP TOOL
  // ==========================================
  describe('Tool: get_agent_capabilities', () => {
    it('returns capability declarations for all 3 agents when no agentId is specified', async () => {
      const response = await dispatchTool('get_agent_capabilities', {}, engine);
      expect(response.isError).toBeFalsy();

      const data = JSON.parse(response.content[0].text);
      expect(data.agents).toBeInstanceOf(Array);
      expect(data.agents.length).toBe(3);

      const agentIds = data.agents.map((a: any) => a.agentId);
      expect(agentIds).toContain('prescription_agent');
      expect(agentIds).toContain('interaction_agent');
      expect(agentIds).toContain('scheduling_agent');
    });

    it('returns specific declaration for a single requested agent', async () => {
      const response = await dispatchTool(
        'get_agent_capabilities',
        { agentId: 'scheduling_agent' },
        engine
      );
      expect(response.isError).toBeFalsy();

      const data = JSON.parse(response.content[0].text);
      expect(data.agent).toBeDefined();
      expect(data.agent.agentId).toBe('scheduling_agent');
      expect(data.agent.permittedTools).toContain('propose_schedule_draft');
      expect(data.agent.prohibitedTools).toContain('confirm_medication');
    });
  });

  // ==========================================
  // 2. ORCHESTRATOR GET STATE & STEP MCP TOOLS
  // ==========================================
  describe('Tools: orchestrator_get_state & orchestrator_step', () => {
    it('inspects workflow state and executes stepwise progression through MCP', async () => {
      const patient = engine.patientRepo.findAll()[0];
      const wf = await engine.agenticOrchestrator.createWorkflow({
        patientId: patient.id,
        actor: 'MCP Test Harness',
      });

      // 1. orchestrator_get_state
      const stateResponse = await dispatchTool(
        'orchestrator_get_state',
        { workflowId: wf.workflowId },
        engine
      );
      expect(stateResponse.isError).toBeFalsy();

      const stateData = JSON.parse(stateResponse.content[0].text);
      expect(stateData.workflowId).toBe(wf.workflowId);
      expect(stateData.state).toBe('CREATED');
      expect(stateData.nextOperationDecision).toBeDefined();
      expect(stateData.nextOperationDecision.permittedAgent).toBe('prescription_agent');
      expect(stateData.nextOperationDecision.canAutoAdvance).toBe(true);

      // 2. orchestrator_step: advances from CREATED to RETRIEVING_PATIENT_CONTEXT
      const stepResponse = await dispatchTool(
        'orchestrator_step',
        { workflowId: wf.workflowId, actor: 'Claude Desktop MCP' },
        engine
      );
      expect(stepResponse.isError).toBeFalsy();

      const stepData = JSON.parse(stepResponse.content[0].text);
      expect(stepData.workflowId).toBe(wf.workflowId);
      expect(stepData.version).toBeGreaterThan(1);
    });
  });

  // ==========================================
  // 3. PRESCRIPTION AGENT: submit_candidate_medications
  // ==========================================
  describe('Tool: submit_candidate_medications (Prescription Agent)', () => {
    it('submits candidate orders strictly as unverified and enforces clinician review requirement', async () => {
      const patient = engine.patientRepo.findAll()[0];
      const wf = await engine.agenticOrchestrator.createWorkflow({
        patientId: patient.id,
        actor: 'Dr. Roberts',
      });

      const response = await dispatchTool(
        'submit_candidate_medications',
        {
          workflowId: wf.workflowId,
          documentId: 'doc-rx-synthetic-01',
          candidates: [
            {
              rawText: 'Lisinopril 10mg once daily in morning',
              brand: 'Prinivil',
              genericName: 'lisinopril',
              dose: '10 mg',
              frequency: 'daily',
              route: 'oral',
              confidence: 0.96,
            },
          ],
        },
        engine
      );

      expect(response.isError).toBeFalsy();
      const data = JSON.parse(response.content[0].text);
      expect(data.submittedCount).toBe(1);
      expect(data.requiresClinicianConfirmation).toBe(true);
      expect(data.unverifiedCandidateIds.length).toBe(1);

      // Verify workflow state was updated with unverified candidates
      const updatedWf = engine.agenticOrchestrator.getWorkflow(wf.workflowId)!;
      expect(updatedWf.unverifiedMedicationCandidates[0].status).toBe('unverified');
    });
  });

  // ==========================================
  // 4. SCHEDULING AGENT: propose_schedule_draft
  // ==========================================
  describe('Tool: propose_schedule_draft (Scheduling Agent)', () => {
    it('proposes draft schedule with 100% preserved doses and draft status', async () => {
      const eleanor = engine.patientRepo.findAll().find((p) => p.name.includes('Eleanor'))!;
      const wf = await engine.agenticOrchestrator.createWorkflow({
        patientId: eleanor.id,
        actor: 'Clinical Team',
      });

      const response = await dispatchTool(
        'propose_schedule_draft',
        {
          workflowId: wf.workflowId,
          patientId: eleanor.id,
          allowTimingShifts: true,
        },
        engine
      );

      expect(response.isError).toBeFalsy();
      const data = JSON.parse(response.content[0].text);
      expect(data.prescribedDosesPreserved100Percent).toBe(true);
      expect(data.requiresClinicianApproval).toBe(true);
      expect(data.totalSlots).toBeGreaterThan(0);
      expect(data.totalDoses).toBeGreaterThan(0);

      // Verify scheduleApproved in context is false
      const updatedWf = engine.agenticOrchestrator.getWorkflow(wf.workflowId)!;
      expect(updatedWf.humanApprovedOutcomes?.scheduleApproved).toBe(false);
    });
  });

  // ==========================================
  // 5. HUMAN CLINICIAN: resolve_review_request
  // ==========================================
  describe('Tool: resolve_review_request', () => {
    it('allows authorized human clinician to resolve review request with targetVersion verification', async () => {
      const patient = engine.patientRepo.findAll()[0];
      const wf = await engine.agenticOrchestrator.createWorkflow({
        patientId: patient.id,
        actor: 'Staff',
      });

      // Create a test review request
      const review = engine.reviewRequestService.createRequest({
        workflowId: wf.workflowId,
        category: 'medication_identity_clarification',
        reason: 'Uncertain brand name on prescription',
        supportingEvidenceReferences: [],
        requestedReviewerAction: 'Confirm active ingredient',
        targetEntityType: 'medication',
        targetEntityId: 'med-test-01',
        itemVersion: wf.version,
      });

      // 1. Clinician approval with matching version
      const response = await dispatchTool(
        'resolve_review_request',
        {
          reviewId: review.id,
          status: 'approved',
          reviewerIdentity: 'Dr. Alice, PharmD',
          reviewerNotes: 'Verified against pharmacy dispensing records.',
          targetVersion: wf.version,
        },
        engine
      );

      expect(response.isError).toBeFalsy();
      const data = JSON.parse(response.content[0].text);
      expect(data.reviewId).toBe(review.id);
      expect(data.status).toBe('approved');
      expect(data.reviewerIdentity).toBe('Dr. Alice, PharmD');

      // 2. Reject AI impersonation
      const review2 = engine.reviewRequestService.createRequest({
        workflowId: wf.workflowId,
        category: 'schedule_review',
        reason: 'Schedule approval required',
        supportingEvidenceReferences: [],
        requestedReviewerAction: 'Approve diurnal schedule',
        targetEntityType: 'schedule',
        targetEntityId: wf.workflowId,
        itemVersion: wf.version,
      });

      const aiResponse = await dispatchTool(
        'resolve_review_request',
        {
          reviewId: review2.id,
          status: 'approved',
          reviewerIdentity: 'Claude AI Assistant',
          targetVersion: wf.version,
        },
        engine
      );

      expect(aiResponse.isError).toBe(true);
      expect(aiResponse.content[0].text).toContain('strictly prohibited');
    });
  });

  // ==========================================
  // 6. TOOL EXECUTION AUDITING: get_tool_execution_history
  // ==========================================
  describe('Tool: get_tool_execution_history', () => {
    it('retrieves persistent tool execution history records through MCP', async () => {
      const patient = engine.patientRepo.findAll()[0];
      const wf = await engine.agenticOrchestrator.createWorkflow({
        patientId: patient.id,
        actor: 'Audit Officer',
      });

      // Execute a tool to populate execution history
      await engine.toolRegistry.executeTool(
        'get_patient_context',
        { patientId: patient.id },
        {
          actor: 'Dr. Jane',
          actorRole: 'clinician',
          agentId: 'prescription_agent',
          workflowId: wf.workflowId,
        }
      );

      const response = await dispatchTool(
        'get_tool_execution_history',
        { workflowId: wf.workflowId },
        engine
      );

      expect(response.isError).toBeFalsy();
      const data = JSON.parse(response.content[0].text);
      expect(data.workflowId).toBe(wf.workflowId);
      expect(data.totalRecords).toBeGreaterThanOrEqual(1);
      expect(data.executions[0].toolName).toBe('get_patient_context');
      expect(data.executions[0].inputHash).toBeDefined();
    });
  });

  // ==========================================
  // 7. INPUT VALIDATION & ERROR HANDLING
  // ==========================================
  describe('Malformed Argument Validation Handling', () => {
    it('returns structured error output when mandatory tool arguments are missing', async () => {
      const response = await dispatchTool('orchestrator_get_state', {}, engine);
      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('workflowId');
    });
  });
});
