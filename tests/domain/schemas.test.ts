import { describe, expect, it } from 'vitest';
import {
  CreateAllergySchema,
  CreateDiagnosisSchema,
  CreateLabMeasurementSchema,
  CreateMedicationSchema,
  CreatePatientSchema,
  StatusUpdateSchema,
} from '../../src/shared/schemas.js';

describe('Domain Schemas - Validation', () => {
  it('validates a correct patient payload', () => {
    const validPatient = {
      mrn: 'SYNTH-12345',
      name: 'John Doe',
      dateOfBirth: '1945-05-12',
      gender: 'male',
      weightKg: 78.5,
      heightCm: 172.0,
      primaryPhysician: 'Dr. Jane Smith',
      careSetting: 'Community Home',
      emergencyContact: 'Mary Doe - (555) 123-4567',
    };

    const parsed = CreatePatientSchema.safeParse(validPatient);
    expect(parsed.success).toBe(true);
  });

  it('rejects patient with invalid date of birth format', () => {
    const invalidPatient = {
      mrn: 'SYNTH-12345',
      name: 'John Doe',
      dateOfBirth: '05/12/1945', // Bad format
      gender: 'male',
      primaryPhysician: 'Dr. Jane Smith',
      careSetting: 'Community Home',
      emergencyContact: 'Mary Doe',
    };

    const parsed = CreatePatientSchema.safeParse(invalidPatient);
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.errors[0].path).toContain('dateOfBirth');
    }
  });

  it('validates a complete medication with all 12 required fields', () => {
    const validMed = {
      patientId: '11111111-1111-1111-1111-111111111111',
      brand: 'Lipitor',
      genericName: 'Atorvastatin Calcium',
      activeIngredients: [{ name: 'Atorvastatin', strength: '20 mg' }],
      salt: 'Calcium Trihydrate',
      strength: '20 mg',
      formulation: 'Tablet',
      route: 'Oral',
      prescribedDose: '1 tablet (20 mg)',
      frequency: 'Once daily at bedtime',
      administrationInstructions: 'Take with water at bedtime',
      prescriber: 'Dr. Robert Patel, MD',
      source: 'Electronic Health Record',
      status: 'active',
      verificationStatus: 'confirmed',
    };

    const parsed = CreateMedicationSchema.safeParse(validMed);
    expect(parsed.success).toBe(true);
  });

  it('rejects medication with empty active ingredients array', () => {
    const invalidMed = {
      patientId: '11111111-1111-1111-1111-111111111111',
      brand: 'Lipitor',
      genericName: 'Atorvastatin',
      activeIngredients: [], // Empty!
      salt: 'None',
      strength: '20 mg',
      formulation: 'Tablet',
      route: 'Oral',
      prescribedDose: '1 tablet',
      frequency: 'Daily',
      administrationInstructions: 'Take at bedtime',
      prescriber: 'Dr. Patel',
      source: 'EHR',
    };

    const parsed = CreateMedicationSchema.safeParse(invalidMed);
    expect(parsed.success).toBe(false);
  });

  it('validates lab measurement with numerical value and units', () => {
    const validLab = {
      patientId: '11111111-1111-1111-1111-111111111111',
      testName: 'eGFR',
      category: 'renal',
      value: 45.2,
      unit: 'mL/min/1.73m²',
      referenceRange: '> 60 mL/min/1.73m²',
      interpretation: 'low',
      collectionDate: '2026-08-10',
      verificationStatus: 'confirmed',
      source: 'Central Lab',
    };

    const parsed = CreateLabMeasurementSchema.safeParse(validLab);
    expect(parsed.success).toBe(true);
  });

  it('validates verification status updates', () => {
    const validStatus = {
      verificationStatus: 'confirmed',
      actor: 'Clinical Pharmacist',
      reason: 'Confirmed against discharge summary',
    };

    const parsed = StatusUpdateSchema.safeParse(validStatus);
    expect(parsed.success).toBe(true);

    const invalidStatus = {
      verificationStatus: 'invalid_status_enum',
      actor: '',
    };
    const invalidParsed = StatusUpdateSchema.safeParse(invalidStatus);
    expect(invalidParsed.success).toBe(false);
  });
});
