import Database from 'better-sqlite3';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/server/app.js';
import { initializeSchema } from '../../src/server/db/database.js';
import { seedSyntheticData } from '../../src/server/db/seeds.js';

describe('API Endpoints & Error Handling', () => {
  let db: Database.Database;
  let app: any;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    initializeSchema(db);
    seedSyntheticData(db);
    app = createApp(db);
  });

  it('GET /api/health returns healthy status', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('healthy');
  });

  it('GET /api/patients returns seeded synthetic patients', async () => {
    const res = await request(app).get('/api/patients');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(3);
    expect(res.body.data.some((p: any) => p.name === 'Eleanor Vance')).toBe(true);
  });

  it('GET /api/patients/:id/comprehensive returns full patient bundle including duplicate ingredients', async () => {
    const p1Id = 'p1111111-1111-1111-1111-111111111111'; // Eleanor Vance
    const res = await request(app).get(`/api/patients/${p1Id}/comprehensive`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.patient.name).toBe('Eleanor Vance');
    expect(res.body.data.medications.length).toBeGreaterThanOrEqual(5);
    expect(res.body.data.allergies.length).toBeGreaterThanOrEqual(1);
    expect(res.body.data.labMeasurements.length).toBeGreaterThanOrEqual(4);
    expect(res.body.data.auditLogs.length).toBeGreaterThanOrEqual(1);

    // Duplicate ingredient check for Eleanor Vance (Acetaminophen in Tylenol + Percocet)
    expect(res.body.data.duplicateIngredients.length).toBeGreaterThanOrEqual(1);
    expect(res.body.data.duplicateIngredients[0].normalizedName).toBe('acetaminophen');
  });

  it('POST /api/medications validates payload and returns 400 on error', async () => {
    const invalidMed = {
      patientId: 'p1111111-1111-1111-1111-111111111111',
      brand: '', // Empty!
      genericName: 'Aspirin',
    };

    const res = await request(app)
      .post('/api/medications')
      .send(invalidMed);

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details.length).toBeGreaterThanOrEqual(1);
  });

  it('PATCH /api/medications/:id/verification updates verification status and logs audit entry', async () => {
    const medId = 'med-p1-6'; // Atorvastatin (initially unverified)
    const res = await request(app)
      .patch(`/api/medications/${medId}/verification`)
      .send({
        verificationStatus: 'confirmed',
        actor: 'Clinical Pharmacist Miller',
        reason: 'Verified against outpatient lipid panel records',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.verificationStatus).toBe('confirmed');

    // Verify audit log has recorded the change
    const auditRes = await request(app).get('/api/audit/patient/p1111111-1111-1111-1111-111111111111');
    expect(auditRes.status).toBe(200);
    const latestAudit = auditRes.body.data[0];
    expect(latestAudit.action).toBe('STATUS_CHANGE');
    expect(latestAudit.actor).toBe('Clinical Pharmacist Miller');
  });

  it('Agent 1 endpoint: GET /api/agents/interactions/:patientId executes correctly', async () => {
    const p1Id = 'p1111111-1111-1111-1111-111111111111';
    const res = await request(app).get(`/api/agents/interactions/${p1Id}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.isPrototype).toBe(true);
    expect(res.body.data.clinicalDisclaimer).toContain('PROTOTYPE');
    expect(res.body.data.summary.duplicateIngredientCount).toBeGreaterThanOrEqual(1);
  });

  it('Agent 2 endpoint: GET /api/agents/chrono-dosing/:patientId detects calcium-levothyroxine conflict', async () => {
    const p3Id = 'p3333333-3333-3333-3333-333333333333'; // Margaret Chen
    const res = await request(app).get(`/api/agents/chrono-dosing/${p3Id}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.proposedSchedule.length).toBeGreaterThan(0);
    expect(res.body.data.chronoConflicts.length).toBeGreaterThanOrEqual(1);
    expect(res.body.data.chronoConflicts[0].conflictType).toBe('absorption_chelation');
  });

  it('Agent 3 endpoint: GET /api/agents/organ-clearance/:patientId computes renal stage and alerts', async () => {
    const p1Id = 'p1111111-1111-1111-1111-111111111111'; // Eleanor Vance (eGFR 42 -> Stage 3b)
    const res = await request(app).get(`/api/agents/organ-clearance/${p1Id}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.renalFunction.stage).toBe('Stage 3b');
    expect(res.body.data.organAlerts.some((a: any) => a.genericName.toLowerCase().includes('metformin'))).toBe(true);
  });

  it('Returns 404 for unknown route', async () => {
    const res = await request(app).get('/api/unknown-endpoint');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});
