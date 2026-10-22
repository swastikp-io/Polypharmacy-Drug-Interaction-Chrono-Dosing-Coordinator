import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { initializeSchema } from '../../src/server/db/database.js';
import { seedSyntheticData, resetSyntheticDataset } from '../../src/server/db/seeds.js';

describe('Synthetic Dataset Seeding & Reset Safeguards', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    initializeSchema(db);
  });

  describe('1. Idempotent Database Seeding', () => {
    it('seeds all 8 synthetic patient profiles, medications, labs, and routines into an empty database', () => {
      const summary = seedSyntheticData(db);

      expect(summary.patientsSeeded).toBe(8);
      expect(summary.totalSyntheticPatients).toBe(8);
      expect(summary.medicationsSeeded).toBeGreaterThanOrEqual(30);
      expect(summary.totalSyntheticMedications).toBeGreaterThanOrEqual(30);
      expect(summary.labsSeeded).toBeGreaterThanOrEqual(15);
      expect(summary.routinesSeeded).toBe(8);
      expect(summary.isIdempotentRun).toBe(false);

      // Verify specific patient records
      const patients = db.prepare('SELECT id, mrn, name FROM patients ORDER BY mrn').all() as any[];
      expect(patients.length).toBe(8);

      const mrns = patients.map((p) => p.mrn);
      expect(mrns).toContain('SYNTH-84920'); // Eleanor Vance
      expect(mrns).toContain('SYNTH-49211'); // Arthur Pendelton
      expect(mrns).toContain('SYNTH-92841'); // Margaret Chen
      expect(mrns).toContain('SYNTH-30482'); // Harold Finch
      expect(mrns).toContain('SYNTH-51924'); // Beatrice Holloway
      expect(mrns).toContain('SYNTH-68215'); // Walter Sterling
      expect(mrns).toContain('SYNTH-74391'); // Evelyn Montgomery
      expect(mrns).toContain('SYNTH-83107'); // Samuel O'Reilly

      // Verify every patient has a SYNTH- prefix for strict synthetic isolation
      for (const p of patients) {
        expect(p.mrn.startsWith('SYNTH-')).toBe(true);
      }
    });

    it('IDEMPOTENCE: Re-running the seed script does not create duplicate patient or medication records', () => {
      // First run: seeds initial dataset
      const firstRun = seedSyntheticData(db);
      expect(firstRun.patientsSeeded).toBe(8);

      const patientCount1 = (db.prepare('SELECT count(*) as c FROM patients').get() as { c: number }).c;
      const medCount1 = (db.prepare('SELECT count(*) as c FROM medications').get() as { c: number }).c;
      const labCount1 = (db.prepare('SELECT count(*) as c FROM lab_measurements').get() as { c: number }).c;

      // Second run: must be completely idempotent
      const secondRun = seedSyntheticData(db);
      expect(secondRun.patientsSeeded).toBe(0);
      expect(secondRun.medicationsSeeded).toBe(0);
      expect(secondRun.labsSeeded).toBe(0);
      expect(secondRun.isIdempotentRun).toBe(true);

      const patientCount2 = (db.prepare('SELECT count(*) as c FROM patients').get() as { c: number }).c;
      const medCount2 = (db.prepare('SELECT count(*) as c FROM medications').get() as { c: number }).c;
      const labCount2 = (db.prepare('SELECT count(*) as c FROM lab_measurements').get() as { c: number }).c;

      expect(patientCount2).toBe(patientCount1);
      expect(medCount2).toBe(medCount1);
      expect(labCount2).toBe(labCount1);
    });

    it('SAFETY: Preserves clinician-verified records and does not overwrite modified fields', () => {
      seedSyntheticData(db);

      // Clinician verifies Atorvastatin for Eleanor Vance
      db.prepare(`
        UPDATE medications
        SET verification_status = 'confirmed', prescriber = 'Dr. Verified Clinician, MD'
        WHERE id = 'med-p1-6'
      `).run();

      const verifiedBefore = db
        .prepare('SELECT verification_status, prescriber FROM medications WHERE id = ?')
        .get('med-p1-6') as any;
      expect(verifiedBefore.verification_status).toBe('confirmed');
      expect(verifiedBefore.prescriber).toBe('Dr. Verified Clinician, MD');

      // Re-run seed script
      seedSyntheticData(db);

      const verifiedAfter = db
        .prepare('SELECT verification_status, prescriber FROM medications WHERE id = ?')
        .get('med-p1-6') as any;

      // Clinician's verification and edit MUST NOT be reverted by seed data
      expect(verifiedAfter.verification_status).toBe('confirmed');
      expect(verifiedAfter.prescriber).toBe('Dr. Verified Clinician, MD');
    });
  });

  describe('2. Test Dataset Reset Safeguards', () => {
    it('REJECTS reset without exact confirmation token', () => {
      seedSyntheticData(db);

      expect(() => resetSyntheticDataset(db, 'wrong_token')).toThrow(
        /Invalid confirmation token/
      );
      expect(() => resetSyntheticDataset(db, '')).toThrow(
        /Invalid confirmation token/
      );

      // Confirm records were not touched
      const count = (db.prepare('SELECT count(*) as c FROM patients').get() as { c: number }).c;
      expect(count).toBe(8);
    });

    it('RESETS dedicated synthetic test dataset cleanly when exact confirmation token is supplied', () => {
      seedSyntheticData(db);

      const resetSummary = resetSyntheticDataset(db, 'CONFIRM_RESET_TEST_DATASET');

      expect(resetSummary.success).toBe(true);
      expect(resetSummary.deletedPatientsCount).toBe(8);
      expect(resetSummary.deletedMedicationsCount).toBeGreaterThanOrEqual(30);

      // Post-reset state should have pristine 8 re-seeded patients
      const patientCount = (db.prepare('SELECT count(*) as c FROM patients').get() as { c: number }).c;
      expect(patientCount).toBe(8);
    });

    it('SAFEGUARD: Never deletes non-synthetic or production patients during test reset', () => {
      seedSyntheticData(db);

      // Insert a simulated non-synthetic / production patient (no SYNTH- prefix)
      const nonSynthId = 'real-patient-9999';
      db.prepare(`
        INSERT INTO patients (
          id, mrn, name, date_of_birth, gender, weight_kg, height_cm,
          primary_physician, care_setting, emergency_contact, notes, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        nonSynthId,
        'CLINICAL-10045',
        'Real Inpatient Record',
        '1950-01-01',
        'male',
        70,
        170,
        'Dr. Hospital, MD',
        'ICU',
        'Emergency (555) 000-0000',
        'Simulated production record without SYNTH prefix',
        new Date().toISOString(),
        new Date().toISOString()
      );

      // Execute reset
      resetSyntheticDataset(db, 'CONFIRM_RESET_TEST_DATASET');

      // The non-synthetic record MUST survive the reset!
      const nonSynthRecord = db.prepare('SELECT id, mrn FROM patients WHERE id = ?').get(nonSynthId) as any;
      expect(nonSynthRecord).toBeDefined();
      expect(nonSynthRecord.mrn).toBe('CLINICAL-10045');
    });
  });
});
