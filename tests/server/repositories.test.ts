import Database from 'better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';
import { initializeSchema } from '../../src/server/db/database.js';
import { AllergyRepository } from '../../src/server/repositories/allergyRepository.js';
import { AuditLogRepository } from '../../src/server/repositories/auditLogRepository.js';
import { DiagnosisRepository } from '../../src/server/repositories/diagnosisRepository.js';
import { LabMeasurementRepository } from '../../src/server/repositories/labMeasurementRepository.js';
import { MedicationRepository } from '../../src/server/repositories/medicationRepository.js';
import { PatientRepository } from '../../src/server/repositories/patientRepository.js';
import { AuditService } from '../../src/server/services/auditService.js';

describe('SQLite Repositories & Audit Persistence', () => {
  let db: Database.Database;
  let patientRepo: PatientRepository;
  let medRepo: MedicationRepository;
  let allergyRepo: AllergyRepository;
  let diagRepo: DiagnosisRepository;
  let labRepo: LabMeasurementRepository;
  let auditRepo: AuditLogRepository;
  let auditService: AuditService;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    initializeSchema(db);

    patientRepo = new PatientRepository(db);
    medRepo = new MedicationRepository(db);
    allergyRepo = new AllergyRepository(db);
    diagRepo = new DiagnosisRepository(db);
    labRepo = new LabMeasurementRepository(db);
    auditRepo = new AuditLogRepository(db);
    auditService = new AuditService(auditRepo);
  });

  it('performs CRUD operations for patient with SQLite persistence', () => {
    // CREATE
    const patient = patientRepo.create({
      mrn: 'SYNTH-99001',
      name: 'Test Patient',
      dateOfBirth: '1950-01-01',
      gender: 'male',
      weightKg: 80,
      heightCm: 175,
      primaryPhysician: 'Dr. Test',
      careSetting: 'Outpatient Clinic',
      emergencyContact: 'Contact - 555-0000',
      notes: 'Initial test note',
    });

    expect(patient).toBeDefined();
    expect(patient.id).toBeDefined();
    expect(patient.name).toBe('Test Patient');

    // READ
    const fetched = patientRepo.findById(patient.id);
    expect(fetched).not.toBeNull();
    expect(fetched?.mrn).toBe('SYNTH-99001');

    // UPDATE
    const updated = patientRepo.update(patient.id, {
      name: 'Test Patient Updated',
      weightKg: 82.5,
    });
    expect(updated?.name).toBe('Test Patient Updated');
    expect(updated?.weightKg).toBe(82.5);

    // DELETE
    const deleted = patientRepo.delete(patient.id);
    expect(deleted).toBe(true);
    expect(patientRepo.findById(patient.id)).toBeNull();
  });

  it('stores and retrieves medications with JSON active ingredients', () => {
    const patient = patientRepo.create({
      mrn: 'SYNTH-MED-01',
      name: 'Med Patient',
      dateOfBirth: '1945-06-15',
      gender: 'female',
      primaryPhysician: 'Dr. Doctor',
      careSetting: 'Home',
      emergencyContact: 'Family - 555-1111',
    });

    const med = medRepo.create({
      patientId: patient.id,
      brand: 'Augmentin',
      genericName: 'Amoxicillin and Clavulanate Potassium',
      activeIngredients: [
        { name: 'Amoxicillin', strength: '500 mg' },
        { name: 'Clavulanate Potassium', strength: '125 mg' },
      ],
      salt: 'Potassium',
      strength: '500/125 mg',
      formulation: 'Tablet',
      route: 'Oral',
      prescribedDose: '1 tablet',
      frequency: 'Every 12 hours with food',
      administrationInstructions: 'Take at the start of a meal',
      prescriber: 'Dr. Doctor',
      source: 'Clinic Rx',
      status: 'active',
      verificationStatus: 'unverified',
    });

    expect(med.id).toBeDefined();
    expect(med.activeIngredients).toHaveLength(2);
    expect(med.activeIngredients[0].name).toBe('Amoxicillin');

    // Update verification status
    const verified = medRepo.updateVerificationStatus(med.id, 'confirmed');
    expect(verified?.verificationStatus).toBe('confirmed');
  });

  it('records audit log entries with previous and new states', () => {
    const patient = patientRepo.create({
      mrn: 'SYNTH-AUDIT-01',
      name: 'Audit Patient',
      dateOfBirth: '1952-03-20',
      gender: 'other',
      primaryPhysician: 'Dr. Auditor',
      careSetting: 'Assisted Living',
      emergencyContact: 'Contact - 555-2222',
    });

    auditService.logCreate(
      patient.id,
      'patient',
      patient.id,
      'Dr. Auditor',
      'Created test patient',
      patient
    );

    const logsAfterCreate = auditRepo.findByPatientId(patient.id);
    expect(logsAfterCreate).toHaveLength(1);
    expect(logsAfterCreate[0].action).toBe('CREATE');
    expect(logsAfterCreate[0].actor).toBe('Dr. Auditor');

    // Status change audit
    auditService.logStatusChange(
      patient.id,
      'medication',
      'med-fake-id',
      'Pharmacist Lisa',
      'Confirmed prescription',
      'unverified',
      'confirmed'
    );

    const allLogs = auditRepo.findByPatientId(patient.id);
    expect(allLogs).toHaveLength(2);
    expect(allLogs[0].action).toBe('STATUS_CHANGE');
    expect(allLogs[0].changedFields).toContain('verificationStatus');
  });
});
