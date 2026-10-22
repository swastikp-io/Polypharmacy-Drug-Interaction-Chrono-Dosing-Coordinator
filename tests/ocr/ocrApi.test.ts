import Database from 'better-sqlite3';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/server/app.js';
import { initializeSchema } from '../../src/server/db/database.js';
import { seedSyntheticData } from '../../src/server/db/seeds.js';

describe('OCR & Prescription Intake API Endpoints', () => {
  let db: Database.Database;
  let app: any;
  const p1Id = 'p1111111-1111-1111-1111-111111111111'; // Eleanor Vance

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    initializeSchema(db);
    seedSyntheticData(db);
    app = createApp(db);
  });

  describe('POST /api/ocr/upload', () => {
    it('uploads a prescription image and returns structured candidates and evidence', async () => {
      const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      const text = Buffer.from(`===PRESCRIPTION_START===
Memorial Geriatric Health Clinic
Dr. Robert Patel, MD
Rx: Glucophage XR (Metformin Hydrochloride) 500 mg
Oral Tablet
Sig: Take 1 tablet by mouth twice daily with meals.
Disp: #60 Refills: 3
===PRESCRIPTION_END===`);

      const fileBuffer = Buffer.concat([pngHeader, text]);

      const res = await request(app)
        .post('/api/ocr/upload')
        .field('patientId', p1Id)
        .attach('file', fileBuffer, { filename: 'prescription.png', contentType: 'image/png' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.document).toBeDefined();
      expect(res.body.data.document.fileName).toBe('prescription.png');
      expect(res.body.data.document.fileType).toBe('image/png');
      expect(res.body.data.privacyNotice).toContain('LOCAL-FIRST OCR PROCESSING');

      // Candidate medications verification
      expect(res.body.data.candidateMedications.length).toBeGreaterThanOrEqual(1);
      const candidate = res.body.data.candidateMedications[0];
      expect(candidate.brand).toBe('Glucophage XR');
      expect(candidate.genericName).toContain('Metformin');
      expect(candidate.strength).toBe('500 mg');
      expect(candidate.fieldConfidence).toBeDefined();
      expect(candidate.fieldConfidence.brand).toBeGreaterThan(0.7);

      // Summary statistics
      expect(res.body.data.summary.totalExtracted).toBeGreaterThanOrEqual(1);
    });

    it('rejects unsupported file formats with 400 Bad Request', async () => {
      const res = await request(app)
        .post('/api/ocr/upload')
        .field('patientId', p1Id)
        .attach('file', Buffer.from('Plain text body'), {
          filename: 'notes.txt',
          contentType: 'text/plain',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNSUPPORTED_FILE_TYPE');
    });

    it('rejects requests with missing file with 400 Bad Request', async () => {
      const res = await request(app)
        .post('/api/ocr/upload')
        .field('patientId', p1Id);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('NO_FILE_UPLOADED');
    });
  });

  describe('Document Preview & Safe Temporary File Cleanup', () => {
    it('serves preview and deletes temporary file upon clinician request', async () => {
      const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      const text = Buffer.from(`===PRESCRIPTION_START===
Rx: Norvasc 5 mg Oral Tablet
===PRESCRIPTION_END===`);

      const uploadRes = await request(app)
        .post('/api/ocr/upload')
        .field('patientId', p1Id)
        .attach('file', Buffer.concat([pngHeader, text]), {
          filename: 'norvasc.png',
          contentType: 'image/png',
        });

      expect(uploadRes.status).toBe(200);
      const docId = uploadRes.body.data.document.documentId;
      expect(docId).toBeDefined();

      // 1. Preview document
      const previewRes = await request(app).get(`/api/ocr/documents/${docId}/preview`);
      expect(previewRes.status).toBe(200);
      expect(previewRes.headers['content-type']).toContain('image/png');

      // 2. Delete document (privacy cleanup)
      const deleteRes = await request(app).delete(`/api/ocr/documents/${docId}`);
      expect(deleteRes.status).toBe(200);
      expect(deleteRes.body.success).toBe(true);

      // 3. Confirm preview now returns 404
      const afterDeleteRes = await request(app).get(`/api/ocr/documents/${docId}/preview`);
      expect(afterDeleteRes.status).toBe(404);
    });
  });

  describe('GET /api/ocr/terminology/search', () => {
    it('returns standard RxNorm concepts for clinical medication lookup', async () => {
      const res = await request(app).get('/api/ocr/terminology/search?q=Lisinopril');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data[0].genericName).toBe('Lisinopril');
      expect(res.body.data[0].saltForm).toBe('Dihydrate');
    });
  });

  describe('POST /api/ocr/reconcile', () => {
    it('persists confirmed candidate medication with audit trail and verified status', async () => {
      const payload = {
        patientId: p1Id,
        brand: 'Glucophage XR',
        genericName: 'Metformin Hydrochloride',
        activeIngredients: [{ name: 'Metformin', strength: '500 mg' }],
        salt: 'Hydrochloride',
        strength: '500 mg',
        formulation: 'Extended-Release Tablet',
        route: 'Oral',
        prescribedDose: '1 tablet (500mg)',
        frequency: 'Twice daily',
        administrationInstructions: 'Take 1 tablet by mouth twice daily with morning and evening meals.',
        prescriber: 'Dr. Robert Patel, MD',
        source: 'Scanned Prescription Intake (Document #4819)',
        status: 'active',
        verificationStatus: 'confirmed',
        actor: 'Dr. Sarah Collins, PharmD',
        clinicalNotes: 'Verified against original clinic prescription.',
      };

      const res = await request(app)
        .post('/api/ocr/reconcile')
        .set('x-actor', 'Dr. Sarah Collins, PharmD')
        .send(payload);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.brand).toBe('Glucophage XR');
      expect(res.body.data.verificationStatus).toBe('confirmed');

      // Check DB audit trail was written
      const auditRes = await request(app).get(`/api/audit/patient/${p1Id}`);
      expect(auditRes.status).toBe(200);
      expect(
        auditRes.body.data.some(
          (log: any) =>
            log.action === 'CREATE' &&
            log.actor === 'Dr. Sarah Collins, PharmD' &&
            log.summary.includes('Reconciled and accepted OCR prescription order')
        )
      ).toBe(true);
    });

    it('rejects invalid reconciliation payload missing required clinical fields', async () => {
      const invalidPayload = {
        patientId: p1Id,
        brand: '', // Required!
        genericName: 'Metformin',
      };

      const res = await request(app).post('/api/ocr/reconcile').send(invalidPayload);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });
});
