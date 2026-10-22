import type Database from 'better-sqlite3';
import { ensurePrescriptionFixturesOnDisk } from '../fixtures/prescriptionFixtures.js';

export interface SeedSummary {
  patientsSeeded: number;
  medicationsSeeded: number;
  allergiesSeeded: number;
  diagnosesSeeded: number;
  labsSeeded: number;
  routinesSeeded: number;
  totalSyntheticPatients: number;
  totalSyntheticMedications: number;
  isIdempotentRun: boolean;
}

export interface ResetSummary {
  success: boolean;
  message: string;
  deletedPatientsCount: number;
  deletedMedicationsCount: number;
  deletedLabsCount: number;
  resetAt: string;
}

/**
 * Idempotently seeds the dedicated synthetic clinical dataset into SQLite.
 *
 * SAFETY INVARIANTS:
 * 1. Checks if records already exist by stable synthetic IDs before inserting.
 * 2. Never overwrites or modifies verified / clinician-reconciled records with seed data.
 * 3. Stable synthetic IDs: p1111111... through p8888888...
 * 4. All MRNs strictly prefixed with SYNTH- to clearly isolate synthetic test profiles.
 * 5. Also ensures test prescription image and PDF fixtures exist in data/test-fixtures/.
 */
export function seedSyntheticData(db: Database.Database): SeedSummary {
  const now = new Date().toISOString();

  // Ensure disk fixtures exist
  try {
    ensurePrescriptionFixturesOnDisk();
  } catch (err) {
    console.warn('[Seeds] Warning: Could not verify test fixtures on disk:', err);
  }

  // Prepared statements for idempotent inserts (INSERT OR IGNORE)
  const insertPatient = db.prepare(`
    INSERT OR IGNORE INTO patients (
      id, mrn, name, date_of_birth, gender, weight_kg, height_cm,
      primary_physician, care_setting, emergency_contact, notes, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertMed = db.prepare(`
    INSERT OR IGNORE INTO medications (
      id, patient_id, brand, generic_name, active_ingredients_json, salt, strength,
      formulation, route, prescribed_dose, frequency, administration_instructions,
      prescriber, source, status, verification_status, start_date, end_date, indication,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertAllergy = db.prepare(`
    INSERT OR IGNORE INTO allergies (
      id, patient_id, allergen, allergen_type, reaction, severity,
      verification_status, date_recorded, source, notes, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertDiagnosis = db.prepare(`
    INSERT OR IGNORE INTO diagnoses (
      id, patient_id, condition, code, clinical_status, verification_status,
      onset_date, date_recorded, source, notes, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertLab = db.prepare(`
    INSERT OR IGNORE INTO lab_measurements (
      id, patient_id, test_name, category, value, unit, reference_range,
      interpretation, collection_date, verification_status, source, notes, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertRoutine = db.prepare(`
    INSERT OR IGNORE INTO patient_routines (
      patient_id, wake_time, breakfast_time, lunch_time, dinner_time, bed_time, notes, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertAudit = db.prepare(`
    INSERT OR IGNORE INTO audit_logs (
      id, patient_id, entity_type, entity_id, action, timestamp,
      actor, summary, previous_state, new_state, changed_fields_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let patientsInserted = 0;
  let medsInserted = 0;
  let allergiesInserted = 0;
  let diagnosesInserted = 0;
  let labsInserted = 0;
  let routinesInserted = 0;

  const transaction = db.transaction(() => {
    // =========================================================================
    // PATIENT 1: ELEANOR VANCE (Age 78, CKD 3a, Duplicate APAP Hazard)
    // =========================================================================
    const p1Id = 'p1111111-1111-1111-1111-111111111111';
    const r1 = insertPatient.run(
      p1Id,
      'SYNTH-84920',
      'Eleanor Vance',
      '1948-03-14',
      'female',
      68.0,
      162.0,
      'Dr. Robert Patel, MD (Geriatrics)',
      'Independent Living with Home Support',
      'Thomas Vance (Son) - (555) 234-8901',
      '[SYNTHETIC / TEST DATA] Active synthetic profile. Key clinical issue: Co-prescribed OTC acetaminophen and discharge oxycodone/APAP post knee arthroscopy.',
      now,
      now
    );
    if (r1.changes > 0) patientsInserted++;

    insertAudit.run(
      'aud-p1-init',
      p1Id,
      'patient',
      p1Id,
      'CREATE',
      now,
      'Clinical System Importer',
      'Created synthetic patient profile for Eleanor Vance [SYNTHETIC / TEST DATA]',
      null,
      JSON.stringify({ name: 'Eleanor Vance', mrn: 'SYNTH-84920' }),
      JSON.stringify(['name', 'mrn', 'gender', 'dateOfBirth'])
    );

    const rRoutine1 = insertRoutine.run(
      p1Id,
      '07:00',
      '08:00',
      '12:30',
      '18:30',
      '21:30',
      'Community geriatric routine',
      now,
      now
    );
    if (rRoutine1.changes > 0) routinesInserted++;

    const p1Diagnoses = [
      {
        id: 'diag-p1-1',
        condition: 'Chronic Kidney Disease Stage 3a',
        code: 'ICD-10 N18.31',
        clinicalStatus: 'active',
        verificationStatus: 'confirmed',
        onsetDate: '2024-05-12',
        dateRecorded: '2026-01-15',
        source: 'Nephrology Consult Note',
        notes: 'Baseline eGFR around 42 mL/min/1.73m2. Monitor for drug accumulation.',
      },
      {
        id: 'diag-p1-2',
        condition: 'Type 2 Diabetes Mellitus without acute complications',
        code: 'ICD-10 E11.9',
        clinicalStatus: 'active',
        verificationStatus: 'confirmed',
        onsetDate: '2015-11-20',
        dateRecorded: '2026-01-15',
        source: 'Primary Care Problem List',
        notes: 'HbA1c 7.1% on Metformin mono-therapy.',
      },
      {
        id: 'diag-p1-3',
        condition: 'Primary Essential Hypertension',
        code: 'ICD-10 I10',
        clinicalStatus: 'active',
        verificationStatus: 'confirmed',
        onsetDate: '2010-06-18',
        dateRecorded: '2026-01-15',
        source: 'Primary Care Problem List',
        notes: 'Controlled on Lisinopril + Amlodipine regimen.',
      },
      {
        id: 'diag-p1-4',
        condition: 'Severe Bilateral Osteoarthritis of Knees',
        code: 'ICD-10 M17.0',
        clinicalStatus: 'active',
        verificationStatus: 'confirmed',
        onsetDate: '2018-09-04',
        dateRecorded: '2026-02-10',
        source: 'Orthopedic Evaluation',
        notes: 'Underwent right knee arthroscopy 6 weeks ago.',
      },
    ];

    for (const d of p1Diagnoses) {
      const rd = insertDiagnosis.run(
        d.id,
        p1Id,
        d.condition,
        d.code,
        d.clinicalStatus,
        d.verificationStatus,
        d.onsetDate,
        d.dateRecorded,
        d.source,
        d.notes,
        now,
        now
      );
      if (rd.changes > 0) diagnosesInserted++;
    }

    const p1Allergies = [
      {
        id: 'all-p1-1',
        allergen: 'Penicillin',
        allergenType: 'drug',
        reaction: 'Anaphylaxis and respiratory distress',
        severity: 'life-threatening',
        verificationStatus: 'confirmed',
        dateRecorded: '2020-04-12',
        source: 'Inpatient Hospital Record',
        notes: 'Severe reaction in 2020 requiring epinephrine.',
      },
      {
        id: 'all-p1-2',
        allergen: 'Sulfamethoxazole / Trimethoprim (Bactrim)',
        allergenType: 'drug',
        reaction: 'Generalized maculopapular rash and pruritus',
        severity: 'moderate',
        verificationStatus: 'unverified',
        dateRecorded: '2026-02-14',
        source: 'Patient Self-Report',
        notes: 'Patient recalls developing rash 10 years ago during UTI treatment.',
      },
    ];

    for (const a of p1Allergies) {
      const ra = insertAllergy.run(
        a.id,
        p1Id,
        a.allergen,
        a.allergenType,
        a.reaction,
        a.severity,
        a.verificationStatus,
        a.dateRecorded,
        a.source,
        a.notes,
        now,
        now
      );
      if (ra.changes > 0) allergiesInserted++;
    }

    const p1Labs = [
      {
        id: 'lab-p1-1',
        testName: 'eGFR (CKD-EPI 2021)',
        category: 'renal',
        value: 42.0,
        unit: 'mL/min/1.73m²',
        referenceRange: '> 60 mL/min/1.73m²',
        interpretation: 'low',
        collectionDate: '2026-08-10',
        verificationStatus: 'confirmed',
        source: 'Regional Health Outpatient Lab',
        notes: '[SYNTHETIC_TEST_DATA] Stage 3a CKD. Renal clearance reduced.',
      },
      {
        id: 'lab-p1-2',
        testName: 'Serum Creatinine',
        category: 'renal',
        value: 1.45,
        unit: 'mg/dL',
        referenceRange: '0.50 - 1.10 mg/dL',
        interpretation: 'high',
        collectionDate: '2026-08-10',
        verificationStatus: 'confirmed',
        source: 'Regional Health Outpatient Lab',
        notes: '[SYNTHETIC_TEST_DATA] Elevated from baseline 1.2 mg/dL six months prior.',
      },
      {
        id: 'lab-p1-3',
        testName: 'Blood Urea Nitrogen (BUN)',
        category: 'renal',
        value: 26.0,
        unit: 'mg/dL',
        referenceRange: '7.0 - 20.0 mg/dL',
        interpretation: 'high',
        collectionDate: '2026-08-10',
        verificationStatus: 'confirmed',
        source: 'Regional Health Outpatient Lab',
        notes: '[SYNTHETIC_TEST_DATA] Mildly elevated BUN/Cr ratio.',
      },
      {
        id: 'lab-p1-4',
        testName: 'Alanine Aminotransferase (ALT)',
        category: 'hepatic',
        value: 22.0,
        unit: 'U/L',
        referenceRange: '7.0 - 35.0 U/L',
        interpretation: 'normal',
        collectionDate: '2026-08-10',
        verificationStatus: 'confirmed',
        source: 'Regional Health Outpatient Lab',
        notes: '[SYNTHETIC_TEST_DATA] Baseline transaminase within normal reference limits.',
      },
      {
        id: 'lab-p1-5',
        testName: 'Aspartate Aminotransferase (AST)',
        category: 'hepatic',
        value: 24.0,
        unit: 'U/L',
        referenceRange: '8.0 - 33.0 U/L',
        interpretation: 'normal',
        collectionDate: '2026-08-10',
        verificationStatus: 'confirmed',
        source: 'Regional Health Outpatient Lab',
        notes: '[SYNTHETIC_TEST_DATA] Normal baseline AST.',
      },
      {
        id: 'lab-p1-6',
        testName: 'Potassium (Serum)',
        category: 'renal',
        value: 4.4,
        unit: 'mEq/L',
        referenceRange: '3.5 - 5.0 mEq/L',
        interpretation: 'normal',
        collectionDate: '2026-08-10',
        verificationStatus: 'confirmed',
        source: 'Regional Health Outpatient Lab',
        notes: '[SYNTHETIC_TEST_DATA] Normal serum potassium on lisinopril.',
      },
    ];

    for (const l of p1Labs) {
      const rl = insertLab.run(
        l.id,
        p1Id,
        l.testName,
        l.category,
        l.value,
        l.unit,
        l.referenceRange,
        l.interpretation,
        l.collectionDate,
        l.verificationStatus,
        l.source,
        l.notes,
        now,
        now
      );
      if (rl.changes > 0) labsInserted++;
    }

    const p1Meds = [
      {
        id: 'med-p1-1',
        brand: 'Glucophage XR',
        genericName: 'Metformin Hydrochloride',
        activeIngredients: [{ name: 'Metformin', strength: '500 mg' }],
        salt: 'Hydrochloride',
        strength: '500 mg',
        formulation: 'Extended-Release Tablet',
        route: 'Oral',
        prescribedDose: '1 tablet (500 mg)',
        frequency: 'Twice daily with meals',
        administrationInstructions: 'Take 1 tablet with morning breakfast and 1 tablet with evening dinner.',
        prescriber: 'Dr. Robert Patel, MD',
        source: 'Outpatient Pharmacy Fill',
        status: 'active',
        verificationStatus: 'confirmed',
        startDate: '2020-03-10',
        endDate: null,
        indication: 'Type 2 Diabetes Mellitus',
      },
      {
        id: 'med-p1-2',
        brand: 'Prinivil',
        genericName: 'Lisinopril',
        activeIngredients: [{ name: 'Lisinopril', strength: '10 mg' }],
        salt: 'Dihydrate',
        strength: '10 mg',
        formulation: 'Oral Tablet',
        route: 'Oral',
        prescribedDose: '1 tablet (10 mg)',
        frequency: 'Once daily in morning',
        administrationInstructions: 'Take 1 tablet by mouth each morning with a full glass of water.',
        prescriber: 'Dr. Robert Patel, MD',
        source: 'Primary Care Problem List',
        status: 'active',
        verificationStatus: 'confirmed',
        startDate: '2016-08-22',
        endDate: null,
        indication: 'Hypertension',
      },
      {
        id: 'med-p1-3',
        brand: 'Norvasc',
        genericName: 'Amlodipine Besylate',
        activeIngredients: [{ name: 'Amlodipine', strength: '5 mg' }],
        salt: 'Besylate',
        strength: '5 mg',
        formulation: 'Oral Tablet',
        route: 'Oral',
        prescribedDose: '1 tablet (5 mg)',
        frequency: 'Once daily in morning',
        administrationInstructions: 'Take with morning medications.',
        prescriber: 'Dr. Robert Patel, MD',
        source: 'Primary Care Problem List',
        status: 'active',
        verificationStatus: 'confirmed',
        startDate: '2019-11-05',
        endDate: null,
        indication: 'Hypertension',
      },
      {
        id: 'med-p1-4',
        brand: 'Percocet 5/325',
        genericName: 'Oxycodone Hydrochloride and Acetaminophen',
        activeIngredients: [
          { name: 'Oxycodone', strength: '5 mg' },
          { name: 'Acetaminophen', strength: '325 mg' },
        ],
        salt: 'Hydrochloride',
        strength: '5 mg / 325 mg',
        formulation: 'Oral Tablet',
        route: 'Oral',
        prescribedDose: '1 tablet (5 mg / 325 mg)',
        frequency: 'Every 6 hours as needed for severe post-op pain',
        administrationInstructions: 'Take 1 tablet every 6 hours PRN severe knee pain. Do not exceed 4 tablets in 24 hours.',
        prescriber: 'Dr. Katherine Bell, MD (Orthopedics)',
        source: 'Surgical Discharge Orders',
        status: 'active',
        verificationStatus: 'confirmed',
        startDate: '2026-02-10',
        endDate: '2026-03-10',
        indication: 'Post-operative Knee Arthroscopy Pain',
      },
      {
        id: 'med-p1-5',
        brand: 'Tylenol Extra Strength',
        genericName: 'Acetaminophen',
        activeIngredients: [{ name: 'Acetaminophen', strength: '500 mg' }],
        salt: 'None',
        strength: '500 mg',
        formulation: 'Oral Tablet',
        route: 'Oral',
        prescribedDose: '2 tablets (1000 mg)',
        frequency: 'Every 8 hours as needed',
        administrationInstructions: 'Take 2 tablets with water for baseline knee stiffness.',
        prescriber: 'Patient Self-Report (OTC)',
        source: 'Patient Self-Report',
        status: 'active',
        verificationStatus: 'confirmed',
        startDate: '2022-01-01',
        endDate: null,
        indication: 'Chronic Osteoarthritis Joint Pain',
      },
      {
        id: 'med-p1-6',
        brand: 'Lipitor',
        genericName: 'Atorvastatin Calcium',
        activeIngredients: [{ name: 'Atorvastatin', strength: '20 mg' }],
        salt: 'Calcium Trihydrate',
        strength: '20 mg',
        formulation: 'Oral Tablet',
        route: 'Oral',
        prescribedDose: '1 tablet (20 mg)',
        frequency: 'Once daily at bedtime',
        administrationInstructions: 'Take 1 tablet at bedtime.',
        prescriber: 'Dr. Robert Patel, MD',
        source: 'External EHR Import',
        status: 'active',
        verificationStatus: 'unverified',
        startDate: '2026-02-14',
        endDate: null,
        indication: 'Hyperlipidemia / Primary ASCVD Prevention',
      },
    ];

    for (const m of p1Meds) {
      const rm = insertMed.run(
        m.id,
        p1Id,
        m.brand,
        m.genericName,
        JSON.stringify(m.activeIngredients),
        m.salt,
        m.strength,
        m.formulation,
        m.route,
        m.prescribedDose,
        m.frequency,
        m.administrationInstructions,
        m.prescriber,
        m.source,
        m.status,
        m.verificationStatus,
        m.startDate,
        m.endDate,
        m.indication,
        now,
        now
      );
      if (rm.changes > 0) medsInserted++;
    }

    // =========================================================================
    // PATIENT 2: ARTHUR PENDELTON (Age 84, AFib, Hepatic Impairment)
    // =========================================================================
    const p2Id = 'p2222222-2222-2222-2222-222222222222';
    const r2 = insertPatient.run(
      p2Id,
      'SYNTH-49211',
      'Arthur Pendelton',
      '1942-07-28',
      'male',
      82.0,
      175.0,
      'Dr. Katherine Bell, MD (Cardiology)',
      'Assisted Living Community',
      'Martha Pendelton (Daughter) - (555) 876-5432',
      '[SYNTHETIC / TEST DATA] Non-valvular AFib with elevated baseline transaminases and INR instability. Co-prescribed Warfarin and Amiodarone.',
      now,
      now
    );
    if (r2.changes > 0) patientsInserted++;

    insertRoutine.run(p2Id, '07:00', '08:00', '12:30', '18:30', '21:30', 'Assisted living routine', now, now);
    routinesInserted++;

    const p2Diagnoses = [
      {
        id: 'diag-p2-1',
        condition: 'Non-valvular Atrial Fibrillation',
        code: 'ICD-10 I48.0',
        clinicalStatus: 'active',
        verificationStatus: 'confirmed',
        onsetDate: '2017-04-10',
        dateRecorded: '2026-01-10',
        source: 'Cardiology Clinic Note',
        notes: 'CHA2DS2-VASc score = 4. Anticoagulated with Warfarin.',
      },
      {
        id: 'diag-p2-2',
        condition: 'Chronic Congestive Heart Failure, NYHA Class II',
        code: 'ICD-10 I50.22',
        clinicalStatus: 'active',
        verificationStatus: 'confirmed',
        onsetDate: '2019-11-03',
        dateRecorded: '2026-01-10',
        source: 'Cardiology Clinic Note',
        notes: 'LVEF 40-45%. Maintained on loop diuretic and beta blocker.',
      },
      {
        id: 'diag-p2-3',
        condition: 'Hepatic Impairment / Steatohepatitis',
        code: 'ICD-10 K75.81',
        clinicalStatus: 'active',
        verificationStatus: 'confirmed',
        onsetDate: '2022-03-14',
        dateRecorded: '2026-01-10',
        source: 'Gastroenterology Evaluation',
        notes: 'Elevated transaminases and mild hepatic clearance impairment.',
      },
      {
        id: 'diag-p2-4',
        condition: 'Chronic Insomnia in Older Adults',
        code: 'ICD-10 G47.00',
        clinicalStatus: 'active',
        verificationStatus: 'confirmed',
        onsetDate: '2021-08-01',
        dateRecorded: '2026-01-10',
        source: 'Primary Care Problem List',
        notes: 'Prescribed Zolpidem QHS PRN; falls risk advisory.',
      },
    ];

    for (const d of p2Diagnoses) {
      const rd = insertDiagnosis.run(
        d.id,
        p2Id,
        d.condition,
        d.code,
        d.clinicalStatus,
        d.verificationStatus,
        d.onsetDate,
        d.dateRecorded,
        d.source,
        d.notes,
        now,
        now
      );
      if (rd.changes > 0) diagnosesInserted++;
    }

    insertAllergy.run(
      'all-p2-1',
      p2Id,
      'Sulfamethoxazole',
      'drug',
      'Urticaria',
      'moderate',
      'confirmed',
      '2018-09-12',
      'Allergy Clinic',
      'Sulfa drug allergy confirmed.',
      now,
      now
    );
    allergiesInserted++;

    const p2Labs = [
      {
        id: 'lab-p2-1',
        testName: 'Total Bilirubin',
        category: 'hepatic',
        value: 2.2,
        unit: 'mg/dL',
        referenceRange: '0.2 - 1.2 mg/dL',
        interpretation: 'high',
        collectionDate: '2026-08-12',
        verificationStatus: 'confirmed',
        source: 'Regional Hospital Lab',
        notes: '[SYNTHETIC_TEST_DATA] Elevated bilirubin.',
      },
      {
        id: 'lab-p2-2',
        testName: 'Serum Albumin',
        category: 'hepatic',
        value: 3.1,
        unit: 'g/dL',
        referenceRange: '3.5 - 5.0 g/dL',
        interpretation: 'low',
        collectionDate: '2026-08-12',
        verificationStatus: 'confirmed',
        source: 'Regional Hospital Lab',
        notes: '[SYNTHETIC_TEST_DATA] Mild hypoalbuminemia.',
      },
      {
        id: 'lab-p2-3',
        testName: 'Aspartate Aminotransferase (AST)',
        category: 'hepatic',
        value: 64.0,
        unit: 'U/L',
        referenceRange: '8.0 - 33.0 U/L',
        interpretation: 'high',
        collectionDate: '2026-08-12',
        verificationStatus: 'confirmed',
        source: 'Regional Hospital Lab',
        notes: '[SYNTHETIC_TEST_DATA] Elevated AST.',
      },
      {
        id: 'lab-p2-4',
        testName: 'Alanine Aminotransferase (ALT)',
        category: 'hepatic',
        value: 58.0,
        unit: 'U/L',
        referenceRange: '7.0 - 35.0 U/L',
        interpretation: 'high',
        collectionDate: '2026-08-12',
        verificationStatus: 'confirmed',
        source: 'Regional Hospital Lab',
        notes: '[SYNTHETIC_TEST_DATA] Elevated ALT.',
      },
      {
        id: 'lab-p2-5',
        testName: 'Prothrombin Time / INR',
        category: 'other',
        value: 2.4,
        unit: 'INR',
        referenceRange: '2.0 - 3.0 INR',
        interpretation: 'normal',
        collectionDate: '2026-08-12',
        verificationStatus: 'confirmed',
        source: 'Anticoagulation Clinic',
        notes: '[SYNTHETIC_TEST_DATA] Target INR therapeutic range.',
      },
    ];

    for (const l of p2Labs) {
      const rl = insertLab.run(
        l.id,
        p2Id,
        l.testName,
        l.category,
        l.value,
        l.unit,
        l.referenceRange,
        l.interpretation,
        l.collectionDate,
        l.verificationStatus,
        l.source,
        l.notes,
        now,
        now
      );
      if (rl.changes > 0) labsInserted++;
    }

    const p2Meds = [
      {
        id: 'med-p2-1',
        brand: 'Coumadin',
        genericName: 'Warfarin Sodium',
        activeIngredients: [{ name: 'Warfarin', strength: '4 mg' }],
        salt: 'Sodium',
        strength: '4 mg',
        formulation: 'Oral Tablet',
        route: 'Oral',
        prescribedDose: '1 tablet (4 mg)',
        frequency: 'Once daily in the evening at 18:00',
        administrationInstructions: 'Take 1 tablet daily at 6:00 PM. Consistent dietary vitamin K intake required.',
        prescriber: 'Dr. Katherine Bell, MD (Cardiology)',
        source: 'Anticoagulation Clinic',
        status: 'active',
        verificationStatus: 'confirmed',
        startDate: '2017-05-01',
        endDate: null,
        indication: 'Stroke Prophylaxis in Atrial Fibrillation',
      },
      {
        id: 'med-p2-2',
        brand: 'Pacerone',
        genericName: 'Amiodarone Hydrochloride',
        activeIngredients: [{ name: 'Amiodarone', strength: '200 mg' }],
        salt: 'Hydrochloride',
        strength: '200 mg',
        formulation: 'Oral Tablet',
        route: 'Oral',
        prescribedDose: '1 tablet (200 mg)',
        frequency: 'Once daily with morning breakfast',
        administrationInstructions: 'Take with food in the morning. Potent CYP2C9 inhibitor.',
        prescriber: 'Dr. Katherine Bell, MD (Cardiology)',
        source: 'Cardiology Clinic Note',
        status: 'active',
        verificationStatus: 'confirmed',
        startDate: '2021-02-15',
        endDate: null,
        indication: 'Rhythm Control for Atrial Fibrillation',
      },
      {
        id: 'med-p2-3',
        brand: 'Lasix',
        genericName: 'Furosemide',
        activeIngredients: [{ name: 'Furosemide', strength: '40 mg' }],
        salt: 'None',
        strength: '40 mg',
        formulation: 'Oral Tablet',
        route: 'Oral',
        prescribedDose: '1 tablet (40 mg)',
        frequency: 'Once daily in the morning',
        administrationInstructions: 'Take 1 tablet by mouth each morning. Do not take late in evening to avoid nocturia.',
        prescriber: 'Dr. Katherine Bell, MD',
        source: 'Primary Care Problem List',
        status: 'active',
        verificationStatus: 'confirmed',
        startDate: '2019-11-10',
        endDate: null,
        indication: 'Fluid Overload / Congestive Heart Failure',
      },
      {
        id: 'med-p2-4',
        brand: 'Lopressor',
        genericName: 'Metoprolol Tartrate',
        activeIngredients: [{ name: 'Metoprolol', strength: '25 mg' }],
        salt: 'Tartrate',
        strength: '25 mg',
        formulation: 'Oral Tablet',
        route: 'Oral',
        prescribedDose: '1 tablet (25 mg)',
        frequency: 'Twice daily with meals',
        administrationInstructions: 'Take with breakfast and dinner meals.',
        prescriber: 'Dr. Katherine Bell, MD',
        source: 'Primary Care Problem List',
        status: 'active',
        verificationStatus: 'confirmed',
        startDate: '2018-06-20',
        endDate: null,
        indication: 'Rate Control in Atrial Fibrillation / Heart Failure',
      },
      {
        id: 'med-p2-5',
        brand: 'Ambien',
        genericName: 'Zolpidem Tartrate',
        activeIngredients: [{ name: 'Zolpidem', strength: '5 mg' }],
        salt: 'Tartrate',
        strength: '5 mg',
        formulation: 'Oral Tablet',
        route: 'Oral',
        prescribedDose: '1 tablet (5 mg)',
        frequency: 'Once daily at bedtime as needed for sleep',
        administrationInstructions: 'Take immediately before retiring at bedtime. Caution: falls hazard.',
        prescriber: 'Dr. Robert Patel, MD',
        source: 'External Pharmacy Claim',
        status: 'active',
        verificationStatus: 'unverified',
        startDate: '2026-02-18',
        endDate: null,
        indication: 'Insomnia',
      },
    ];

    for (const m of p2Meds) {
      const rm = insertMed.run(
        m.id,
        p2Id,
        m.brand,
        m.genericName,
        JSON.stringify(m.activeIngredients),
        m.salt,
        m.strength,
        m.formulation,
        m.route,
        m.prescribedDose,
        m.frequency,
        m.administrationInstructions,
        m.prescriber,
        m.source,
        m.status,
        m.verificationStatus,
        m.startDate,
        m.endDate,
        m.indication,
        now,
        now
      );
      if (rm.changes > 0) medsInserted++;
    }

    // =========================================================================
    // PATIENT 3: MARGARET CHEN (Age 72, Osteoporosis, Hypothyroidism)
    // =========================================================================
    const p3Id = 'p3333333-3333-3333-3333-333333333333';
    const r3 = insertPatient.run(
      p3Id,
      'SYNTH-92841',
      'Margaret Chen',
      '1954-11-09',
      'female',
      58.0,
      155.0,
      'Dr. William Davis, MD (Internal Medicine)',
      'Community Living / Independent',
      'Kevin Chen (Son) - (555) 345-6789',
      '[SYNTHETIC / TEST DATA] Key chronotherapeutic challenge: Levothyroxine fasting morning requirement vs Calcium Carbonate chelation, Alendronate weekly fasting protocol.',
      now,
      now
    );
    if (r3.changes > 0) patientsInserted++;

    insertRoutine.run(p3Id, '06:30', '08:00', '12:30', '18:30', '22:00', 'Independent active senior routine', now, now);
    routinesInserted++;

    const p3Diagnoses = [
      {
        id: 'diag-p3-1',
        condition: 'Severe Postmenopausal Osteoporosis',
        code: 'ICD-10 M81.0',
        clinicalStatus: 'active',
        verificationStatus: 'confirmed',
        onsetDate: '2021-05-18',
        dateRecorded: '2026-01-20',
        source: 'DEXA Bone Densitometry',
        notes: 'T-score -2.8 in lumbar spine. Prescribed Alendronate + Calcium/Vitamin D.',
      },
      {
        id: 'diag-p3-2',
        condition: 'Primary Hypothyroidism (Hashimoto)',
        code: 'ICD-10 E03.9',
        clinicalStatus: 'active',
        verificationStatus: 'confirmed',
        onsetDate: '2016-03-12',
        dateRecorded: '2026-01-20',
        source: 'Endocrinology Note',
        notes: 'TSH elevated at diagnosis; maintained on Levothyroxine.',
      },
      {
        id: 'diag-p3-3',
        condition: 'Gastroesophageal Reflux Disease with Esophagitis',
        code: 'ICD-10 K21.0',
        clinicalStatus: 'active',
        verificationStatus: 'confirmed',
        onsetDate: '2019-09-08',
        dateRecorded: '2026-01-20',
        source: 'Gastroenterology Note',
        notes: 'Maintained on daily Omeprazole 20 mg.',
      },
      {
        id: 'diag-p3-4',
        condition: 'Major Depressive Disorder, Single Episode, In Remission',
        code: 'ICD-10 F32.1',
        clinicalStatus: 'active',
        verificationStatus: 'confirmed',
        onsetDate: '2022-11-15',
        dateRecorded: '2026-01-20',
        source: 'Psychiatry Note',
        notes: 'Stable on Sertraline 50 mg.',
      },
    ];

    for (const d of p3Diagnoses) {
      const rd = insertDiagnosis.run(
        d.id,
        p3Id,
        d.condition,
        d.code,
        d.clinicalStatus,
        d.verificationStatus,
        d.onsetDate,
        d.dateRecorded,
        d.source,
        d.notes,
        now,
        now
      );
      if (rd.changes > 0) diagnosesInserted++;
    }

    insertAllergy.run(
      'all-p3-1',
      p3Id,
      'Codeine',
      'drug',
      'Severe nausea and emesis',
      'moderate',
      'confirmed',
      '2017-06-11',
      'Surgical History',
      'Gastrointestinal intolerance to opioid codeine.',
      now,
      now
    );
    allergiesInserted++;

    const p3Labs = [
      {
        id: 'lab-p3-1',
        testName: 'Thyroid Stimulating Hormone (TSH)',
        category: 'other',
        value: 5.2,
        unit: 'uIU/mL',
        referenceRange: '0.45 - 4.50 uIU/mL',
        interpretation: 'high',
        collectionDate: '2026-08-05',
        verificationStatus: 'confirmed',
        source: 'Outpatient Lab',
        notes: '[SYNTHETIC_TEST_DATA] Elevated TSH reflecting GI absorption impairment.',
      },
      {
        id: 'lab-p3-2',
        testName: 'Free Thyroxine (Free T4)',
        category: 'other',
        value: 0.85,
        unit: 'ng/dL',
        referenceRange: '0.82 - 1.77 ng/dL',
        interpretation: 'normal',
        collectionDate: '2026-08-05',
        verificationStatus: 'confirmed',
        source: 'Outpatient Lab',
        notes: '[SYNTHETIC_TEST_DATA] Borderline low free T4.',
      },
      {
        id: 'lab-p3-3',
        testName: 'Calcium (Serum)',
        category: 'other',
        value: 8.9,
        unit: 'mg/dL',
        referenceRange: '8.6 - 10.2 mg/dL',
        interpretation: 'normal',
        collectionDate: '2026-08-05',
        verificationStatus: 'confirmed',
        source: 'Outpatient Lab',
        notes: '[SYNTHETIC_TEST_DATA] Normal serum calcium on supplement.',
      },
    ];

    for (const l of p3Labs) {
      const rl = insertLab.run(
        l.id,
        p3Id,
        l.testName,
        l.category,
        l.value,
        l.unit,
        l.referenceRange,
        l.interpretation,
        l.collectionDate,
        l.verificationStatus,
        l.source,
        l.notes,
        now,
        now
      );
      if (rl.changes > 0) labsInserted++;
    }

    const p3Meds = [
      {
        id: 'med-p3-1',
        brand: 'Synthroid',
        genericName: 'Levothyroxine Sodium',
        activeIngredients: [{ name: 'Levothyroxine', strength: '75 mcg' }],
        salt: 'Sodium',
        strength: '75 mcg (0.075 mg)',
        formulation: 'Oral Tablet',
        route: 'Oral',
        prescribedDose: '1 tablet (75 mcg)',
        frequency: 'Once daily in the morning on an empty stomach',
        administrationInstructions: 'Take first thing in the morning with a full glass of water, at least 60 minutes before breakfast.',
        prescriber: 'Dr. William Davis, MD',
        source: 'Endocrinology Specialty Care',
        status: 'active',
        verificationStatus: 'confirmed',
        startDate: '2016-04-01',
        endDate: null,
        indication: 'Primary Hypothyroidism',
      },
      {
        id: 'med-p3-2',
        brand: 'Caltrate 600+D3',
        genericName: 'Calcium Carbonate and Cholecalciferol',
        activeIngredients: [
          { name: 'Calcium Carbonate', strength: '600 mg elemental' },
          { name: 'Vitamin D3', strength: '800 IU' },
        ],
        salt: 'Carbonate',
        strength: '600 mg / 800 IU',
        formulation: 'Oral Tablet',
        route: 'Oral',
        prescribedDose: '1 tablet (600 mg / 800 IU)',
        frequency: 'Once daily with lunch meal',
        administrationInstructions: 'Take with midday lunch meal. Separate by at least 4 hours from thyroid hormone.',
        prescriber: 'Dr. William Davis, MD',
        source: 'Endocrinology Specialty Care',
        status: 'active',
        verificationStatus: 'confirmed',
        startDate: '2021-06-01',
        endDate: null,
        indication: 'Osteoporosis Bone Mineral Density Maintenance',
      },
      {
        id: 'med-p3-3',
        brand: 'Fosamax',
        genericName: 'Alendronate Sodium',
        activeIngredients: [{ name: 'Alendronate', strength: '70 mg' }],
        salt: 'Sodium',
        strength: '70 mg',
        formulation: 'Oral Tablet',
        route: 'Oral',
        prescribedDose: '1 tablet (70 mg)',
        frequency: 'Once weekly on Sunday morning',
        administrationInstructions: 'Take with plain water upon waking. Must remain upright for 30 minutes before any food.',
        prescriber: 'Dr. William Davis, MD',
        source: 'Endocrinology Specialty Care',
        status: 'active',
        verificationStatus: 'confirmed',
        startDate: '2021-06-01',
        endDate: null,
        indication: 'Osteoporosis Treatment',
      },
      {
        id: 'med-p3-4',
        brand: 'Prilosec',
        genericName: 'Omeprazole',
        activeIngredients: [{ name: 'Omeprazole', strength: '20 mg' }],
        salt: 'None',
        strength: '20 mg',
        formulation: 'Delayed-Release Capsule',
        route: 'Oral',
        prescribedDose: '1 capsule (20 mg)',
        frequency: 'Once daily in the morning',
        administrationInstructions: 'Take 30 minutes before breakfast.',
        prescriber: 'Dr. William Davis, MD',
        source: 'Primary Care Problem List',
        status: 'active',
        verificationStatus: 'confirmed',
        startDate: '2019-10-01',
        endDate: null,
        indication: 'GERD',
      },
      {
        id: 'med-p3-5',
        brand: 'Zoloft',
        genericName: 'Sertraline Hydrochloride',
        activeIngredients: [{ name: 'Sertraline', strength: '50 mg' }],
        salt: 'Hydrochloride',
        strength: '50 mg',
        formulation: 'Oral Tablet',
        route: 'Oral',
        prescribedDose: '1 tablet (50 mg)',
        frequency: 'Once daily in the morning with breakfast',
        administrationInstructions: 'Take with food in the morning to prevent GI upset.',
        prescriber: 'Dr. William Davis, MD',
        source: 'Primary Care Problem List',
        status: 'active',
        verificationStatus: 'confirmed',
        startDate: '2023-01-15',
        endDate: null,
        indication: 'Depression / Anxiety',
      },
    ];

    for (const m of p3Meds) {
      const rm = insertMed.run(
        m.id,
        p3Id,
        m.brand,
        m.genericName,
        JSON.stringify(m.activeIngredients),
        m.salt,
        m.strength,
        m.formulation,
        m.route,
        m.prescribedDose,
        m.frequency,
        m.administrationInstructions,
        m.prescriber,
        m.source,
        m.status,
        m.verificationStatus,
        m.startDate,
        m.endDate,
        m.indication,
        now,
        now
      );
      if (rm.changes > 0) medsInserted++;
    }

    // =========================================================================
    // PATIENT 4: HAROLD FINCH (Age 81, Severe CKD 4, eGFR 22, Metformin Contraindicated)
    // =========================================================================
    const p4Id = 'p4444444-4444-4444-4444-444444444444';
    const r4 = insertPatient.run(
      p4Id,
      'SYNTH-30482',
      'Harold Finch',
      '1945-06-22',
      'male',
      84.5,
      175.0,
      'Dr. Alan Turing, MD (Cardiology)',
      'Independent Living with Visiting Nurse',
      'Grace Finch (Spouse) - (555) 789-0123',
      '[SYNTHETIC / TEST DATA] Severe CKD Stage 4 with baseline eGFR 22 mL/min/1.73m2. Co-prescribed Metformin (contraindicated eGFR < 30) and Spironolactone (hyperkalemia risk with K+ 5.2). Multi-prescriber fragmentation.',
      now,
      now
    );
    if (r4.changes > 0) patientsInserted++;

    insertRoutine.run(p4Id, '06:30', '07:30', '12:00', '18:00', '21:00', 'Geriatric home health routine', now, now);
    routinesInserted++;

    const p4Diagnoses = [
      {
        id: 'diag-p4-1',
        condition: 'Chronic Kidney Disease Stage 4 (Severe)',
        code: 'ICD-10 N18.4',
        clinicalStatus: 'active',
        verificationStatus: 'confirmed',
        onsetDate: '2023-02-14',
        dateRecorded: '2026-02-01',
        source: 'Nephrology Consult Note',
        notes: 'eGFR 22 mL/min. Strict avoidance of nephrotoxins and renal clearance adjustments required.',
      },
      {
        id: 'diag-p4-2',
        condition: 'Heart Failure with Preserved Ejection Fraction (HFpEF)',
        code: 'ICD-10 I50.30',
        clinicalStatus: 'active',
        verificationStatus: 'confirmed',
        onsetDate: '2020-08-19',
        dateRecorded: '2026-02-01',
        source: 'Cardiology Note',
        notes: 'Maintained on loop diuretic and MRA therapy.',
      },
      {
        id: 'diag-p4-3',
        condition: 'Type 2 Diabetes Mellitus with Diabetic Nephropathy',
        code: 'ICD-10 E11.21',
        clinicalStatus: 'active',
        verificationStatus: 'confirmed',
        onsetDate: '2014-05-11',
        dateRecorded: '2026-02-01',
        source: 'Endocrinology Note',
        notes: 'Poorly controlled glycemic index. Caution with oral hypoglycemics in CKD 4.',
      },
      {
        id: 'diag-p4-4',
        condition: 'Hyperkalemia',
        code: 'ICD-10 E87.5',
        clinicalStatus: 'active',
        verificationStatus: 'confirmed',
        onsetDate: '2026-01-10',
        dateRecorded: '2026-02-01',
        source: 'Outpatient Lab Report',
        notes: 'Serum K+ 5.2 mEq/L. Compounding RAAS blockade risk.',
      },
    ];

    for (const d of p4Diagnoses) {
      const rd = insertDiagnosis.run(
        d.id,
        p4Id,
        d.condition,
        d.code,
        d.clinicalStatus,
        d.verificationStatus,
        d.onsetDate,
        d.dateRecorded,
        d.source,
        d.notes,
        now,
        now
      );
      if (rd.changes > 0) diagnosesInserted++;
    }

    insertAllergy.run(
      'all-p4-1',
      p4Id,
      'Lisinopril',
      'drug',
      'Facial and oropharyngeal angioedema',
      'life-threatening',
      'confirmed',
      '2018-02-14',
      'Emergency Department Record',
      'ACE-inhibitor induced angioedema requiring ICU admission.',
      now,
      now
    );
    allergiesInserted++;

    const p4Labs = [
      {
        id: 'lab-p4-1',
        testName: 'eGFR (CKD-EPI 2021)',
        category: 'renal',
        value: 22.0,
        unit: 'mL/min/1.73m²',
        referenceRange: '> 60 mL/min/1.73m²',
        interpretation: 'critical',
        collectionDate: '2026-09-01',
        verificationStatus: 'confirmed',
        source: 'Renal Specialty Laboratory',
        notes: '[SYNTHETIC_TEST_DATA] Severe Stage 4 CKD. Metformin strictly contraindicated.',
      },
      {
        id: 'lab-p4-2',
        testName: 'Serum Creatinine',
        category: 'renal',
        value: 2.8,
        unit: 'mg/dL',
        referenceRange: '0.6 - 1.2 mg/dL',
        interpretation: 'critical',
        collectionDate: '2026-09-01',
        verificationStatus: 'confirmed',
        source: 'Renal Specialty Laboratory',
        notes: '[SYNTHETIC_TEST_DATA] Markedly elevated serum creatinine.',
      },
      {
        id: 'lab-p4-3',
        testName: 'Potassium (Serum)',
        category: 'renal',
        value: 5.2,
        unit: 'mEq/L',
        referenceRange: '3.5 - 5.0 mEq/L',
        interpretation: 'high',
        collectionDate: '2026-09-01',
        verificationStatus: 'confirmed',
        source: 'Renal Specialty Laboratory',
        notes: '[SYNTHETIC_TEST_DATA] Hyperkalemia threshold. Spironolactone monitoring alert.',
      },
      {
        id: 'lab-p4-4',
        testName: 'Blood Urea Nitrogen (BUN)',
        category: 'renal',
        value: 48.0,
        unit: 'mg/dL',
        referenceRange: '7.0 - 20.0 mg/dL',
        interpretation: 'high',
        collectionDate: '2026-09-01',
        verificationStatus: 'confirmed',
        source: 'Renal Specialty Laboratory',
        notes: '[SYNTHETIC_TEST_DATA] Markedly elevated BUN.',
      },
    ];

    for (const l of p4Labs) {
      const rl = insertLab.run(
        l.id,
        p4Id,
        l.testName,
        l.category,
        l.value,
        l.unit,
        l.referenceRange,
        l.interpretation,
        l.collectionDate,
        l.verificationStatus,
        l.source,
        l.notes,
        now,
        now
      );
      if (rl.changes > 0) labsInserted++;
    }

    const p4Meds = [
      {
        id: 'med-p4-1',
        brand: 'Glucophage',
        genericName: 'Metformin Hydrochloride',
        activeIngredients: [{ name: 'Metformin', strength: '1000 mg' }],
        salt: 'Hydrochloride',
        strength: '1000 mg',
        formulation: 'Oral Tablet',
        route: 'Oral',
        prescribedDose: '1 tablet (1000 mg)',
        frequency: 'Twice daily with meals',
        administrationInstructions: 'Take with morning and evening meals.',
        prescriber: 'Dr. Grace Hopper, MD (PCP)',
        source: 'Primary Care Problem List',
        status: 'active',
        verificationStatus: 'confirmed',
        startDate: '2015-08-10',
        endDate: null,
        indication: 'Type 2 Diabetes Mellitus [CONTRAINDICATED IN CKD 4]',
      },
      {
        id: 'med-p4-2',
        brand: 'Aldactone',
        genericName: 'Spironolactone',
        activeIngredients: [{ name: 'Spironolactone', strength: '25 mg' }],
        salt: 'None',
        strength: '25 mg',
        formulation: 'Oral Tablet',
        route: 'Oral',
        prescribedDose: '1 tablet (25 mg)',
        frequency: 'Once daily in morning with breakfast',
        administrationInstructions: 'Take with food in morning. Monitor potassium closely.',
        prescriber: 'Dr. Alan Turing, MD (Cardiology)',
        source: 'Cardiology Clinic Note',
        status: 'active',
        verificationStatus: 'confirmed',
        startDate: '2022-04-15',
        endDate: null,
        indication: 'HFpEF Management [HYPERKALEMIA RISK WITH K 5.2]',
      },
      {
        id: 'med-p4-3',
        brand: 'Jardiance',
        genericName: 'Empagliflozin',
        activeIngredients: [{ name: 'Empagliflozin', strength: '10 mg' }],
        salt: 'None',
        strength: '10 mg',
        formulation: 'Oral Tablet',
        route: 'Oral',
        prescribedDose: '1 tablet (10 mg)',
        frequency: 'Once daily in the morning',
        administrationInstructions: 'Take in morning with or without food.',
        prescriber: 'Dr. Grace Hopper, MD (PCP)',
        source: 'Primary Care Problem List',
        status: 'active',
        verificationStatus: 'confirmed',
        startDate: '2023-01-20',
        endDate: null,
        indication: 'Type 2 Diabetes / Cardiorenal Protection',
      },
      {
        id: 'med-p4-4',
        brand: 'Coreg',
        genericName: 'Carvedilol',
        activeIngredients: [{ name: 'Carvedilol', strength: '12.5 mg' }],
        salt: 'None',
        strength: '12.5 mg',
        formulation: 'Oral Tablet',
        route: 'Oral',
        prescribedDose: '1 tablet (12.5 mg)',
        frequency: 'Twice daily with meals',
        administrationInstructions: 'Take with food to minimize orthostatic hypotension.',
        prescriber: 'Dr. Alan Turing, MD (Cardiology)',
        source: 'Cardiology Clinic Note',
        status: 'active',
        verificationStatus: 'confirmed',
        startDate: '2021-06-10',
        endDate: null,
        indication: 'Heart Failure',
      },
      {
        id: 'med-p4-5',
        brand: 'Lasix',
        genericName: 'Furosemide',
        activeIngredients: [{ name: 'Furosemide', strength: '40 mg' }],
        salt: 'None',
        strength: '40 mg',
        formulation: 'Oral Tablet',
        route: 'Oral',
        prescribedDose: '1 tablet (40 mg)',
        frequency: 'Once daily in the morning',
        administrationInstructions: 'Take in morning with water.',
        prescriber: 'Dr. Alan Turing, MD (Cardiology)',
        source: 'Cardiology Clinic Note',
        status: 'active',
        verificationStatus: 'confirmed',
        startDate: '2020-09-01',
        endDate: null,
        indication: 'Fluid Overload',
      },
    ];

    for (const m of p4Meds) {
      const rm = insertMed.run(
        m.id,
        p4Id,
        m.brand,
        m.genericName,
        JSON.stringify(m.activeIngredients),
        m.salt,
        m.strength,
        m.formulation,
        m.route,
        m.prescribedDose,
        m.frequency,
        m.administrationInstructions,
        m.prescriber,
        m.source,
        m.status,
        m.verificationStatus,
        m.startDate,
        m.endDate,
        m.indication,
        now,
        now
      );
      if (rm.changes > 0) medsInserted++;
    }

    // =========================================================================
    // PATIENT 5: BEATRICE HOLLOWAY (Age 76, Decompensated Cirrhosis, Sedative Risk)
    // =========================================================================
    const p5Id = 'p5555555-5555-5555-5555-555555555555';
    const r5 = insertPatient.run(
      p5Id,
      'SYNTH-51924',
      'Beatrice Holloway',
      '1950-09-18',
      'female',
      62.0,
      158.0,
      'Dr. Ada Lovelace, MD (Hepatology)',
      'Memory Care / Assisted Living Facility',
      'David Holloway (Son) - (555) 456-7890',
      '[SYNTHETIC / TEST DATA] Decompensated Liver Cirrhosis with Portal Hypertension and Ascites. Co-prescribed Acetaminophen (caution in cirrhosis) and unverified Lorazepam (hepatic encephalopathy hazard).',
      now,
      now
    );
    if (r5.changes > 0) patientsInserted++;

    insertRoutine.run(p5Id, '07:30', '08:30', '13:00', '19:00', '22:00', 'Assisted living memory care routine', now, now);
    routinesInserted++;

    const p5Diagnoses = [
      {
        id: 'diag-p5-1',
        condition: 'Cirrhosis of Liver without Toxic Hepatitis',
        code: 'ICD-10 K74.60',
        clinicalStatus: 'active',
        verificationStatus: 'confirmed',
        onsetDate: '2021-04-12',
        dateRecorded: '2026-01-28',
        source: 'Hepatology Specialty Evaluation',
        notes: 'Child-Pugh Class B cirrhosis. High risk of hepatic drug accumulation.',
      },
      {
        id: 'diag-p5-2',
        condition: 'Portal Hypertension with Ascites',
        code: 'ICD-10 K76.6',
        clinicalStatus: 'active',
        verificationStatus: 'confirmed',
        onsetDate: '2022-07-15',
        dateRecorded: '2026-01-28',
        source: 'Gastroenterology Note',
        notes: 'Requires combination spironolactone + furosemide diuretic regimen.',
      },
      {
        id: 'diag-p5-3',
        condition: 'Hepatic Encephalopathy, Grade 1',
        code: 'ICD-10 K72.90',
        clinicalStatus: 'active',
        verificationStatus: 'confirmed',
        onsetDate: '2023-10-04',
        dateRecorded: '2026-01-28',
        source: 'Hepatology Specialty Evaluation',
        notes: 'Maintained on Lactulose; strict avoidance of sedative hypnotics and benzodiazepines.',
      },
      {
        id: 'diag-p5-4',
        condition: 'Chronic Low Back Pain',
        code: 'ICD-10 M54.5',
        clinicalStatus: 'active',
        verificationStatus: 'confirmed',
        onsetDate: '2019-02-20',
        dateRecorded: '2026-01-28',
        source: 'Primary Care Problem List',
        notes: 'Treated with PRN analgesics.',
      },
    ];

    for (const d of p5Diagnoses) {
      const rd = insertDiagnosis.run(
        d.id,
        p5Id,
        d.condition,
        d.code,
        d.clinicalStatus,
        d.verificationStatus,
        d.onsetDate,
        d.dateRecorded,
        d.source,
        d.notes,
        now,
        now
      );
      if (rd.changes > 0) diagnosesInserted++;
    }

    insertAllergy.run(
      'all-p5-1',
      p5Id,
      'Morphine',
      'drug',
      'Severe delirium and respiratory depression',
      'severe',
      'confirmed',
      '2022-05-18',
      'Inpatient Hospital Record',
      'Severe central nervous system intolerance in hepatic impairment.',
      now,
      now
    );
    allergiesInserted++;

    const p5Labs = [
      {
        id: 'lab-p5-1',
        testName: 'Total Bilirubin',
        category: 'hepatic',
        value: 3.4,
        unit: 'mg/dL',
        referenceRange: '0.2 - 1.2 mg/dL',
        interpretation: 'critical',
        collectionDate: '2026-08-25',
        verificationStatus: 'confirmed',
        source: 'Hepatology Specialty Lab',
        notes: '[SYNTHETIC_TEST_DATA] Markedly elevated bilirubin (Child-Pugh B indicator).',
      },
      {
        id: 'lab-p5-2',
        testName: 'Serum Albumin',
        category: 'hepatic',
        value: 2.5,
        unit: 'g/dL',
        referenceRange: '3.5 - 5.0 g/dL',
        interpretation: 'critical',
        collectionDate: '2026-08-25',
        verificationStatus: 'confirmed',
        source: 'Hepatology Specialty Lab',
        notes: '[SYNTHETIC_TEST_DATA] Severe hypoalbuminemia due to liver failure.',
      },
      {
        id: 'lab-p5-3',
        testName: 'Aspartate Aminotransferase (AST)',
        category: 'hepatic',
        value: 98.0,
        unit: 'U/L',
        referenceRange: '8.0 - 33.0 U/L',
        interpretation: 'high',
        collectionDate: '2026-08-25',
        verificationStatus: 'confirmed',
        source: 'Hepatology Specialty Lab',
        notes: '[SYNTHETIC_TEST_DATA] Markedly elevated AST.',
      },
      {
        id: 'lab-p5-4',
        testName: 'Alanine Aminotransferase (ALT)',
        category: 'hepatic',
        value: 84.0,
        unit: 'U/L',
        referenceRange: '7.0 - 35.0 U/L',
        interpretation: 'high',
        collectionDate: '2026-08-25',
        verificationStatus: 'confirmed',
        source: 'Hepatology Specialty Lab',
        notes: '[SYNTHETIC_TEST_DATA] Markedly elevated ALT.',
      },
      {
        id: 'lab-p5-5',
        testName: 'Alkaline Phosphatase',
        category: 'hepatic',
        value: 210.0,
        unit: 'U/L',
        referenceRange: '44 - 147 U/L',
        interpretation: 'high',
        collectionDate: '2026-08-25',
        verificationStatus: 'confirmed',
        source: 'Hepatology Specialty Lab',
        notes: '[SYNTHETIC_TEST_DATA] Cholestatic and hepatocellular injury pattern.',
      },
    ];

    for (const l of p5Labs) {
      const rl = insertLab.run(
        l.id,
        p5Id,
        l.testName,
        l.category,
        l.value,
        l.unit,
        l.referenceRange,
        l.interpretation,
        l.collectionDate,
        l.verificationStatus,
        l.source,
        l.notes,
        now,
        now
      );
      if (rl.changes > 0) labsInserted++;
    }

    const p5Meds = [
      {
        id: 'med-p5-1',
        brand: 'Enulose',
        genericName: 'Lactulose',
        activeIngredients: [{ name: 'Lactulose', strength: '20 g / 30 mL' }],
        salt: 'None',
        strength: '20 g / 30 mL',
        formulation: 'Oral Solution',
        route: 'Oral',
        prescribedDose: '30 mL (20 g)',
        frequency: 'Three times daily with meals',
        administrationInstructions: 'Titrate to 2-3 soft bowel movements per day to eliminate ammonia.',
        prescriber: 'Dr. Ada Lovelace, MD (Hepatology)',
        source: 'Hepatology Clinic Note',
        status: 'active',
        verificationStatus: 'confirmed',
        startDate: '2022-08-01',
        endDate: null,
        indication: 'Hepatic Encephalopathy Prophylaxis',
      },
      {
        id: 'med-p5-2',
        brand: 'Inderal',
        genericName: 'Propranolol Hydrochloride',
        activeIngredients: [{ name: 'Propranolol', strength: '20 mg' }],
        salt: 'Hydrochloride',
        strength: '20 mg',
        formulation: 'Oral Tablet',
        route: 'Oral',
        prescribedDose: '1 tablet (20 mg)',
        frequency: 'Twice daily',
        administrationInstructions: 'Take in morning and evening to lower portal venous pressure.',
        prescriber: 'Dr. Ada Lovelace, MD (Hepatology)',
        source: 'Hepatology Clinic Note',
        status: 'active',
        verificationStatus: 'confirmed',
        startDate: '2022-08-01',
        endDate: null,
        indication: 'Portal Hypertension Bleed Prophylaxis',
      },
      {
        id: 'med-p5-3',
        brand: 'Aldactone',
        genericName: 'Spironolactone',
        activeIngredients: [{ name: 'Spironolactone', strength: '100 mg' }],
        salt: 'None',
        strength: '100 mg',
        formulation: 'Oral Tablet',
        route: 'Oral',
        prescribedDose: '1 tablet (100 mg)',
        frequency: 'Once daily in the morning with breakfast',
        administrationInstructions: 'Take with morning breakfast.',
        prescriber: 'Dr. Ada Lovelace, MD (Hepatology)',
        source: 'Hepatology Clinic Note',
        status: 'active',
        verificationStatus: 'confirmed',
        startDate: '2022-08-01',
        endDate: null,
        indication: 'Ascites Control (100:40 ratio with Lasix)',
      },
      {
        id: 'med-p5-4',
        brand: 'Lasix',
        genericName: 'Furosemide',
        activeIngredients: [{ name: 'Furosemide', strength: '40 mg' }],
        salt: 'None',
        strength: '40 mg',
        formulation: 'Oral Tablet',
        route: 'Oral',
        prescribedDose: '1 tablet (40 mg)',
        frequency: 'Once daily in the morning with breakfast',
        administrationInstructions: 'Take with morning breakfast.',
        prescriber: 'Dr. Ada Lovelace, MD (Hepatology)',
        source: 'Hepatology Clinic Note',
        status: 'active',
        verificationStatus: 'confirmed',
        startDate: '2022-08-01',
        endDate: null,
        indication: 'Ascites Control',
      },
      {
        id: 'med-p5-5',
        brand: 'Tylenol Regular Strength',
        genericName: 'Acetaminophen',
        activeIngredients: [{ name: 'Acetaminophen', strength: '325 mg' }],
        salt: 'None',
        strength: '325 mg',
        formulation: 'Oral Tablet',
        route: 'Oral',
        prescribedDose: '1 tablet (325 mg)',
        frequency: 'Every 6 hours as needed for pain',
        administrationInstructions: 'Max 2000 mg (2 g) per day strictly in cirrhosis.',
        prescriber: 'Dr. Robert Patel, MD (PCP)',
        source: 'Primary Care Problem List',
        status: 'active',
        verificationStatus: 'confirmed',
        startDate: '2023-04-10',
        endDate: null,
        indication: 'Chronic Back Pain [CIRRHOSIS CAUTION]',
      },
      {
        id: 'med-p5-6',
        brand: 'Ativan',
        genericName: 'Lorazepam',
        activeIngredients: [{ name: 'Lorazepam', strength: '1 mg' }],
        salt: 'None',
        strength: '1 mg',
        formulation: 'Oral Tablet',
        route: 'Oral',
        prescribedDose: '1 tablet (1 mg)',
        frequency: 'Once daily at bedtime as needed for anxiety/insomnia',
        administrationInstructions: 'Take at bedtime PRN.',
        prescriber: 'Urgent Care Physician',
        source: 'External Pharmacy Claim',
        status: 'active',
        verificationStatus: 'unverified',
        startDate: '2026-02-20',
        endDate: null,
        indication: 'Insomnia [HAZARD: Encephalopathy Risk in Cirrhosis]',
      },
    ];

    for (const m of p5Meds) {
      const rm = insertMed.run(
        m.id,
        p5Id,
        m.brand,
        m.genericName,
        JSON.stringify(m.activeIngredients),
        m.salt,
        m.strength,
        m.formulation,
        m.route,
        m.prescribedDose,
        m.frequency,
        m.administrationInstructions,
        m.prescriber,
        m.source,
        m.status,
        m.verificationStatus,
        m.startDate,
        m.endDate,
        m.indication,
        now,
        now
      );
      if (rm.changes > 0) medsInserted++;
    }

    // =========================================================================
    // PATIENT 6: WALTER STERLING (Age 88, Multi-prescriber, Duplicate NSAID + Anticoagulant)
    // =========================================================================
    const p6Id = 'p6666666-6666-6666-6666-666666666666';
    const r6 = insertPatient.run(
      p6Id,
      'SYNTH-68215',
      'Walter Sterling',
      '1938-12-05',
      'male',
      79.0,
      172.0,
      'Dr. Marcus Welby, MD (Rheumatology)',
      'Independent Living',
      'Margaret Sterling (Daughter) - (555) 345-6789',
      '[SYNTHETIC / TEST DATA] Multi-prescriber polypharmacy and duplicate NSAID therapy: Celecoxib from Rheumatologist + Meloxicam from Urgent Care. Concurrent Apixaban creates extreme gastrointestinal hemorrhage liability.',
      now,
      now
    );
    if (r6.changes > 0) patientsInserted++;

    insertRoutine.run(p6Id, '07:00', '08:00', '12:30', '18:30', '21:30', 'Independent community senior routine', now, now);
    routinesInserted++;

    const p6Diagnoses = [
      {
        id: 'diag-p6-1',
        condition: 'Severe Osteoarthritis of Hip and Knee',
        code: 'ICD-10 M16.0',
        clinicalStatus: 'active',
        verificationStatus: 'confirmed',
        onsetDate: '2016-09-02',
        dateRecorded: '2026-01-15',
        source: 'Rheumatology Specialty Note',
        notes: 'Chronic severe joint degeneration.',
      },
      {
        id: 'diag-p6-2',
        condition: 'Non-valvular Atrial Fibrillation',
        code: 'ICD-10 I48.0',
        clinicalStatus: 'active',
        verificationStatus: 'confirmed',
        onsetDate: '2021-03-10',
        dateRecorded: '2026-01-15',
        source: 'Cardiology Note',
        notes: 'CHA2DS2-VASc = 5. Prescribed DOAC Apixaban.',
      },
      {
        id: 'diag-p6-3',
        condition: 'Primary Essential Hypertension',
        code: 'ICD-10 I10',
        clinicalStatus: 'active',
        verificationStatus: 'confirmed',
        onsetDate: '2005-04-18',
        dateRecorded: '2026-01-15',
        source: 'Primary Care Problem List',
        notes: 'Controlled on ACE inhibitor.',
      },
      {
        id: 'diag-p6-4',
        condition: 'History of Peptic Ulcer Disease',
        code: 'ICD-10 K27.9',
        clinicalStatus: 'active',
        verificationStatus: 'confirmed',
        onsetDate: '2017-11-20',
        dateRecorded: '2026-01-15',
        source: 'Gastroenterology Note',
        notes: 'Prior bleed secondary to NSAIDs; requires PPI gastroprotection.',
      },
    ];

    for (const d of p6Diagnoses) {
      const rd = insertDiagnosis.run(
        d.id,
        p6Id,
        d.condition,
        d.code,
        d.clinicalStatus,
        d.verificationStatus,
        d.onsetDate,
        d.dateRecorded,
        d.source,
        d.notes,
        now,
        now
      );
      if (rd.changes > 0) diagnosesInserted++;
    }

    insertAllergy.run(
      'all-p6-1',
      p6Id,
      'Aspirin',
      'drug',
      'Bronchospasm / Aspirin-Exacerbated Respiratory Disease',
      'severe',
      'confirmed',
      '2015-07-22',
      'Allergy Clinic',
      'Severe respiratory reaction to acetylsalicylic acid.',
      now,
      now
    );
    allergiesInserted++;

    const p6Labs = [
      {
        id: 'lab-p6-1',
        testName: 'eGFR (CKD-EPI 2021)',
        category: 'renal',
        value: 68.0,
        unit: 'mL/min/1.73m²',
        referenceRange: '> 60 mL/min/1.73m²',
        interpretation: 'normal',
        collectionDate: '2026-08-20',
        verificationStatus: 'confirmed',
        source: 'Regional Health Outpatient Lab',
        notes: '[SYNTHETIC_TEST_DATA] Normal baseline renal function.',
      },
      {
        id: 'lab-p6-2',
        testName: 'Serum Creatinine',
        category: 'renal',
        value: 1.05,
        unit: 'mg/dL',
        referenceRange: '0.6 - 1.2 mg/dL',
        interpretation: 'normal',
        collectionDate: '2026-08-20',
        verificationStatus: 'confirmed',
        source: 'Regional Health Outpatient Lab',
        notes: '[SYNTHETIC_TEST_DATA] Baseline creatinine normal.',
      },
    ];

    for (const l of p6Labs) {
      const rl = insertLab.run(
        l.id,
        p6Id,
        l.testName,
        l.category,
        l.value,
        l.unit,
        l.referenceRange,
        l.interpretation,
        l.collectionDate,
        l.verificationStatus,
        l.source,
        l.notes,
        now,
        now
      );
      if (rl.changes > 0) labsInserted++;
    }

    const p6Meds = [
      {
        id: 'med-p6-1',
        brand: 'Celebrex',
        genericName: 'Celecoxib',
        activeIngredients: [{ name: 'Celecoxib', strength: '200 mg' }],
        salt: 'None',
        strength: '200 mg',
        formulation: 'Oral Capsule',
        route: 'Oral',
        prescribedDose: '1 capsule (200 mg)',
        frequency: 'Once daily with food',
        administrationInstructions: 'Take with breakfast or morning meal for chronic hip arthritis.',
        prescriber: 'Dr. Marcus Welby, MD (Rheumatology)',
        source: 'Rheumatology Specialty Note',
        status: 'active',
        verificationStatus: 'confirmed',
        startDate: '2022-01-10',
        endDate: null,
        indication: 'Osteoarthritis Pain',
      },
      {
        id: 'med-p6-2',
        brand: 'Mobic',
        genericName: 'Meloxicam',
        activeIngredients: [{ name: 'Meloxicam', strength: '7.5 mg' }],
        salt: 'None',
        strength: '7.5 mg',
        formulation: 'Oral Tablet',
        route: 'Oral',
        prescribedDose: '1 tablet (7.5 mg)',
        frequency: 'Once daily with food',
        administrationInstructions: 'Take once daily with food for acute flare. Prescribed at Urgent Care.',
        prescriber: 'Dr. Sanjay Gupta, DO (Urgent Care)',
        source: 'Urgent Care Discharge Note',
        status: 'active',
        verificationStatus: 'confirmed',
        startDate: '2026-02-15',
        endDate: null,
        indication: 'Acute Shoulder Sprain [DUPLICATE NSAID WITH CELEBREX]',
      },
      {
        id: 'med-p6-3',
        brand: 'Eliquis',
        genericName: 'Apixaban',
        activeIngredients: [{ name: 'Apixaban', strength: '5 mg' }],
        salt: 'None',
        strength: '5 mg',
        formulation: 'Oral Tablet',
        route: 'Oral',
        prescribedDose: '1 tablet (5 mg)',
        frequency: 'Twice daily',
        administrationInstructions: 'Take 1 tablet every 12 hours. Do not skip doses.',
        prescriber: 'Dr. Katherine Bell, MD (Cardiology)',
        source: 'Cardiology Clinic Note',
        status: 'active',
        verificationStatus: 'confirmed',
        startDate: '2021-04-01',
        endDate: null,
        indication: 'Stroke Prophylaxis in AFib [HIGH BLEED RISK WITH NSAIDS]',
      },
      {
        id: 'med-p6-4',
        brand: 'Zestril',
        genericName: 'Lisinopril',
        activeIngredients: [{ name: 'Lisinopril', strength: '20 mg' }],
        salt: 'Dihydrate',
        strength: '20 mg',
        formulation: 'Oral Tablet',
        route: 'Oral',
        prescribedDose: '1 tablet (20 mg)',
        frequency: 'Once daily in the morning',
        administrationInstructions: 'Take in morning with water.',
        prescriber: 'Dr. Robert Patel, MD (PCP)',
        source: 'Primary Care Problem List',
        status: 'active',
        verificationStatus: 'confirmed',
        startDate: '2015-08-15',
        endDate: null,
        indication: 'Hypertension',
      },
      {
        id: 'med-p6-5',
        brand: 'Prilosec',
        genericName: 'Omeprazole',
        activeIngredients: [{ name: 'Omeprazole', strength: '20 mg' }],
        salt: 'None',
        strength: '20 mg',
        formulation: 'Delayed-Release Capsule',
        route: 'Oral',
        prescribedDose: '1 capsule (20 mg)',
        frequency: 'Once daily in the morning 30 min before breakfast',
        administrationInstructions: 'Take 30 minutes before first meal for gastroprotection.',
        prescriber: 'Dr. Robert Patel, MD (PCP)',
        source: 'Primary Care Problem List',
        status: 'active',
        verificationStatus: 'confirmed',
        startDate: '2018-01-10',
        endDate: null,
        indication: 'Ulcer Prophylaxis',
      },
    ];

    for (const m of p6Meds) {
      const rm = insertMed.run(
        m.id,
        p6Id,
        m.brand,
        m.genericName,
        JSON.stringify(m.activeIngredients),
        m.salt,
        m.strength,
        m.formulation,
        m.route,
        m.prescribedDose,
        m.frequency,
        m.administrationInstructions,
        m.prescriber,
        m.source,
        m.status,
        m.verificationStatus,
        m.startDate,
        m.endDate,
        m.indication,
        now,
        now
      );
      if (rm.changes > 0) medsInserted++;
    }

    // =========================================================================
    // PATIENT 7: EVELYN MONTGOMERY (Age 69, Incomplete Orders & Missing Lab Gap)
    // =========================================================================
    const p7Id = 'p7777777-7777-7777-7777-777777777777';
    const r7 = insertPatient.run(
      p7Id,
      'SYNTH-74391',
      'Evelyn Montgomery',
      '1957-04-30',
      'female',
      71.0,
      165.0,
      'Dr. Robert Patel, MD (PCP)',
      'Community Living',
      'Charles Montgomery (Spouse) - (555) 567-8901',
      '[SYNTHETIC / TEST DATA] Incomplete / ambiguous prescriptions and clinical data gaps: Missing renal laboratory records (no eGFR/Cr on file), unknown allergy status, incomplete Metformin order without frequency, and Ferrous Sulfate with contradictory meal instructions.',
      now,
      now
    );
    if (r7.changes > 0) patientsInserted++;

    insertRoutine.run(p7Id, '07:00', '08:00', '12:30', '18:30', '22:00', 'Community outpatient routine', now, now);
    routinesInserted++;

    const p7Diagnoses = [
      {
        id: 'diag-p7-1',
        condition: 'Type 2 Diabetes Mellitus without acute complications',
        code: 'ICD-10 E11.9',
        clinicalStatus: 'active',
        verificationStatus: 'confirmed',
        onsetDate: '2025-06-10',
        dateRecorded: '2026-02-05',
        source: 'Primary Care Note',
        notes: 'Recently diagnosed; requires baseline renal screening.',
      },
      {
        id: 'diag-p7-2',
        condition: 'Primary Essential Hypertension',
        code: 'ICD-10 I10',
        clinicalStatus: 'active',
        verificationStatus: 'confirmed',
        onsetDate: '2022-01-14',
        dateRecorded: '2026-02-05',
        source: 'Primary Care Note',
        notes: 'Managed on Losartan.',
      },
      {
        id: 'diag-p7-3',
        condition: 'Iron Deficiency Anemia',
        code: 'ICD-10 D50.9',
        clinicalStatus: 'active',
        verificationStatus: 'confirmed',
        onsetDate: '2026-01-12',
        dateRecorded: '2026-02-05',
        source: 'Primary Care Note',
        notes: 'Prescribed oral iron therapy.',
      },
      {
        id: 'diag-p7-4',
        condition: 'Generalized Anxiety Disorder',
        code: 'ICD-10 F41.1',
        clinicalStatus: 'active',
        verificationStatus: 'confirmed',
        onsetDate: '2023-09-18',
        dateRecorded: '2026-02-05',
        source: 'Behavioral Health Consult',
        notes: 'Prescribed Buspirone.',
      },
    ];

    for (const d of p7Diagnoses) {
      const rd = insertDiagnosis.run(
        d.id,
        p7Id,
        d.condition,
        d.code,
        d.clinicalStatus,
        d.verificationStatus,
        d.onsetDate,
        d.dateRecorded,
        d.source,
        d.notes,
        now,
        now
      );
      if (rd.changes > 0) diagnosesInserted++;
    }

    // Patient 7 has UNKNOWN / UNRECORDED allergy status (clinical data gap)
    insertAllergy.run(
      'all-p7-1',
      p7Id,
      'No Known Drug Allergies (Unconfirmed - Assessment Pending)',
      'other',
      'Unassessed / History Incomplete',
      'unknown',
      'unverified',
      '2026-02-05',
      'Intake Assessment Form',
      'Clinical data gap: Allergy reconciliation required upon initial consult.',
      now,
      now
    );
    allergiesInserted++;

    // Patient 7 INTENTIONALLY HAS ZERO LABS ON RECORD to exercise the clinical data gap detection engine!

    const p7Meds = [
      {
        id: 'med-p7-1',
        brand: 'Glucophage',
        genericName: 'Metformin Hydrochloride',
        activeIngredients: [{ name: 'Metformin', strength: '500 mg' }],
        salt: 'Hydrochloride',
        strength: '500 mg',
        formulation: 'Oral Tablet',
        route: 'Oral',
        prescribedDose: '1 tablet',
        frequency: 'As directed', // Missing frequency!
        administrationInstructions: 'Take as directed by physician.',
        prescriber: 'Dr. Robert Patel, MD (PCP)',
        source: 'Paper Intake Order',
        status: 'active',
        verificationStatus: 'unverified',
        startDate: '2026-02-01',
        endDate: null,
        indication: 'Type 2 Diabetes [AMBIGUITY: INCOMPLETE SIG]',
      },
      {
        id: 'med-p7-2',
        brand: 'Glucotrol',
        genericName: 'Glipizide',
        activeIngredients: [{ name: 'Glipizide', strength: '5 mg' }],
        salt: 'None',
        strength: '5 mg',
        formulation: 'Oral Tablet',
        route: 'Oral',
        prescribedDose: '1 tablet (5 mg)',
        frequency: 'Once daily in morning with breakfast',
        administrationInstructions: 'Take 1 tablet by mouth 30 minutes before or with morning breakfast.',
        prescriber: 'Dr. Robert Patel, MD (PCP)',
        source: 'Primary Care Note',
        status: 'active',
        verificationStatus: 'confirmed',
        startDate: '2026-02-01',
        endDate: null,
        indication: 'Type 2 Diabetes',
      },
      {
        id: 'med-p7-3',
        brand: 'Cozaar',
        genericName: 'Losartan Potassium',
        activeIngredients: [{ name: 'Losartan', strength: '50 mg' }],
        salt: 'Potassium',
        strength: '50 mg',
        formulation: 'Oral Tablet',
        route: 'Oral',
        prescribedDose: '1 tablet (50 mg)',
        frequency: 'Once daily in the morning',
        administrationInstructions: 'Take in morning with water.',
        prescriber: 'Dr. Robert Patel, MD (PCP)',
        source: 'Primary Care Note',
        status: 'active',
        verificationStatus: 'confirmed',
        startDate: '2022-03-10',
        endDate: null,
        indication: 'Hypertension',
      },
      {
        id: 'med-p7-4',
        brand: 'BuSpar',
        genericName: 'Buspirone Hydrochloride',
        activeIngredients: [{ name: 'Buspirone', strength: '10 mg' }],
        salt: 'Hydrochloride',
        strength: '10 mg',
        formulation: 'Oral Tablet',
        route: 'Oral',
        prescribedDose: '1 tablet (10 mg)',
        frequency: 'Twice daily with meals',
        administrationInstructions: 'Take with food at breakfast and dinner to ensure consistent bioavailability.',
        prescriber: 'Dr. Marcus Welby, MD (PCP)',
        source: 'Primary Care Note',
        status: 'active',
        verificationStatus: 'confirmed',
        startDate: '2023-10-01',
        endDate: null,
        indication: 'Generalized Anxiety Disorder',
      },
      {
        id: 'med-p7-5',
        brand: 'Ferrous Sulfate',
        genericName: 'Ferrous Sulfate',
        activeIngredients: [{ name: 'Iron (Elemental)', strength: '65 mg' }],
        salt: 'Sulfate',
        strength: '325 mg (65 mg elemental iron)',
        formulation: 'Oral Tablet',
        route: 'Oral',
        prescribedDose: '1 tablet (325 mg)',
        frequency: 'Once daily',
        administrationInstructions: 'Take with meals or on an empty stomach with citrus juice.', // Conflicting instruction
        prescriber: 'Patient Self-Report (OTC)',
        source: 'Patient Self-Report',
        status: 'active',
        verificationStatus: 'unverified',
        startDate: '2026-01-15',
        endDate: null,
        indication: 'Anemia [AMBIGUITY: CONFLICTING MEAL INSTRUCTIONS]',
      },
    ];

    for (const m of p7Meds) {
      const rm = insertMed.run(
        m.id,
        p7Id,
        m.brand,
        m.genericName,
        JSON.stringify(m.activeIngredients),
        m.salt,
        m.strength,
        m.formulation,
        m.route,
        m.prescribedDose,
        m.frequency,
        m.administrationInstructions,
        m.prescriber,
        m.source,
        m.status,
        m.verificationStatus,
        m.startDate,
        m.endDate,
        m.indication,
        now,
        now
      );
      if (rm.changes > 0) medsInserted++;
    }

    // =========================================================================
    // PATIENT 8: SAMUEL O'REILLY (Age 82, Parkinson's Chrono-Dosing & BPH)
    // =========================================================================
    const p8Id = 'p8888888-8888-8888-8888-888888888888';
    const r8 = insertPatient.run(
      p8Id,
      'SYNTH-83107',
      "Samuel O'Reilly",
      '1944-01-25',
      'male',
      73.0,
      170.0,
      'Dr. Katherine Bell, MD (Neurology)',
      'Assisted Living Facility',
      "Patricia O'Reilly (Daughter) - (555) 678-9012",
      "[SYNTHETIC / TEST DATA] Specialized Parkinsonian chronotherapeutic regimen: Carbidopa/Levodopa requires strict 45-60 min pre-meal empty-stomach scheduling to avoid dietary protein amino acid absorption competition. Tamsulosin dosed at bedtime for orthostasis prevention.",
      now,
      now
    );
    if (r8.changes > 0) patientsInserted++;

    insertRoutine.run(p8Id, '06:45', '08:00', '12:30', '18:30', '21:30', 'Assisted living Parkinsonian care routine', now, now);
    routinesInserted++;

    const p8Diagnoses = [
      {
        id: 'diag-p8-1',
        condition: "Idiopathic Parkinson's Disease (Hoehn and Yahr Stage 2)",
        code: 'ICD-10 G20',
        clinicalStatus: 'active',
        verificationStatus: 'confirmed',
        onsetDate: '2019-07-14',
        dateRecorded: '2026-01-10',
        source: 'Neurology Specialty Note',
        notes: 'Rest tremor, rigidity, bradykinesia. Dependent on on-time levodopa dosing.',
      },
      {
        id: 'diag-p8-2',
        condition: 'Benign Prostatic Hyperplasia with LUTS',
        code: 'ICD-10 N40.1',
        clinicalStatus: 'active',
        verificationStatus: 'confirmed',
        onsetDate: '2018-03-22',
        dateRecorded: '2026-01-10',
        source: 'Urology Note',
        notes: 'Maintained on Tamsulosin at bedtime.',
      },
      {
        id: 'diag-p8-3',
        condition: 'Primary Essential Hypertension',
        code: 'ICD-10 I10',
        clinicalStatus: 'active',
        verificationStatus: 'confirmed',
        onsetDate: '2012-05-18',
        dateRecorded: '2026-01-10',
        source: 'Primary Care Note',
        notes: 'Maintained on Amlodipine.',
      },
      {
        id: 'diag-p8-4',
        condition: 'Mild Cognitive Impairment (Parkinsonian Related)',
        code: 'ICD-10 G31.84',
        clinicalStatus: 'active',
        verificationStatus: 'confirmed',
        onsetDate: '2023-11-05',
        dateRecorded: '2026-01-10',
        source: 'Neurology Specialty Note',
        notes: 'MoCA score 24/30. Co-prescribed Donepezil.',
      },
    ];

    for (const d of p8Diagnoses) {
      const rd = insertDiagnosis.run(
        d.id,
        p8Id,
        d.condition,
        d.code,
        d.clinicalStatus,
        d.verificationStatus,
        d.onsetDate,
        d.dateRecorded,
        d.source,
        d.notes,
        now,
        now
      );
      if (rd.changes > 0) diagnosesInserted++;
    }

    insertAllergy.run(
      'all-p8-1',
      p8Id,
      'Haloperidol',
      'drug',
      'Severe extrapyramidal symptoms and acute dystonic crisis',
      'severe',
      'confirmed',
      '2020-04-15',
      'Neurology Record',
      'Dopamine receptor antagonist strictly contraindicated in Parkinson disease.',
      now,
      now
    );
    allergiesInserted++;

    const p8Labs = [
      {
        id: 'lab-p8-1',
        testName: 'eGFR (CKD-EPI 2021)',
        category: 'renal',
        value: 74.0,
        unit: 'mL/min/1.73m²',
        referenceRange: '> 60 mL/min/1.73m²',
        interpretation: 'normal',
        collectionDate: '2026-08-15',
        verificationStatus: 'confirmed',
        source: 'Regional Health Outpatient Lab',
        notes: '[SYNTHETIC_TEST_DATA] Normal renal clearance.',
      },
      {
        id: 'lab-p8-2',
        testName: 'Serum Creatinine',
        category: 'renal',
        value: 0.95,
        unit: 'mg/dL',
        referenceRange: '0.6 - 1.2 mg/dL',
        interpretation: 'normal',
        collectionDate: '2026-08-15',
        verificationStatus: 'confirmed',
        source: 'Regional Health Outpatient Lab',
        notes: '[SYNTHETIC_TEST_DATA] Normal serum creatinine.',
      },
    ];

    for (const l of p8Labs) {
      const rl = insertLab.run(
        l.id,
        p8Id,
        l.testName,
        l.category,
        l.value,
        l.unit,
        l.referenceRange,
        l.interpretation,
        l.collectionDate,
        l.verificationStatus,
        l.source,
        l.notes,
        now,
        now
      );
      if (rl.changes > 0) labsInserted++;
    }

    const p8Meds = [
      {
        id: 'med-p8-1',
        brand: 'Sinemet 25/100',
        genericName: 'Carbidopa and Levodopa',
        activeIngredients: [
          { name: 'Carbidopa', strength: '25 mg' },
          { name: 'Levodopa', strength: '100 mg' },
        ],
        salt: 'None',
        strength: '25 mg / 100 mg',
        formulation: 'Oral Tablet',
        route: 'Oral',
        prescribedDose: '1 tablet (25 mg / 100 mg)',
        frequency: 'Three times daily 45-60 minutes before meals',
        administrationInstructions: 'Take 45-60 minutes before meals on an empty stomach. Dietary protein competes with levodopa transport.',
        prescriber: 'Dr. Katherine Bell, MD (Neurology)',
        source: 'Neurology Specialty Note',
        status: 'active',
        verificationStatus: 'confirmed',
        startDate: '2019-08-01',
        endDate: null,
        indication: "Parkinson's Disease Motor Symptoms",
      },
      {
        id: 'med-p8-2',
        brand: 'Flomax',
        genericName: 'Tamsulosin Hydrochloride',
        activeIngredients: [{ name: 'Tamsulosin', strength: '0.4 mg' }],
        salt: 'Hydrochloride',
        strength: '0.4 mg',
        formulation: 'Oral Capsule',
        route: 'Oral',
        prescribedDose: '1 capsule (0.4 mg)',
        frequency: 'Once daily at bedtime',
        administrationInstructions: 'Take 30 minutes after evening dinner or immediately at bedtime to minimize first-dose syncope.',
        prescriber: 'Dr. William Davis, MD (Urology)',
        source: 'Urology Specialty Note',
        status: 'active',
        verificationStatus: 'confirmed',
        startDate: '2018-04-10',
        endDate: null,
        indication: 'Benign Prostatic Hyperplasia',
      },
      {
        id: 'med-p8-3',
        brand: 'Norvasc',
        genericName: 'Amlodipine Besylate',
        activeIngredients: [{ name: 'Amlodipine', strength: '10 mg' }],
        salt: 'Besylate',
        strength: '10 mg',
        formulation: 'Oral Tablet',
        route: 'Oral',
        prescribedDose: '1 tablet (10 mg)',
        frequency: 'Once daily in the morning',
        administrationInstructions: 'Take in morning with water.',
        prescriber: 'Dr. Robert Patel, MD (PCP)',
        source: 'Primary Care Note',
        status: 'active',
        verificationStatus: 'confirmed',
        startDate: '2012-06-01',
        endDate: null,
        indication: 'Hypertension',
      },
      {
        id: 'med-p8-4',
        brand: 'Aricept',
        genericName: 'Donepezil Hydrochloride',
        activeIngredients: [{ name: 'Donepezil', strength: '10 mg' }],
        salt: 'Hydrochloride',
        strength: '10 mg',
        formulation: 'Oral Tablet',
        route: 'Oral',
        prescribedDose: '1 tablet (10 mg)',
        frequency: 'Once daily at bedtime',
        administrationInstructions: 'Take immediately before sleep at night.',
        prescriber: 'Dr. Katherine Bell, MD (Neurology)',
        source: 'Neurology Specialty Note',
        status: 'active',
        verificationStatus: 'confirmed',
        startDate: '2023-11-15',
        endDate: null,
        indication: 'Cognitive Support in Parkinson Disease',
      },
      {
        id: 'med-p8-5',
        brand: 'Melatonin',
        genericName: 'Melatonin',
        activeIngredients: [{ name: 'Melatonin', strength: '3 mg' }],
        salt: 'None',
        strength: '3 mg',
        formulation: 'Oral Tablet',
        route: 'Oral',
        prescribedDose: '1 tablet (3 mg)',
        frequency: 'Once daily at bedtime 30 minutes before sleep',
        administrationInstructions: 'Take 30 minutes before turning off lights.',
        prescriber: 'Patient Self-Report (OTC)',
        source: 'Patient Self-Report',
        status: 'active',
        verificationStatus: 'confirmed',
        startDate: '2024-01-01',
        endDate: null,
        indication: 'REM Sleep Behavior Disorder / Insomnia',
      },
    ];

    for (const m of p8Meds) {
      const rm = insertMed.run(
        m.id,
        p8Id,
        m.brand,
        m.genericName,
        JSON.stringify(m.activeIngredients),
        m.salt,
        m.strength,
        m.formulation,
        m.route,
        m.prescribedDose,
        m.frequency,
        m.administrationInstructions,
        m.prescriber,
        m.source,
        m.status,
        m.verificationStatus,
        m.startDate,
        m.endDate,
        m.indication,
        now,
        now
      );
      if (rm.changes > 0) medsInserted++;
    }
  });

  transaction();

  const totalPatients = (db.prepare('SELECT count(*) as count FROM patients').get() as { count: number }).count;
  const totalMeds = (db.prepare('SELECT count(*) as count FROM medications').get() as { count: number }).count;

  return {
    patientsSeeded: patientsInserted,
    medicationsSeeded: medsInserted,
    allergiesSeeded: allergiesInserted,
    diagnosesSeeded: diagnosesInserted,
    labsSeeded: labsInserted,
    routinesSeeded: routinesInserted,
    totalSyntheticPatients: totalPatients,
    totalSyntheticMedications: totalMeds,
    isIdempotentRun: patientsInserted === 0 && medsInserted === 0,
  };
}

/**
 * Resets the synthetic test dataset in the dedicated test/prototype SQLite database.
 *
 * SAFETY INVARIANTS:
 * 1. Strict confirmation token 'CONFIRM_RESET_TEST_DATASET' required.
 * 2. Only deletes records associated with synthetic MRNs (SYNTH-%) or synthetic IDs (p%-%).
 * 3. Never deletes production or non-synthetic patient records.
 */
export function resetSyntheticDataset(
  db: Database.Database,
  confirmationToken: string
): ResetSummary {
  if (confirmationToken !== 'CONFIRM_RESET_TEST_DATASET') {
    throw new Error(
      'Invalid confirmation token. Reset operation aborted. Expected token: "CONFIRM_RESET_TEST_DATASET".'
    );
  }

  // Count records to delete
  const patientCountBefore = (
    db.prepare("SELECT count(*) as c FROM patients WHERE mrn LIKE 'SYNTH-%' OR id LIKE 'p%-%'").get() as { c: number }
  ).c;

  const medCountBefore = (
    db.prepare("SELECT count(*) as c FROM medications WHERE patient_id LIKE 'p%-%'").get() as { c: number }
  ).c;

  const labCountBefore = (
    db.prepare("SELECT count(*) as c FROM lab_measurements WHERE patient_id LIKE 'p%-%'").get() as { c: number }
  ).c;

  const resetTx = db.transaction(() => {
    // Delete cascading child records for synthetic patients
    db.prepare("DELETE FROM chrono_schedules WHERE patient_id LIKE 'p%-%'").run();
    db.prepare("DELETE FROM patient_routines WHERE patient_id LIKE 'p%-%'").run();
    db.prepare("DELETE FROM audit_logs WHERE patient_id LIKE 'p%-%'").run();
    db.prepare("DELETE FROM lab_measurements WHERE patient_id LIKE 'p%-%'").run();
    db.prepare("DELETE FROM diagnoses WHERE patient_id LIKE 'p%-%'").run();
    db.prepare("DELETE FROM allergies WHERE patient_id LIKE 'p%-%'").run();
    db.prepare("DELETE FROM medications WHERE patient_id LIKE 'p%-%'").run();
    db.prepare("DELETE FROM patients WHERE mrn LIKE 'SYNTH-%' OR id LIKE 'p%-%'").run();
  });

  resetTx();

  // Re-seed cleanly after reset
  seedSyntheticData(db);

  return {
    success: true,
    message: `Synthetic test dataset reset successfully. ${patientCountBefore} synthetic patients and ${medCountBefore} medications re-seeded.`,
    deletedPatientsCount: patientCountBefore,
    deletedMedicationsCount: medCountBefore,
    deletedLabsCount: labCountBefore,
    resetAt: new Date().toISOString(),
  };
}
