import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import Database from 'better-sqlite3';
import { createApp } from '../../src/server/app.js';
import { initializeSchema } from '../../src/server/db/database.js';
import { seedSyntheticData } from '../../src/server/db/seeds.js';

describe('Phase 5: Agent Orchestration - API Endpoints & MCP Tools', () => {
  let db: Database.Database;
  let app: any;

  const P1_ID = 'p1111111-1111-1111-1111-111111111111'; // Eleanor Vance (unverified Atorvastatin)
  const P2_ID = 'p2222222-2222-2222-2222-222222222222'; // Arthur Pendelton (unverified Zolpidem)
  const P3_ID = 'p3333333-3333-3333-3333-333333333333'; // Margaret Chen (all confirmed)

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initializeSchema(db);
    seedSyntheticData(db);
    app = createApp(db);
  });

  describe('REST Workflow Endpoints', () => {
    it('POST /api/orchestration/run starts workflow and returns WorkflowRun object', async () => {
      const res = await request(app)
        .post('/api/orchestration/run')
        .send({
          patientId: P3_ID,
          requireConfirmedOnly: true,
          actor: 'Test Doctor',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.runId).toBeDefined();
      expect(res.body.data.state).toBe('COMPLETED');
      expect(res.body.data.report).toBeDefined();
    });

    it('POST /api/orchestration/run rejects invalid patientId with 400', async () => {
      const res = await request(app)
        .post('/api/orchestration/run')
        .send({
          patientId: '', // invalid
          actor: 'Test Doctor',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('Validation failed');
    });

    it('GET /api/orchestration/run/:runId returns existing workflow run', async () => {
      const startRes = await request(app)
        .post('/api/orchestration/run')
        .send({
          patientId: P2_ID,
          actor: 'Test Doctor',
        });

      const runId = startRes.body.data.runId;
      const getRes = await request(app).get(`/api/orchestration/run/${runId}`);

      expect(getRes.status).toBe(200);
      expect(getRes.body.success).toBe(true);
      expect(getRes.body.data.runId).toBe(runId);
    });

    it('GET /api/orchestration/run/:runId returns 404 for nonexistent run', async () => {
      const res = await request(app).get('/api/orchestration/run/run_nonexistent_123');
      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('POST /api/orchestration/run/:runId/resume resumes paused run', async () => {
      // 1. Eleanor Vance pauses on unverified atorvastatin
      const startRes = await request(app)
        .post('/api/orchestration/run')
        .send({
          patientId: P1_ID,
          requireConfirmedOnly: true,
          actor: 'Test Doctor',
        });

      expect(startRes.body.data.state).toBe('PAUSED_FOR_CLINICAL_REVIEW');
      const runId = startRes.body.data.runId;
      const unconfirmedId = startRes.body.data.pendingAction.unconfirmedMedications[0].id;

      // 2. Resume with confirmation
      const resumeRes = await request(app)
        .post(`/api/orchestration/run/${runId}/resume`)
        .send({
          confirmedMedicationIds: [unconfirmedId],
          actor: 'Attending Physician',
          notes: 'Dose and identity verified with pharmacy records',
        });

      expect(resumeRes.status).toBe(200);
      expect(resumeRes.body.success).toBe(true);
      expect(resumeRes.body.data.state).toBe('COMPLETED');
      expect(resumeRes.body.data.report).toBeDefined();
    });

    it('GET /api/orchestration/patient/:patientId/report returns consolidated report directly', async () => {
      const res = await request(app).get(`/api/orchestration/patient/${P2_ID}/report`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.patientId).toBe(P2_ID);
      expect(res.body.data.interactionAnalysis).toBeDefined();
      expect(res.body.data.circadianCoordination).toBeDefined();
      expect(res.body.data.itemsRequiringPharmacistReview).toBeDefined();
    });
  });

  describe('Scoped MCP Tools Endpoint (/api/orchestration/mcp/call)', () => {
    it('executes get_patient_overview tool successfully', async () => {
      const res = await request(app)
        .post('/api/orchestration/mcp/call')
        .send({
          name: 'get_patient_overview',
          arguments: { patientId: P2_ID },
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.toolName).toBe('get_patient_overview');
      expect(res.body.data.result.patient.name).toBe('Arthur Pendelton');
      expect(res.body.data.result.medicationCount).toBeGreaterThan(0);
    });

    it('executes run_interaction_analysis tool successfully', async () => {
      const res = await request(app)
        .post('/api/orchestration/mcp/call')
        .send({
          name: 'run_interaction_analysis',
          arguments: { patientId: P2_ID },
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.toolName).toBe('run_interaction_analysis');
      expect(res.body.data.result.findings).toBeDefined();
    });

    it('executes get_circadian_timetable tool successfully', async () => {
      const res = await request(app)
        .post('/api/orchestration/mcp/call')
        .send({
          name: 'get_circadian_timetable',
          arguments: { patientId: P2_ID },
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.toolName).toBe('get_circadian_timetable');
      expect(res.body.data.result.slots).toBeDefined();
    });

    it('allows confirm_medication_order mutation when valid CONFIRM_MUTATION token is supplied', async () => {
      // Find Eleanor's unverified med
      const medRow = db.prepare("SELECT id FROM medications WHERE patient_id = ? AND verification_status = 'unverified'").get(P1_ID) as any;
      expect(medRow).toBeDefined();

      const res = await request(app)
        .post('/api/orchestration/mcp/call')
        .send({
          name: 'confirm_medication_order',
          arguments: {
            medicationId: medRow.id,
            actor: 'Chief Pharmacist',
            confirmationToken: 'CONFIRM_MUTATION',
          },
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.result.status).toBe('confirmed');
    });

    it('strictly rejects confirm_medication_order mutation when confirmationToken is missing or incorrect', async () => {
      const res = await request(app)
        .post('/api/orchestration/mcp/call')
        .send({
          name: 'confirm_medication_order',
          arguments: {
            medicationId: 'any-med-id',
            actor: 'Hacker',
            confirmationToken: 'WRONG_TOKEN',
          },
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('Validation failed');
    });

    it('strictly blocks dangerous tool requests (arbitrary code execution / shell access)', async () => {
      const dangerousTools = ['execute_command', 'read_arbitrary_file', 'eval', 'system_shell', 'write_file'];

      for (const dangerousTool of dangerousTools) {
        const res = await request(app)
          .post('/api/orchestration/mcp/call')
          .send({
            name: dangerousTool,
            arguments: { cmd: 'whoami' },
          });

        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
        expect(res.body.error).toContain('Unauthorized or unknown MCP tool');
      }
    });
  });
});
