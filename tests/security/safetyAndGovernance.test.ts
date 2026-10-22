import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import Database from 'better-sqlite3';
import path from 'path';
import { createApp } from '../../src/server/app.js';
import { initializeSchema } from '../../src/server/db/database.js';
import { seedSyntheticData } from '../../src/server/db/seeds.js';
import {
  validateSafePath,
  sanitizeFilename,
  SecurityService,
} from '../../src/server/services/security/securityService.js';

describe('Phase 6: Clinical Dashboard and Safety Hardening - Security & Governance', () => {
  let db: Database.Database;
  let app: any;
  let securityService: SecurityService;

  const P1_ID = 'p1111111-1111-1111-1111-111111111111'; // Eleanor Vance
  const P2_ID = 'p2222222-2222-2222-2222-222222222222'; // Arthur Pendelton

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initializeSchema(db);
    seedSyntheticData(db);
    app = createApp(db);
    securityService = new SecurityService(db);
  });

  describe('Filesystem & Path Traversal Prevention', () => {
    const baseDir = path.resolve(process.cwd(), 'uploads');

    it('allows valid subpaths within base directory', () => {
      const safePath = path.join(baseDir, 'prescription-123.jpg');
      expect(() => validateSafePath(safePath, baseDir)).not.toThrow();
    });

    it('rejects parent directory traversal attacks (../ and ..\\)', () => {
      const maliciousPaths = [
        path.join(baseDir, '..', '..', 'windows', 'system32', 'cmd.exe'),
        path.join(baseDir, '..', 'etc', 'passwd'),
        baseDir + '/../../../secret.txt',
        baseDir + '\\..\\..\\secret.txt',
      ];

      for (const malPath of maliciousPaths) {
        expect(() => validateSafePath(malPath, baseDir)).toThrow(/Path traversal attempt detected/);
      }
    });

    it('rejects null byte injections (%00 and \\0)', () => {
      expect(() => validateSafePath(path.join(baseDir, 'safe.pdf\0.exe'), baseDir)).toThrow(/Null byte injection/);
    });

    it('sanitizes unsafe filenames properly', () => {
      expect(sanitizeFilename('../../evil.exe')).not.toContain('..');
      expect(sanitizeFilename('rx:file*name?test.png')).toBe('rx_file_name_test.png');
      expect(sanitizeFilename('..\\..\\autoexec.bat')).not.toContain('\\');
    });
  });

  describe('Patient Dossier Export Endpoint (GET /api/governance/patient/:patientId/export)', () => {
    it('exports complete de-identified clinical dossier with Content-Disposition attachment', async () => {
      const res = await request(app).get(`/api/governance/patient/${P2_ID}/export`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('application/json');
      expect(res.headers['content-disposition']).toContain('attachment');
      expect(res.headers['content-disposition']).toContain(`patient_dossier_${P2_ID}.json`);

      const dossier = JSON.parse(res.text);
      expect(dossier.patient.id).toBe(P2_ID);
      expect(dossier.patient.name).toBe('Arthur Pendelton');
      expect(dossier.medications.length).toBeGreaterThan(0);
      expect(dossier.allergies).toBeDefined();
      expect(dossier.diagnoses).toBeDefined();
      expect(dossier.labs).toBeDefined();
      expect(dossier.auditTrail).toBeDefined();
      expect(dossier.metadata.exportedAt).toBeDefined();
      expect(dossier.metadata.isPrototype).toBe(true);
    });

    it('returns 404 when exporting a nonexistent patient', async () => {
      const res = await request(app).get('/api/governance/patient/nonexistent-id/export');
      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });

  describe('Patient Data Purge Endpoint (POST /api/governance/patient/:patientId/purge)', () => {
    it('strictly rejects purge without exact PURGE_{patientId} confirmationToken', async () => {
      const res = await request(app)
        .post(`/api/governance/patient/${P1_ID}/purge`)
        .send({
          confirmationToken: 'CONFIRM_PURGE', // wrong token
          actor: 'Clinician',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('Validation failed');
    });

    it('purges all patient data permanently when valid PURGE_{patientId} token is provided', async () => {
      // Check records exist initially
      const initialMeds = db.prepare('SELECT count(*) as c FROM medications WHERE patient_id = ?').get(P1_ID) as any;
      expect(initialMeds.c).toBeGreaterThan(0);

      const res = await request(app)
        .post(`/api/governance/patient/${P1_ID}/purge`)
        .send({
          confirmationToken: `PURGE_${P1_ID}`,
          actor: 'Data Privacy Officer',
          reason: 'Patient requested complete de-identification under privacy rights',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.purgedPatientId).toBe(P1_ID);

      // Verify patient records are eliminated
      const medsAfter = db.prepare('SELECT count(*) as c FROM medications WHERE patient_id = ?').get(P1_ID) as any;
      expect(medsAfter.c).toBe(0);

      const allergiesAfter = db.prepare('SELECT count(*) as c FROM allergies WHERE patient_id = ?').get(P1_ID) as any;
      expect(allergiesAfter.c).toBe(0);

      const diagnosesAfter = db.prepare('SELECT count(*) as c FROM diagnoses WHERE patient_id = ?').get(P1_ID) as any;
      expect(diagnosesAfter.c).toBe(0);

      const labsAfter = db.prepare('SELECT count(*) as c FROM lab_measurements WHERE patient_id = ?').get(P1_ID) as any;
      expect(labsAfter.c).toBe(0);

      // Patient record itself removed
      const patientAfter = db.prepare('SELECT * FROM patients WHERE id = ?').get(P1_ID);
      expect(patientAfter).toBeUndefined();

      // Deletion audit entry exists in audit_logs
      const audit = db.prepare("SELECT * FROM audit_logs WHERE patient_id = ? AND action = 'PURGE'").get(P1_ID) as any;
      expect(audit).toBeDefined();
      expect(audit.actor).toBe('Data Privacy Officer');
    });
  });

  describe('Maintenance and Temp Cleanup Endpoint', () => {
    it('POST /api/governance/maintenance/cleanup-temp cleans orphaned temporary files', async () => {
      const res = await request(app).post('/api/governance/maintenance/cleanup-temp');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.cleanedFilesCount).toBeDefined();
    });
  });
});
