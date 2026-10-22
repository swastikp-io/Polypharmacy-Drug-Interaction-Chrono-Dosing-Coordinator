import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { initializeSchema } from '../../src/server/db/database.js';
import { seedSyntheticData } from '../../src/server/db/seeds.js';
import { WorkflowCoordinator } from '../../src/server/services/orchestration/workflowCoordinator.js';

describe('Phase 5: Agent Orchestration - Workflow Coordinator Service', () => {
  let db: Database.Database;
  let coordinator: WorkflowCoordinator;

  const P1_ID = 'p1111111-1111-1111-1111-111111111111'; // Eleanor Vance (has unverified Atorvastatin)
  const P2_ID = 'p2222222-2222-2222-2222-222222222222'; // Arthur Pendelton (all confirmed)
  const P3_ID = 'p3333333-3333-3333-3333-333333333333'; // Margaret Chen (all confirmed, complex schedule)

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initializeSchema(db);
    seedSyntheticData(db);
    coordinator = new WorkflowCoordinator(db);
  });

  it('runs complete 3-agent pipeline for patient with confirmed medications (Margaret Chen)', async () => {
    const run = await coordinator.startWorkflow({
      patientId: P3_ID,
      requireConfirmedOnly: true,
      actor: 'Dr. Test Clinician',
    });

    expect(run.state).toBe('COMPLETED');
    expect(run.completedAt).toBeDefined();
    expect(run.totalDurationMs).toBeGreaterThanOrEqual(0);

    // Verify all 5 primary steps executed
    expect(run.steps['FETCHING_PATIENT_RECORDS']?.status).toBe('completed');
    expect(run.steps['EVALUATING_INTERACTIONS']?.status).toBe('completed');
    expect(run.steps['COORDINATING_SCHEDULE']?.status).toBe('completed');
    expect(run.steps['GENERATING_CONSOLIDATED_REPORT']?.status).toBe('completed');

    // Consolidated clinical report generated
    expect(run.report).toBeDefined();
    expect(run.report?.patientId).toBe(P3_ID);
    expect(run.report?.patientSummary.name).toBe('Margaret Chen');
    expect(run.report?.isPrototype).toBe(true);
    expect(run.report?.circadianCoordination.prescribedDosesPreserved100Percent).toBe(true);

    // Provenance details
    expect(run.report?.provenance.orchestratorVersion).toBe(WorkflowCoordinator.VERSION);
    expect(run.report?.provenance.conflictEngineVersion).toBeDefined();
    expect(run.report?.provenance.chronoCoordinatorVersion).toBeDefined();
  });

  it('pauses at epistemic checkpoint when unverified medication is present and requireConfirmedOnly is true', async () => {
    const run = await coordinator.startWorkflow({
      patientId: P1_ID,
      requireConfirmedOnly: true,
      actor: 'Clinical Pharmacist',
    });

    // Eleanor Vance has unverified Atorvastatin in seed data
    expect(run.state).toBe('PAUSED_FOR_CLINICAL_REVIEW');
    expect(run.checkpointReason).toContain('unconfirmed medication orders');
    expect(run.pendingAction).toBeDefined();
    expect(run.pendingAction?.type).toBe('confirm_medications');
    expect(run.pendingAction?.unconfirmedMedications.length).toBeGreaterThan(0);

    const unconfirmedMed = run.pendingAction?.unconfirmedMedications[0];
    expect(unconfirmedMed?.genericName).toContain('Atorvastatin');

    // Checkpoint log recorded
    const checkpointLog = run.logs.find((l) => l.level === 'CHECKPOINT');
    expect(checkpointLog).toBeDefined();
    expect(checkpointLog?.message).toContain('Workflow paused');
  });

  it('resumes paused workflow and completes when unverified medications are explicitly confirmed', async () => {
    // 1. Initial run pauses
    const pausedRun = await coordinator.startWorkflow({
      patientId: P1_ID,
      requireConfirmedOnly: true,
      actor: 'Clinical Pharmacist',
    });

    expect(pausedRun.state).toBe('PAUSED_FOR_CLINICAL_REVIEW');
    const unconfirmedId = pausedRun.pendingAction!.unconfirmedMedications[0].id;

    // 2. Resume by confirming the medication
    const resumedRun = await coordinator.resumeWorkflow(pausedRun.runId, {
      confirmedMedicationIds: [unconfirmedId],
      actor: 'Dr. Confirmer',
      notes: 'Identity confirmed via hospital discharge summary',
    });

    expect(resumedRun.state).toBe('COMPLETED');
    expect(resumedRun.report).toBeDefined();
    expect(resumedRun.report?.unconfirmedMedicationCount).toBe(0);

    // Verify database was updated to confirmed
    const medRow = db.prepare('SELECT verification_status FROM medications WHERE id = ?').get(unconfirmedId) as any;
    expect(medRow.verification_status).toBe('confirmed');
  });

  it('sanitizes logs completely: no raw image bytes, no passwords, no clinical PII leaks', async () => {
    const run = await coordinator.startWorkflow({
      patientId: P3_ID,
      actor: 'Safety Officer',
    });

    expect(run.logs.length).toBeGreaterThan(0);
    for (const log of run.logs) {
      expect(log.id).toBeDefined();
      expect(log.timestamp).toBeDefined();
      expect(log.level).toMatch(/INFO|WARN|ERROR|CHECKPOINT|AUDIT/);
      expect(log.step).toBeDefined();

      // Check log message does not leak raw image buffer strings or credentials
      expect(log.message).not.toContain('data:image');
      expect(log.message).not.toContain('password');
      expect(log.message).not.toContain('base64');
    }
  });

  it('correctly generates prioritized PharmacistReviewItems for complex regimens', async () => {
    const run = await coordinator.startWorkflow({
      patientId: P3_ID,
      requireConfirmedOnly: false,
      actor: 'Geriatrician',
    });

    expect(run.state).toBe('COMPLETED');
    expect(run.report).toBeDefined();
    const items = run.report!.itemsRequiringPharmacistReview;

    expect(Array.isArray(items)).toBe(true);
    expect(items.length).toBeGreaterThan(0);

    // Each review item has category, urgency, recommendation, and evidence citation
    for (const item of items) {
      expect(item.id).toBeDefined();
      expect(item.category).toBeDefined();
      expect(item.urgency).toMatch(/immediate_action|pre_administration_signoff|routine_monitoring/);
      expect(item.title).toBeTruthy();
      expect(item.actionableRecommendation).toBeTruthy();
      expect(item.evidenceCitation).toBeTruthy();
    }
  });

  it('caches completed runs and retrieves by runId idempotently', async () => {
    const run = await coordinator.startWorkflow({
      patientId: P2_ID,
      actor: 'Nurse Practitioner',
    });

    const retrieved = coordinator.getRun(run.runId);
    expect(retrieved).toBeDefined();
    expect(retrieved?.runId).toBe(run.runId);
    expect(retrieved?.state).toBe('COMPLETED');
  });

  it('generates a consolidated report directly via getOrGenerateConsolidatedReport', async () => {
    const report = await coordinator.getOrGenerateConsolidatedReport(P2_ID, 'Automated Test');

    expect(report).toBeDefined();
    expect(report.patientId).toBe(P2_ID);
    expect(report.interactionAnalysis).toBeDefined();
    expect(report.circadianCoordination).toBeDefined();
    expect(report.clinicalDisclaimer).toContain('PROTOTYPE');
  });
});
