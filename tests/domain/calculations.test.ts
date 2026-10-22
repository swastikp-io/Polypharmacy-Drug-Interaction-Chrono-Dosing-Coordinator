import { describe, expect, it } from 'vitest';
import {
  calculateAge,
  calculateCockcroftGaultCrCl,
  classifyEGFR,
  computeChangedFields,
  detectDuplicateIngredients,
  normalizeIngredientName,
} from '../../src/shared/calculations.js';
import type { Medication } from '../../src/shared/types.js';

describe('Calculations - Normalization & Duplicate Ingredient Detection', () => {
  it('normalizes ingredient names and synonyms accurately', () => {
    expect(normalizeIngredientName('  Acetaminophen  ')).toBe('acetaminophen');
    expect(normalizeIngredientName('Paracetamol')).toBe('acetaminophen');
    expect(normalizeIngredientName('APAP')).toBe('acetaminophen');
    expect(normalizeIngredientName('Acetylsalicylic Acid')).toBe('aspirin');
    expect(normalizeIngredientName('ASA')).toBe('aspirin');
    expect(normalizeIngredientName('HCTZ')).toBe('hydrochlorothiazide');
  });

  it('detects duplicate active ingredients across active/PRN medications', () => {
    const meds: Medication[] = [
      {
        id: 'med-1',
        patientId: 'pat-1',
        brand: 'Tylenol Extra Strength',
        genericName: 'Acetaminophen',
        activeIngredients: [{ name: 'Acetaminophen', strength: '500 mg' }],
        salt: 'None',
        strength: '500 mg',
        formulation: 'Tablet',
        route: 'Oral',
        prescribedDose: '1 tablet',
        frequency: 'Q6H PRN',
        administrationInstructions: 'Take with water',
        prescriber: 'Dr. Smith',
        source: 'Self-Report',
        status: 'active',
        verificationStatus: 'confirmed',
        startDate: null,
        endDate: null,
        indication: 'Arthritis',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'med-2',
        patientId: 'pat-1',
        brand: 'Percocet',
        genericName: 'Oxycodone/Acetaminophen',
        activeIngredients: [
          { name: 'Oxycodone', strength: '5 mg' },
          { name: 'Paracetamol', strength: '325 mg' }, // using synonym
        ],
        salt: 'Hydrochloride',
        strength: '5/325 mg',
        formulation: 'Tablet',
        route: 'Oral',
        prescribedDose: '1 tablet',
        frequency: 'Q6H PRN',
        administrationInstructions: 'Take with food',
        prescriber: 'Dr. Surgeon',
        source: 'Discharge Summary',
        status: 'prn',
        verificationStatus: 'confirmed',
        startDate: null,
        endDate: null,
        indication: 'Post-op pain',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'med-3',
        patientId: 'pat-1',
        brand: 'Lisinopril',
        genericName: 'Lisinopril',
        activeIngredients: [{ name: 'Lisinopril', strength: '10 mg' }],
        salt: 'Dihydrate',
        strength: '10 mg',
        formulation: 'Tablet',
        route: 'Oral',
        prescribedDose: '1 tablet',
        frequency: 'Daily',
        administrationInstructions: 'Morning',
        prescriber: 'Dr. Smith',
        source: 'EHR',
        status: 'active',
        verificationStatus: 'confirmed',
        startDate: null,
        endDate: null,
        indication: 'HTN',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    const duplicates = detectDuplicateIngredients(meds);

    expect(duplicates).toHaveLength(1);
    expect(duplicates[0].normalizedName).toBe('acetaminophen');
    expect(duplicates[0].totalMedicationCount).toBe(2);
    expect(duplicates[0].severity).toBe('high');
    expect(duplicates[0].clinicalRationale).toContain('Hepatotoxicity');
    expect(duplicates[0].medications.map((m) => m.brand)).toEqual(
      expect.arrayContaining(['Tylenol Extra Strength', 'Percocet'])
    );
  });

  it('ignores discontinued medications when evaluating duplicate ingredients', () => {
    const meds: Medication[] = [
      {
        id: 'med-1',
        patientId: 'pat-1',
        brand: 'Motrin',
        genericName: 'Ibuprofen',
        activeIngredients: [{ name: 'Ibuprofen', strength: '400 mg' }],
        salt: 'None',
        strength: '400 mg',
        formulation: 'Tablet',
        route: 'Oral',
        prescribedDose: '1 tablet',
        frequency: 'TID PRN',
        administrationInstructions: 'With food',
        prescriber: 'Dr. Smith',
        source: 'EHR',
        status: 'discontinued', // Discontinued!
        verificationStatus: 'confirmed',
        startDate: null,
        endDate: null,
        indication: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'med-2',
        patientId: 'pat-1',
        brand: 'Advil',
        genericName: 'Ibuprofen',
        activeIngredients: [{ name: 'Ibuprofen', strength: '200 mg' }],
        salt: 'None',
        strength: '200 mg',
        formulation: 'Tablet',
        route: 'Oral',
        prescribedDose: '1 tablet',
        frequency: 'Daily',
        administrationInstructions: 'With water',
        prescriber: 'Dr. Smith',
        source: 'OTC',
        status: 'active',
        verificationStatus: 'confirmed',
        startDate: null,
        endDate: null,
        indication: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    const duplicates = detectDuplicateIngredients(meds);
    expect(duplicates).toHaveLength(0);
  });
});

describe('Calculations - Clinical Functions', () => {
  it('calculates patient age correctly', () => {
    const refDate = new Date('2026-10-22');
    expect(calculateAge('1948-03-14', refDate)).toBe(78);
    expect(calculateAge('1948-12-01', refDate)).toBe(77);
  });

  it('calculates Cockcroft-Gault Creatinine Clearance with female adjustment factor', () => {
    // Male: ((140 - 70) * 72) / (72 * 1.0) * 1.0 = (70 * 72) / 72 = 70.0
    const crclMale = calculateCockcroftGaultCrCl({
      age: 70,
      weightKg: 72,
      serumCreatinineMgDl: 1.0,
      gender: 'male',
    });
    expect(crclMale).toBe(70.0);

    // Female: 70.0 * 0.85 = 59.5
    const crclFemale = calculateCockcroftGaultCrCl({
      age: 70,
      weightKg: 72,
      serumCreatinineMgDl: 1.0,
      gender: 'female',
    });
    expect(crclFemale).toBe(59.5);
  });

  it('returns null for missing or invalid parameters in Cockcroft-Gault calculation', () => {
    expect(
      calculateCockcroftGaultCrCl({
        age: 70,
        weightKg: null,
        serumCreatinineMgDl: 1.0,
        gender: 'female',
      })
    ).toBeNull();

    expect(
      calculateCockcroftGaultCrCl({
        age: 70,
        weightKg: 65,
        serumCreatinineMgDl: 0,
        gender: 'male',
      })
    ).toBeNull();
  });

  it('classifies eGFR into correct KDIGO CKD stages', () => {
    expect(classifyEGFR(95).stage).toBe('Stage 1');
    expect(classifyEGFR(75).stage).toBe('Stage 2');
    expect(classifyEGFR(52).stage).toBe('Stage 3a');
    expect(classifyEGFR(38).stage).toBe('Stage 3b');
    expect(classifyEGFR(22).stage).toBe('Stage 4');
    expect(classifyEGFR(12).stage).toBe('Stage 5');
    expect(classifyEGFR(null).stage).toBe('Unknown');
  });

  it('computes changed fields accurately between state revisions', () => {
    const prev = { brand: 'Tylenol', strength: '325 mg', frequency: 'Q6H', updatedAt: '2026-01-01' };
    const next = { brand: 'Tylenol', strength: '500 mg', frequency: 'Q4H', updatedAt: '2026-01-02' };

    const changed = computeChangedFields(prev, next);
    expect(changed).toContain('strength');
    expect(changed).toContain('frequency');
    expect(changed).not.toContain('brand');
    expect(changed).not.toContain('updatedAt'); // Ignored timestamp
  });
});
