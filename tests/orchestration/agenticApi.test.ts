import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import Database from 'better-sqlite3';
import { createApp } from '../../src/server/app.js';
import { initializeSchema } from '../../src/server/db/database.js';
import { seedSyntheticData } from '../../src/server/db/seeds.js';

describe('Agentic Workflow Orchestrator - REST Endpoints', () => {
  let db: Database.Database;
  let app: any;

  const P2_ID = 'p2222222-2222-2222-2222-222222222222'; // Arthur Pendelton
  const P3_ID = 'p3333333-3333-3333-3333-333333333333'; // Margaret Chen

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initializeSchema(db);
    seedSyntheticData(db);
    app = createApp(db);
  });

  describe('Workflow Lifecycle Endpoints', () => {
    it('POST /api/orchestration/agentic/workflows creates a new workflow context', async () => {
      const res = await request(app)
        .post('/api/orchestration/agentic/workflows')
        .send({
          patientId: P2_ID,
          actor: 'Dr. Coordinator',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.workflowId).toBeDefined();
      expect(res.body.data.state).toBe('CREATED');
      expect(res.body.data.version).toBe(1);
    });

    it('GET /api/orchestration/agentic/workflows/:workflowId retrieves workflow context', async () => {
      const createRes = await request(app)
        .post('/api/orchestration/agentic/workflows')
        .send({ patientId: P2_ID, actor: 'Dr. Coordinator' });

      const workflowId = createRes.body.data.workflowId;

      const getRes = await request(app).get(`/api/orchestration/agentic/workflows/${workflowId}`);
      expect(getRes.status).toBe(200);
      expect(getRes.body.success).toBe(true);
      expect(getRes.body.data.workflowId).toBe(workflowId);
      expect(getRes.body.data.patientId).toBe(P2_ID);
    });

    it('POST /api/orchestration/agentic/workflows/:workflowId/advance steps through pipeline', async () => {
      const createRes = await request(app)
        .post('/api/orchestration/agentic/workflows')
        .send({ patientId: P3_ID, actor: 'Dr. Coordinator' });

      const workflowId = createRes.body.data.workflowId;

      // Step 1: Advance to retrieve context
      const step1 = await request(app)
        .post(`/api/orchestration/agentic/workflows/${workflowId}/advance`)
        .send({ actor: 'Dr. Coordinator' });

      expect(step1.status).toBe(200);
      expect(step1.body.success).toBe(true);
      expect(step1.body.data.state).toBe('MEDICATIONS_CONFIRMED');

      // Step 2: Advance to interaction evaluation
      const step2 = await request(app)
        .post(`/api/orchestration/agentic/workflows/${workflowId}/advance`)
        .send({ actor: 'Dr. Coordinator' });

      expect(step2.status).toBe(200);
      expect(step2.body.data.state).toBe('AWAITING_CLINICAL_REVIEW');
    });

    it('handles review resolution and feedback loops via REST endpoints', async () => {
      const createRes = await request(app)
        .post('/api/orchestration/agentic/workflows')
        .send({ patientId: P3_ID, actor: 'Dr. Coordinator' });

      const workflowId = createRes.body.data.workflowId;
      await request(app).post(`/api/orchestration/agentic/workflows/${workflowId}/advance`);
      const step2 = await request(app).post(`/api/orchestration/agentic/workflows/${workflowId}/advance`);

      const reviews = step2.body.data.pendingHumanApprovals;
      expect(reviews.length).toBeGreaterThan(0);
      const review = reviews[0];

      // Resolve review
      const resolveRes = await request(app)
        .post(`/api/orchestration/agentic/workflows/${workflowId}/reviews/${review.id}/resolve`)
        .send({
          status: 'approved',
          reviewerIdentity: 'Dr. Jane Clinical, MD',
          reviewerNotes: 'Approved interaction separation',
          targetVersion: review.itemVersion,
        });

      expect(resolveRes.status).toBe(200);
      expect(resolveRes.body.success).toBe(true);

      // Trigger medication correction feedback loop
      const medRow = db.prepare('SELECT id FROM medications WHERE patient_id = ?').get(P3_ID) as any;
      const correctRes = await request(app)
        .post(`/api/orchestration/agentic/workflows/${workflowId}/correct-medication`)
        .send({
          medicationId: medRow.id,
          actor: 'Dr. Jane Clinical, MD',
          justification: 'Corrected dosage',
        });

      expect(correctRes.status).toBe(200);
      expect(correctRes.body.data.state).toBe('MEDICATIONS_CONFIRMED');
    });

    it('GET and POST /api/orchestration/agentic/tools executes registered tools with validation', async () => {
      // List tools
      const listRes = await request(app).get('/api/orchestration/agentic/tools');
      expect(listRes.status).toBe(200);
      expect(listRes.body.data.length).toBeGreaterThan(0);

      // Call tool get_patient_context
      const callRes = await request(app)
        .post('/api/orchestration/agentic/tools/call')
        .send({
          name: 'get_patient_context',
          arguments: { patientId: P2_ID },
          actor: 'Clinical Pharmacist',
          actorRole: 'clinician',
        });

      expect(callRes.status).toBe(200);
      expect(callRes.body.success).toBe(true);
      expect(callRes.body.data.result.patient.name).toBe('Arthur Pendelton');
    });
  });
});
