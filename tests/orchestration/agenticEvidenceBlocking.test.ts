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

describe('Capability 1 & 4: Evidence Provider Failure Blocking Unsupported Conclusions', () => {
  let db: Database.Database;
  let orchestrator: AgenticWorkflowOrchestrator;
  let evidenceProvider: LocalInteractionEvidenceProvider;

  const P3_ID = 'p3333333-3333-3333-3333-333333333333'; // Margaret Chen (all confirmed)

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

    evidenceProvider = new LocalInteractionEvidenceProvider();
    const conflictEngine = new PharmacokineticConflictEngine(
      new LocalDrugReferenceProvider(),
      evidenceProvider
    );
    const chronoCoordinator = new CircadianScheduleCoordinator();

    const workflowRepo = new WorkflowRepository(db);
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

  it('4. Transitions to BLOCKED when evidence provider fails and prevents unsupported conclusions', async () => {
    const workflow = await orchestrator.createWorkflow({
      patientId: P3_ID,
      actor: 'Clinical Pharmacist',
    });

    // Advance to MEDICATIONS_CONFIRMED
    await orchestrator.advanceWorkflow(workflow.workflowId, 'Clinical Pharmacist');

    // Simulate Evidence Provider outage
    evidenceProvider.setOutageSimulation(true);

    // Advance towards CHECKING_INTERACTIONS
    const blockedWorkflow = await orchestrator.advanceWorkflow(workflow.workflowId, 'Clinical Pharmacist');

    // State machine MUST transition to BLOCKED
    expect(blockedWorkflow.state).toBe('BLOCKED');

    // Conclusions must NOT be invented
    expect(blockedWorkflow.interactionFindings.length).toBe(0);
    expect(blockedWorkflow.derivedFindings).toBeUndefined();

    // Failure operation recorded in failedOperations
    expect(blockedWorkflow.failedOperations.length).toBeGreaterThan(0);
    const failedOp = blockedWorkflow.failedOperations.find(
      (op) => op.operationType === 'CHECK_INTERACTIONS'
    );
    expect(failedOp).toBeDefined();
    expect(failedOp?.error?.isRecoverable).toBe(true);
    expect(failedOp?.error?.message).toMatch(/outage|offline/i);

    // Cannot advance downstream to PREPARING_SCHEDULE while BLOCKED
    const stillBlocked = await orchestrator.advanceWorkflow(workflow.workflowId, 'Clinical Pharmacist');
    expect(stillBlocked.state).toBe('BLOCKED');
    expect(stillBlocked.proposedSchedules).toBeUndefined();
  });

  it('unblocks and completes interaction analysis once evidence provider is restored', async () => {
    const workflow = await orchestrator.createWorkflow({
      patientId: P3_ID,
      actor: 'Clinical Pharmacist',
    });

    await orchestrator.advanceWorkflow(workflow.workflowId, 'Clinical Pharmacist');

    // Simulate temporary outage
    evidenceProvider.setOutageSimulation(true);
    const blocked = await orchestrator.advanceWorkflow(workflow.workflowId, 'Clinical Pharmacist');
    expect(blocked.state).toBe('BLOCKED');

    // Restore evidence provider
    evidenceProvider.setOutageSimulation(false);

    // Transition out of BLOCKED back to MEDICATIONS_CONFIRMED to retry
    const context = orchestrator.getWorkflow(workflow.workflowId)!;
    context.state = 'MEDICATIONS_CONFIRMED';
    // Advance again
    const resumed = await orchestrator.advanceWorkflow(workflow.workflowId, 'Clinical Pharmacist');

    // Now completes interaction analysis cleanly
    expect(resumed.state).not.toBe('BLOCKED');
    expect(resumed.interactionFindings.length).toBeGreaterThan(0);
    expect(resumed.completedOperations.some((op) => op.operationType === 'CHECK_INTERACTIONS')).toBe(true);
  });
});
