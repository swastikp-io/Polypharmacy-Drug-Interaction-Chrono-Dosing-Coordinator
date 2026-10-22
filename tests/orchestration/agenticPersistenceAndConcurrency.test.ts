import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { initializeSchema } from '../../src/server/db/database.js';
import { seedSyntheticData } from '../../src/server/db/seeds.js';
import { WorkflowRepository } from '../../src/server/repositories/workflowRepository.js';
import { ReviewRequestRepository } from '../../src/server/repositories/reviewRequestRepository.js';
import { ReviewRequestService } from '../../src/server/services/orchestration/reviewRequestService.js';
import { ToolRegistry } from '../../src/server/services/orchestration/tools/toolRegistry.js';
import { createClinicalTools } from '../../src/server/services/orchestration/tools/clinicalTools.js';
import { AgenticWorkflowOrchestrator } from '../../src/server/services/orchestration/agenticWorkflowOrchestrator.js';
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
import { OptimisticConcurrencyError } from '../../src/server/services/orchestration/stateMachine/errors.js';

describe('Capability 3: Shared State Persistence & Optimistic Concurrency Control', () => {
  let db: Database.Database;
  let workflowRepo: WorkflowRepository;
  let orchestrator: AgenticWorkflowOrchestrator;

  const P2_ID = 'p2222222-2222-2222-2222-222222222222'; // Arthur Pendelton

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initializeSchema(db);
    seedSyntheticData(db);

    const patientRepo = new PatientRepository(db);
    const medRepo = new MedicationRepository(db);
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

  describe('10. Workflow Persistence Across Server Restarts', () => {
    it('persists entire workflow context, operations, and state into database and restores cleanly', async () => {
      // 1. Create workflow and advance through stages on initial orchestrator
      const created = await orchestrator.createWorkflow({
        patientId: P2_ID,
        actor: 'Dr. Test Attending',
      });
      const initialRun = await orchestrator.advanceWorkflow(created.workflowId, 'Dr. Test Attending');

      expect(initialRun.version).toBeGreaterThanOrEqual(1);
      const savedVersion = initialRun.version;
      const savedState = initialRun.state;

      // 2. Simulate server restart: Instantiate completely brand new repository & orchestrator instance
      const newWorkflowRepo = new WorkflowRepository(db);
      const restored = newWorkflowRepo.findById(created.workflowId);

      expect(restored).toBeDefined();
      expect(restored?.workflowId).toBe(created.workflowId);
      expect(restored?.patientId).toBe(P2_ID);
      expect(restored?.state).toBe(savedState);
      expect(restored?.version).toBe(savedVersion);
      expect(restored?.completedOperations.length).toBeGreaterThan(0);
      expect(restored?.workflowVersion).toBe(AgenticWorkflowOrchestrator.VERSION);
    });
  });

  describe('11. Concurrent Workflow Updates (Optimistic Concurrency)', () => {
    it('detects concurrent modifications and rejects conflicting updates with OptimisticConcurrencyError', () => {
      // 1. Create context at version 1
      const context = {
        workflowId: 'wf-concurrency-test',
        patientId: P2_ID,
        state: 'CREATED' as const,
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
        datasetVersions: { rxnorm: '2026.1' },
        workflowVersion: '2026.1-Agentic-Phase1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      workflowRepo.create(context);

      // Thread A reads snapshot at v1
      const snapshotA = workflowRepo.findById(context.workflowId)!;
      expect(snapshotA.version).toBe(1);

      // Thread B reads snapshot at v1
      const snapshotB = workflowRepo.findById(context.workflowId)!;
      expect(snapshotB.version).toBe(1);

      // Thread A updates successfully -> version becomes 2
      snapshotA.state = 'RETRIEVING_PATIENT_CONTEXT';
      workflowRepo.update(snapshotA);
      expect(snapshotA.version).toBe(2);

      // Thread B attempts to update with stale v1 -> MUST THROW OptimisticConcurrencyError!
      snapshotB.state = 'BLOCKED';
      expect(() => {
        workflowRepo.update(snapshotB);
      }).toThrow(OptimisticConcurrencyError);

      // Verify database still has Thread A's state and version 2
      const currentInDb = workflowRepo.findById(context.workflowId)!;
      expect(currentInDb.version).toBe(2);
      expect(currentInDb.state).toBe('RETRIEVING_PATIENT_CONTEXT');
    });
  });
});
