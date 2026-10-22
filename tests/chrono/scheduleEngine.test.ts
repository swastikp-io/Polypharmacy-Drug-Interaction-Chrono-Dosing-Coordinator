import { describe, it, expect } from 'vitest';
import { CircadianScheduleCoordinator } from '../../src/server/services/chrono/scheduleCoordinator.js';
import type { Medication, Patient } from '../../src/shared/types.js';
import type { PatientRoutine } from '../../src/shared/chronoTypes.js';

describe('CircadianScheduleCoordinator - Engine Tests', () => {
  const coordinator = new CircadianScheduleCoordinator();

  const dummyPatient: Patient = {
    id: 'test-patient-1',
    mrn: 'TEST-12345',
    name: 'Robert Miller',
    dateOfBirth: '1945-06-15',
    gender: 'male',
    weightKg: 72,
    heightCm: 172,
    primaryPhysician: 'Dr. Jane Smith, MD',
    careSetting: 'Community',
    emergencyContact: 'Mary Miller (Daughter)',
    notes: 'Test patient',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const defaultRoutine: PatientRoutine = {
    patientId: dummyPatient.id,
    wakeTime: '07:00',
    breakfastTime: '08:00',
    lunchTime: '12:30',
    dinnerTime: '18:30',
    bedTime: '21:30',
    updatedAt: new Date().toISOString(),
  };

  it('preserves prescribed doses, formulation, and frequencies strictly (Safety Invariant)', () => {
    const meds: Medication[] = [
      {
        id: 'med-metformin',
        patientId: dummyPatient.id,
        brand: 'Glucophage',
        genericName: 'Metformin Hydrochloride',
        activeIngredients: [{ name: 'Metformin', strength: '500 mg' }],
        salt: 'Hydrochloride',
        strength: '500 mg',
        formulation: 'Extended-Release Tablet',
        route: 'Oral',
        prescribedDose: '1 tablet (500 mg)',
        frequency: 'Twice daily with meals',
        administrationInstructions: 'Take with breakfast and dinner.',
        prescriber: 'Dr. Smith',
        source: 'EHR',
        status: 'active',
        verificationStatus: 'confirmed',
        startDate: '2022-01-01',
        endDate: null,
        indication: 'T2D',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    const timeline = coordinator.generateSchedule({
      patient: dummyPatient,
      medications: meds,
      routine: defaultRoutine,
    });

    // Check slots: Metformin BID should be in Breakfast and Dinner
    const breakfastSlot = timeline.slots.find((s) => s.slotId === 'slot_breakfast');
    const dinnerSlot = timeline.slots.find((s) => s.slotId === 'slot_evening_dinner');

    expect(breakfastSlot).toBeDefined();
    expect(dinnerSlot).toBeDefined();

    const breakfastDose = breakfastSlot?.doses.find((d) => d.medicationId === 'med-metformin');
    const dinnerDose = dinnerSlot?.doses.find((d) => d.medicationId === 'med-metformin');

    expect(breakfastDose).toBeDefined();
    expect(dinnerDose).toBeDefined();

    // SAFETY INVARIANT: Dose amount must NOT be modified (e.g. 500 mg remains 500 mg)
    expect(breakfastDose?.prescribedDose).toBe('1 tablet (500 mg)');
    expect(dinnerDose?.prescribedDose).toBe('1 tablet (500 mg)');
    expect(breakfastDose?.formulation).toBe('Extended-Release Tablet');
    expect(dinnerDose?.formulation).toBe('Extended-Release Tablet');

    // Comparison audit must report 100% dose preservation
    expect(timeline.comparison.totalMedications).toBe(1);
    expect(timeline.comparison.unchangedDoseCount).toBe(1);
    expect(timeline.comparison.items[0].doseIntegrityStatus).toBe('strictly_preserved');
  });

  it('schedules Levothyroxine in morning fasted slot and enforces 4-hour separation from Calcium', () => {
    const meds: Medication[] = [
      {
        id: 'med-levo',
        patientId: dummyPatient.id,
        brand: 'Synthroid',
        genericName: 'Levothyroxine Sodium',
        activeIngredients: [{ name: 'Levothyroxine', strength: '75 mcg' }],
        salt: 'Sodium',
        strength: '75 mcg',
        formulation: 'Oral Tablet',
        route: 'Oral',
        prescribedDose: '1 tablet (75 mcg)',
        frequency: 'Once daily in morning',
        administrationInstructions: 'Take on empty stomach 60 min before breakfast.',
        prescriber: 'Dr. Smith',
        source: 'EHR',
        status: 'active',
        verificationStatus: 'confirmed',
        startDate: '2020-01-01',
        endDate: null,
        indication: 'Hypothyroidism',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'med-calc',
        patientId: dummyPatient.id,
        brand: 'Caltrate',
        genericName: 'Calcium Carbonate',
        activeIngredients: [{ name: 'Calcium Carbonate', strength: '600 mg' }],
        salt: 'Carbonate',
        strength: '600 mg',
        formulation: 'Oral Tablet',
        route: 'Oral',
        prescribedDose: '1 tablet (600 mg)',
        frequency: 'Twice daily with meals',
        administrationInstructions: 'Take with food.',
        prescriber: 'Dr. Smith',
        source: 'EHR',
        status: 'active',
        verificationStatus: 'confirmed',
        startDate: '2021-01-01',
        endDate: null,
        indication: 'Osteopenia',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    const timeline = coordinator.generateSchedule({
      patient: dummyPatient,
      medications: meds,
      routine: defaultRoutine,
    });

    const fastedSlot = timeline.slots.find((s) => s.slotId === 'slot_wake_fasted');
    const lunchSlot = timeline.slots.find((s) => s.slotId === 'slot_midday_lunch');
    const dinnerSlot = timeline.slots.find((s) => s.slotId === 'slot_evening_dinner');

    expect(fastedSlot).toBeDefined();
    expect(lunchSlot).toBeDefined();
    expect(dinnerSlot).toBeDefined();

    // Levothyroxine placed in wake fasted slot
    const levoDose = fastedSlot?.doses.find((d) => d.medicationId === 'med-levo');
    expect(levoDose).toBeDefined();
    expect(levoDose?.foodRelation).toBe('empty_stomach');
    expect(levoDose?.scheduledTime).toBe(defaultRoutine.wakeTime); // 07:00

    // Calcium placed in lunch & dinner slots (12:30 and 18:30) >= 4 hours after 07:00
    const calcLunch = lunchSlot?.doses.find((d) => d.medicationId === 'med-calc');
    const calcDinner = dinnerSlot?.doses.find((d) => d.medicationId === 'med-calc');
    expect(calcLunch).toBeDefined();
    expect(calcDinner).toBeDefined();
    expect(calcLunch?.foodRelation).toBe('with_meal');

    // 07:00 to 12:30 is 5.5 hours, satisfying the >= 4h chelation window
    expect(timeline.comparison.items.some((i) => i.comparisonStatus === 'timing_optimized_for_safety')).toBe(true);
  });

  it('detects bedtime diuretic hazard and raises an urgent prescriber review conflict', () => {
    const meds: Medication[] = [
      {
        id: 'med-furosemide',
        patientId: dummyPatient.id,
        brand: 'Lasix',
        genericName: 'Furosemide',
        activeIngredients: [{ name: 'Furosemide', strength: '40 mg' }],
        salt: 'None',
        strength: '40 mg',
        formulation: 'Oral Tablet',
        route: 'Oral',
        prescribedDose: '1 tablet (40 mg)',
        frequency: 'Once daily at bedtime', // HAZARDOUS PRESCRIBED TIMING
        administrationInstructions: 'Take at bedtime with water.',
        prescriber: 'Dr. Smith',
        source: 'EHR',
        status: 'active',
        verificationStatus: 'confirmed',
        startDate: '2023-01-01',
        endDate: null,
        indication: 'Edema',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    const timeline = coordinator.generateSchedule({
      patient: dummyPatient,
      medications: meds,
      routine: defaultRoutine,
    });

    // An urgent review conflict must be raised
    const diureticConflict = timeline.conflicts.find(
      (c) => c.conflictType === 'bedtime_diuretic_hazard'
    );

    expect(diureticConflict).toBeDefined();
    expect(diureticConflict?.severity).toBe('urgent_prescriber_review');
    expect(diureticConflict?.clinicalRationale).toContain('nocturia');
    expect(diureticConflict?.clinicalRationale).toContain('fall');

    // The draft schedule overrides bedtime to morning to protect the patient
    const breakfastSlot = timeline.slots.find((s) => s.slotId === 'slot_breakfast');
    expect(breakfastSlot?.doses.some((d) => d.medicationId === 'med-furosemide')).toBe(true);

    const bedtimeSlot = timeline.slots.find((s) => s.slotId === 'slot_bedtime');
    expect(bedtimeSlot?.doses.some((d) => d.medicationId === 'med-furosemide')).toBeFalsy();
  });

  it('schedules short-acting statins (Simvastatin) and sedative-hypnotics (Zolpidem) at bedtime', () => {
    const meds: Medication[] = [
      {
        id: 'med-simva',
        patientId: dummyPatient.id,
        brand: 'Zocor',
        genericName: 'Simvastatin',
        activeIngredients: [{ name: 'Simvastatin', strength: '20 mg' }],
        salt: 'None',
        strength: '20 mg',
        formulation: 'Oral Tablet',
        route: 'Oral',
        prescribedDose: '1 tablet (20 mg)',
        frequency: 'Once daily at bedtime',
        administrationInstructions: 'Take at bedtime.',
        prescriber: 'Dr. Smith',
        source: 'EHR',
        status: 'active',
        verificationStatus: 'confirmed',
        startDate: '2022-01-01',
        endDate: null,
        indication: 'Hyperlipidemia',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'med-zolpidem',
        patientId: dummyPatient.id,
        brand: 'Ambien',
        genericName: 'Zolpidem Tartrate',
        activeIngredients: [{ name: 'Zolpidem', strength: '5 mg' }],
        salt: 'Tartrate',
        strength: '5 mg',
        formulation: 'Oral Tablet',
        route: 'Oral',
        prescribedDose: '1 tablet (5 mg)',
        frequency: 'At bedtime as needed',
        administrationInstructions: 'Take immediately prior to sleep in bed.',
        prescriber: 'Dr. Smith',
        source: 'EHR',
        status: 'active',
        verificationStatus: 'confirmed',
        startDate: '2023-01-01',
        endDate: null,
        indication: 'Insomnia',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    const timeline = coordinator.generateSchedule({
      patient: dummyPatient,
      medications: meds,
      routine: defaultRoutine,
    });

    const bedtimeSlot = timeline.slots.find((s) => s.slotId === 'slot_bedtime');
    expect(bedtimeSlot).toBeDefined();

    const simvaDose = bedtimeSlot?.doses.find((d) => d.medicationId === 'med-simva');
    expect(simvaDose).toBeDefined();
    expect(simvaDose?.timingRationale).toContain('HMG-CoA reductase');

    const zolpidemDose = bedtimeSlot?.doses.find((d) => d.medicationId === 'med-zolpidem');
    expect(zolpidemDose).toBeDefined();
    expect(zolpidemDose?.specialPrecautions.some((p) => p.includes('fall'))).toBe(true);
  });

  it('warns that systemic metabolic PK interactions cannot be resolved merely by spacing', () => {
    const meds: Medication[] = [
      {
        id: 'med-apixaban',
        patientId: dummyPatient.id,
        brand: 'Eliquis',
        genericName: 'Apixaban',
        activeIngredients: [{ name: 'Apixaban', strength: '5 mg' }],
        salt: 'None',
        strength: '5 mg',
        formulation: 'Oral Tablet',
        route: 'Oral',
        prescribedDose: '1 tablet (5 mg)',
        frequency: 'Twice daily',
        administrationInstructions: 'Take morning and evening.',
        prescriber: 'Dr. Smith',
        source: 'EHR',
        status: 'active',
        verificationStatus: 'confirmed',
        startDate: '2022-01-01',
        endDate: null,
        indication: 'AFib',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'med-clarithro',
        patientId: dummyPatient.id,
        brand: 'Biaxin',
        genericName: 'Clarithromycin',
        activeIngredients: [{ name: 'Clarithromycin', strength: '500 mg' }],
        salt: 'None',
        strength: '500 mg',
        formulation: 'Oral Tablet',
        route: 'Oral',
        prescribedDose: '1 tablet (500 mg)',
        frequency: 'Twice daily',
        administrationInstructions: 'Take with food.',
        prescriber: 'Dr. Cover',
        source: 'Urgent Care',
        status: 'active',
        verificationStatus: 'confirmed',
        startDate: '2026-02-01',
        endDate: null,
        indication: 'Pneumonia',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    const timeline = coordinator.generateSchedule({
      patient: dummyPatient,
      medications: meds,
      routine: defaultRoutine,
    });

    const systemicConflict = timeline.conflicts.find(
      (c) => c.conflictType === 'systemic_pk_unresolved_by_spacing'
    );

    expect(systemicConflict).toBeDefined();
    expect(systemicConflict?.clinicalRationale).toContain('Temporal spacing of administration times does NOT resolve');
    expect(systemicConflict?.recommendedAction).toContain('DO NOT attempt to manage this interaction by spacing');
  });

  it('explicitly flags unverified prescription records with low confidence and data gaps', () => {
    const meds: Medication[] = [
      {
        id: 'med-unverified-lisinopril',
        patientId: dummyPatient.id,
        brand: 'Prinivil',
        genericName: 'Lisinopril',
        activeIngredients: [{ name: 'Lisinopril', strength: '10 mg' }],
        salt: 'Dihydrate',
        strength: '10 mg',
        formulation: 'Oral Tablet',
        route: 'Oral',
        prescribedDose: '1 tablet (10 mg)',
        frequency: 'Once daily in morning',
        administrationInstructions: 'Take with water in morning.',
        prescriber: 'Dr. Smith',
        source: 'OCR Draft Intake',
        status: 'active',
        verificationStatus: 'unverified', // UNVERIFIED ORDER
        startDate: '2026-02-01',
        endDate: null,
        indication: 'HTN',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    const timeline = coordinator.generateSchedule({
      patient: dummyPatient,
      medications: meds,
      routine: defaultRoutine,
    });

    // Dose must have confidence = 'low'
    const breakfastSlot = timeline.slots.find((s) => s.slotId === 'slot_breakfast');
    const dose = breakfastSlot?.doses.find((d) => d.medicationId === 'med-unverified-lisinopril');

    expect(dose).toBeDefined();
    expect(dose?.confidence).toBe('low');
    expect(dose?.uncertaintyReasons.some((r) => r.includes('unverified'))).toBe(true);

    // Unconfident medications list must include this item
    expect(timeline.unconfidentMedications.some((u) => u.medicationId === 'med-unverified-lisinopril')).toBe(true);
    expect(timeline.comparison.unverifiedCount).toBe(1);
    expect(timeline.comparison.items[0].comparisonStatus).toBe('unverified_data_gap');
  });

  it('adapts target time slots to custom patient daily routines', () => {
    const customRoutine: PatientRoutine = {
      patientId: dummyPatient.id,
      wakeTime: '06:00', // Early riser
      breakfastTime: '07:15',
      lunchTime: '11:45',
      dinnerTime: '17:30',
      bedTime: '20:45',
      updatedAt: new Date().toISOString(),
    };

    const meds: Medication[] = [
      {
        id: 'med-levo',
        patientId: dummyPatient.id,
        brand: 'Synthroid',
        genericName: 'Levothyroxine Sodium',
        activeIngredients: [{ name: 'Levothyroxine', strength: '50 mcg' }],
        salt: 'Sodium',
        strength: '50 mcg',
        formulation: 'Oral Tablet',
        route: 'Oral',
        prescribedDose: '1 tablet (50 mcg)',
        frequency: 'Once daily in morning fasted',
        administrationInstructions: 'Take on waking.',
        prescriber: 'Dr. Smith',
        source: 'EHR',
        status: 'active',
        verificationStatus: 'confirmed',
        startDate: '2021-01-01',
        endDate: null,
        indication: 'Hypothyroidism',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    const timeline = coordinator.generateSchedule({
      patient: dummyPatient,
      medications: meds,
      routine: customRoutine,
    });

    const fastedSlot = timeline.slots.find((s) => s.slotId === 'slot_wake_fasted');
    expect(fastedSlot?.targetTime).toBe('06:00'); // Matches custom wake time
    expect(timeline.patientRoutine.wakeTime).toBe('06:00');
    expect(timeline.patientRoutine.dinnerTime).toBe('17:30');
  });

  it('keeps PRN medications flexible without forcing them into fixed clock slots', () => {
    const meds: Medication[] = [
      {
        id: 'med-prn-percocet',
        patientId: dummyPatient.id,
        brand: 'Percocet',
        genericName: 'Oxycodone and Acetaminophen',
        activeIngredients: [
          { name: 'Oxycodone', strength: '5 mg' },
          { name: 'Acetaminophen', strength: '325 mg' },
        ],
        salt: 'Hydrochloride',
        strength: '5 mg / 325 mg',
        formulation: 'Oral Tablet',
        route: 'Oral',
        prescribedDose: '1 tablet',
        frequency: 'Every 6 hours as needed for severe pain',
        administrationInstructions: 'Take with food if needed for severe breakthrough pain.',
        prescriber: 'Dr. Surgeon',
        source: 'Discharge',
        status: 'prn',
        verificationStatus: 'confirmed',
        startDate: '2026-01-01',
        endDate: null,
        indication: 'Acute breakthrough pain',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    const timeline = coordinator.generateSchedule({
      patient: dummyPatient,
      medications: meds,
      routine: defaultRoutine,
    });

    // Percocet should be in prnDoses
    expect(timeline.prnDoses.length).toBe(1);
    expect(timeline.prnDoses[0].medicationId).toBe('med-prn-percocet');
    expect(timeline.prnDoses[0].scheduledTime).toBe('PRN');

    // Not forced into regular slots
    expect(timeline.slots.every((s) => s.doses.every((d) => d.medicationId !== 'med-prn-percocet'))).toBe(true);
    expect(timeline.comparison.items[0].comparisonStatus).toBe('prn_flexible');
  });
});
