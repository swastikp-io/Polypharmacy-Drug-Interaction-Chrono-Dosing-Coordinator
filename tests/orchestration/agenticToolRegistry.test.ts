import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { initializeSchema } from '../../src/server/db/database.js';
import { seedSyntheticData } from '../../src/server/db/seeds.js';
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
import { WorkflowRepository } from '../../src/server/repositories/workflowRepository.js';
import { ReviewRequestRepository } from '../../src/server/repositories/reviewRequestRepository.js';

describe('Capability 2: Typed Tool Registry, Authorization & Input Validation', () => {
  let db: Database.Database;
  let toolRegistry: ToolRegistry;
  let medRepo: MedicationRepository;

  const P2_ID = 'p2222222-2222-2222-2222-222222222222'; // Arthur Pendelton

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
    const reviewRequestRepo = new ReviewRequestRepository(db);

    toolRegistry = new ToolRegistry();
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
      reviewRequestRepo,
    });
    for (const t of tools) toolRegistry.registerTool(t);
  });

  describe('12. Tool Authorization, Input Validation & Security Sandbox', () => {
    it('registers all 9 integrated clinical tools with complete schemas and policies', () => {
      const toolNames = toolRegistry.listTools().map((t) => t.name);

      expect(toolNames).toContain('get_patient_context');
      expect(toolNames).toContain('get_confirmed_medications');
      expect(toolNames).toContain('parse_prescription');
      expect(toolNames).toContain('confirm_medication');
      expect(toolNames).toContain('check_interactions');
      expect(toolNames).toContain('get_interaction_evidence');
      expect(toolNames).toContain('evaluate_schedule_constraints');
      expect(toolNames).toContain('create_review_request');
      expect(toolNames).toContain('get_workflow_status');
    });

    it('successfully executes read-only tool get_patient_context with validated inputs', async () => {
      const res = await toolRegistry.executeTool(
        'get_patient_context',
        { patientId: P2_ID },
        { actor: 'Dr. Jane, MD', actorRole: 'clinician' }
      );

      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.data.patient.name).toBe('Arthur Pendelton');
        expect(res.data.totalMedications).toBeGreaterThan(0);
      }
    });

    it('rejects malformed inputs with structured validation error', async () => {
      const res = await toolRegistry.executeTool(
        'get_patient_context',
        { patientId: '' }, // empty patientId violates min(1)
        { actor: 'Dr. Jane, MD', actorRole: 'clinician' }
      );

      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.code).toBe('INVALID_INPUT');
        expect(res.error.message).toContain('Validation failed');
      }
    });

    it('strictly prohibits dangerous and unauthorized tools (shell, eval, raw sql, arbitrary files)', async () => {
      const dangerousTools = [
        'eval',
        'system_shell',
        'execute_command',
        'write_file',
        'read_arbitrary_file',
        'raw_sql',
        'sql_query',
        'bash',
      ];

      for (const dangerous of dangerousTools) {
        const res = await toolRegistry.executeTool(
          dangerous,
          { command: 'cat /etc/passwd' },
          { actor: 'Hacker', actorRole: 'admin' }
        );

        expect(res.success).toBe(false);
        if (!res.success) {
          expect(res.error.code).toBe('SECURITY_VIOLATION');
          expect(res.error.message).toContain('strictly prohibited');
        }
      }
    });

    it('enforces authorization policy on mutating tool confirm_medication', async () => {
      const med = medRepo.findByPatientId(P2_ID)[0];

      // 1. Rejects if role is assistant (not clinician)
      const nonClinicianRes = await toolRegistry.executeTool(
        'confirm_medication',
        {
          medicationId: med.id,
          actor: 'Assistant Bot',
          justification: 'Auto confirm',
          confirmationToken: 'CONFIRM_MUTATION',
        },
        { actor: 'Assistant Bot', actorRole: 'assistant' }
      );

      expect(nonClinicianRes.success).toBe(false);
      if (!nonClinicianRes.success) {
        expect(nonClinicianRes.error.code).toBe('UNAUTHORIZED_ACCESS');
      }

      // 2. Rejects if actor name is an automated/LLM persona
      const aiRes = await toolRegistry.executeTool(
        'confirm_medication',
        {
          medicationId: med.id,
          actor: 'LLM_Agent_GPT',
          justification: 'AI decided',
          confirmationToken: 'CONFIRM_MUTATION',
        },
        { actor: 'LLM_Agent_GPT', actorRole: 'clinician' }
      );

      expect(aiRes.success).toBe(false);
      if (!aiRes.success) {
        expect(aiRes.error.code).toBe('UNAUTHORIZED_ACCESS');
        expect(aiRes.error.message).toContain('Human clinical credential required');
      }

      // 3. Rejects if confirmationToken is missing
      const noTokenRes = await toolRegistry.executeTool(
        'confirm_medication',
        {
          medicationId: med.id,
          actor: 'Dr. Jane, MD',
          justification: 'Valid review',
          confirmationToken: 'WRONG_TOKEN',
        },
        { actor: 'Dr. Jane, MD', actorRole: 'clinician' }
      );

      expect(noTokenRes.success).toBe(false);

      // 4. Succeeds when clinician credentials and CONFIRM_MUTATION token are supplied
      const successRes = await toolRegistry.executeTool(
        'confirm_medication',
        {
          medicationId: med.id,
          actor: 'Dr. Jane, MD',
          justification: 'Verified against discharge summary',
          confirmationToken: 'CONFIRM_MUTATION',
        },
        {
          actor: 'Dr. Jane, MD',
          actorRole: 'clinician',
          confirmationToken: 'CONFIRM_MUTATION',
        }
      );

      expect(successRes.success).toBe(true);
      if (successRes.success) {
        expect(successRes.data.status).toBe('confirmed');
      }
    });
  });
});
