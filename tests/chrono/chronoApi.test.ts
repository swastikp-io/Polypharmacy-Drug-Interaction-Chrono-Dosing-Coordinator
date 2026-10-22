import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import Database from 'better-sqlite3';
import { createApp } from '../../src/server/app.js';
import { seedSyntheticData } from '../../src/server/db/seeds.js';
import { initializeSchema } from '../../src/server/db/database.js';

describe('Circadian Schedule Coordinator - API Endpoints', () => {
  let db: Database.Database;
  let app: any;

  const P1_ID = 'p1111111-1111-1111-1111-111111111111'; // Eleanor Vance
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

  it('GET /api/chrono/patient/:patientId/draft returns 200 with complete DailyScheduleTimeline', async () => {
    const res = await request(app).get(`/api/chrono/patient/${P1_ID}/draft`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.scheduleId).toBeDefined();
    expect(res.body.data.patientId).toBe(P1_ID);
    expect(res.body.data.status).toBe('draft');
    expect(res.body.data.slots.length).toBeGreaterThan(0);
    expect(res.body.data.comparison).toBeDefined();
    expect(res.body.data.safetyNotice).toContain('CLINICAL SAFETY NOTICE');

    // Eleanor Vance has unverified Atorvastatin
    expect(res.body.data.unconfidentMedications.length).toBeGreaterThan(0);
  });

  it('verifies Margaret Chen schedule separates Levothyroxine from Calcium by >= 4 hours', async () => {
    const res = await request(app).get(`/api/chrono/patient/${P3_ID}/draft`);

    expect(res.status).toBe(200);
    const timeline = res.body.data;

    const fastedSlot = timeline.slots.find((s: any) => s.slotId === 'slot_wake_fasted');
    const lunchSlot = timeline.slots.find((s: any) => s.slotId === 'slot_midday_lunch');

    expect(fastedSlot).toBeDefined();
    expect(lunchSlot).toBeDefined();

    const levoDose = fastedSlot.doses.find((d: any) => d.genericName.toLowerCase().includes('levothyroxine'));
    const calDose = lunchSlot.doses.find((d: any) => d.genericName.toLowerCase().includes('calcium'));

    expect(levoDose).toBeDefined();
    expect(calDose).toBeDefined();

    // Check time separation: Fasted (07:00) vs Lunch (12:30) is 5.5h >= 4h
    expect(levoDose.foodRelation).toBe('empty_stomach');
    expect(calDose.foodRelation).toBe('with_meal');
  });

  it('verifies Arthur Pendelton schedule places Furosemide in morning and Zolpidem at bedtime', async () => {
    const res = await request(app).get(`/api/chrono/patient/${P2_ID}/draft`);

    expect(res.status).toBe(200);
    const timeline = res.body.data;

    const breakfastSlot = timeline.slots.find((s: any) => s.slotId === 'slot_breakfast');
    const bedtimeSlot = timeline.slots.find((s: any) => s.slotId === 'slot_bedtime');

    expect(breakfastSlot).toBeDefined();
    expect(bedtimeSlot).toBeDefined();

    // Furosemide in morning
    const furosemideDose = breakfastSlot.doses.find((d: any) =>
      d.genericName.toLowerCase().includes('furosemide')
    );
    expect(furosemideDose).toBeDefined();

    // Zolpidem at bedtime with fall risk precaution
    const zolpidemDose = bedtimeSlot.doses.find((d: any) =>
      d.genericName.toLowerCase().includes('zolpidem')
    );
    expect(zolpidemDose).toBeDefined();
    expect(zolpidemDose.specialPrecautions.some((p: string) => p.includes('fall'))).toBe(true);
  });

  it('GET and PUT /api/chrono/patient/:patientId/routine updates routine and logs audit', async () => {
    // 1. Get initial routine
    const getRes = await request(app).get(`/api/chrono/patient/${P1_ID}/routine`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.data.wakeTime).toBe('07:00');

    // 2. Update routine
    const putRes = await request(app)
      .put(`/api/chrono/patient/${P1_ID}/routine`)
      .set('x-actor', 'Dr. Clinical Pharmacist')
      .send({
        wakeTime: '06:15',
        breakfastTime: '07:30',
        lunchTime: '12:00',
        dinnerTime: '18:00',
        bedTime: '21:00',
        notes: 'Updated for early risers',
      });

    expect(putRes.status).toBe(200);
    expect(putRes.body.success).toBe(true);
    expect(putRes.body.data.routine.wakeTime).toBe('06:15');
    expect(putRes.body.data.newSchedule.patientRoutine.wakeTime).toBe('06:15');

    // 3. Verify audit log entry was created
    const auditLogs = db.prepare('SELECT * FROM audit_logs WHERE patient_id = ?').all(P1_ID) as any[];
    const routineLog = auditLogs.find((l) => l.summary.includes('Updated daily meal and sleep routine'));
    expect(routineLog).toBeDefined();
    expect(routineLog.actor).toBe('Dr. Clinical Pharmacist');
  });

  it('POST /api/chrono/patient/:patientId/review updates status to accepted and creates audit record', async () => {
    // Get scheduleId
    const draftRes = await request(app).get(`/api/chrono/patient/${P3_ID}/draft`);
    const scheduleId = draftRes.body.data.scheduleId;

    // Submit review
    const reviewRes = await request(app)
      .post(`/api/chrono/patient/${P3_ID}/review`)
      .send({
        scheduleId,
        decision: 'accepted',
        actor: 'Dr. Evelyn Reed, PharmD',
        rationale: 'Verified 5.5-hour separation between Synthroid and Caltrate. Schedule accepted.',
        clinicianNotes: 'Instructed patient on morning fasted ingestion.',
      });

    expect(reviewRes.status).toBe(200);
    expect(reviewRes.body.success).toBe(true);
    expect(reviewRes.body.data.status).toBe('reviewed_accepted');
    expect(reviewRes.body.data.reviewMetadata.decision).toBe('accepted');
    expect(reviewRes.body.data.reviewMetadata.reviewedBy).toBe('Dr. Evelyn Reed, PharmD');

    // Verify audit log
    const auditLogs = db.prepare('SELECT * FROM audit_logs WHERE patient_id = ?').all(P3_ID) as any[];
    const reviewLog = auditLogs.find((l) => l.summary.includes('ACCEPTED'));
    expect(reviewLog).toBeDefined();
    expect(reviewLog.actor).toBe('Dr. Evelyn Reed, PharmD');
  });

  it('GET /api/chrono/patient/:patientId/history returns revision history', async () => {
    // Generate and review
    const draftRes = await request(app).get(`/api/chrono/patient/${P2_ID}/draft`);
    const scheduleId = draftRes.body.data.scheduleId;

    await request(app)
      .post(`/api/chrono/patient/${P2_ID}/review`)
      .send({
        scheduleId,
        decision: 'accepted',
        actor: 'Clinical Pharmacist',
        rationale: 'Morning diuretic accepted.',
      });

    const historyRes = await request(app).get(`/api/chrono/patient/${P2_ID}/history`);
    expect(historyRes.status).toBe(200);
    expect(historyRes.body.data.length).toBeGreaterThan(0);
    expect(historyRes.body.data[0].status).toBe('reviewed_accepted');
  });

  it('rejects review request with 400 Bad Request when scheduleId is missing', async () => {
    const res = await request(app)
      .post(`/api/chrono/patient/${P1_ID}/review`)
      .send({
        decision: 'accepted',
        actor: 'Reviewer',
        rationale: 'Missing id',
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('MISSING_SCHEDULE_ID');
  });

  it('returns 404 Not Found for non-existent patient ID', async () => {
    const res = await request(app).get('/api/chrono/patient/non-existent-patient-id/draft');
    expect(res.status).toBe(404);
  });

  it('SAFETY INVARIANT: Verifies 100% dose preservation across Eleanor, Arthur, and Margaret', async () => {
    for (const pid of [P1_ID, P2_ID, P3_ID]) {
      const res = await request(app).get(`/api/chrono/patient/${pid}/draft`);
      expect(res.status).toBe(200);
      const comparison = res.body.data.comparison;

      expect(comparison.totalMedications).toBe(comparison.unchangedDoseCount);
      for (const item of comparison.items) {
        expect(item.doseIntegrityStatus).toBe('strictly_preserved');
      }
    }
  });
});
