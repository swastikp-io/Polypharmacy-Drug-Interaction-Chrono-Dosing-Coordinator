import type Database from 'better-sqlite3';
import { randomUUID } from 'crypto';

export function seedSyntheticData(db: Database.Database): void {
  // Check if data already exists
  const existingPatients = db.prepare('SELECT count(*) as count FROM patients').get() as { count: number };
  if (existingPatients && existingPatients.count > 0) {
    return;
  }

  const now = new Date().toISOString();

  const insertPatient = db.prepare(`
    INSERT INTO patients (
      id, mrn, name, date_of_birth, gender, weight_kg, height_cm,
      primary_physician, care_setting, emergency_contact, notes, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertMed = db.prepare(`
    INSERT INTO medications (
      id, patient_id, brand, generic_name, active_ingredients_json, salt, strength,
      formulation, route, prescribed_dose, frequency, administration_instructions,
      prescriber, source, status, verification_status, start_date, end_date, indication,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertAllergy = db.prepare(`
    INSERT INTO allergies (
      id, patient_id, allergen, allergen_type, reaction, severity,
      verification_status, date_recorded, source, notes, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertDiagnosis = db.prepare(`
    INSERT INTO diagnoses (
      id, patient_id, condition, code, clinical_status, verification_status,
      onset_date, date_recorded, source, notes, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertLab = db.prepare(`
    INSERT INTO lab_measurements (
      id, patient_id, test_name, category, value, unit, reference_range,
      interpretation, collection_date, verification_status, source, notes, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertAudit = db.prepare(`
    INSERT INTO audit_logs (
      id, patient_id, entity_type, entity_id, action, timestamp,
      actor, summary, previous_state, new_state, changed_fields_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const transaction = db.transaction(() => {
    // -------------------------------------------------------------
    // PATIENT 1: ELEANOR VANCE (Age 78, CKD 3a, Duplicate Acetaminophen hazard)
    // -------------------------------------------------------------
    const p1Id = 'p1111111-1111-1111-1111-111111111111';
    insertPatient.run(
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
      'Active synthetic profile. Key clinical issue: Co-prescribed OTC acetaminophen and discharge oxycodone/APAP post knee arthroscopy.',
      now,
      now
    );

    insertAudit.run(
      'aud-p1-init',
      p1Id,
      'patient',
      p1Id,
      'CREATE',
      now,
      'Clinical System Importer',
      'Created synthetic patient profile for Eleanor Vance',
      null,
      JSON.stringify({ name: 'Eleanor Vance', mrn: 'SYNTH-84920' }),
      JSON.stringify(['name', 'mrn', 'gender', 'dateOfBirth'])
    );

    // Diagnoses for Patient 1
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
      insertDiagnosis.run(
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
    }

    // Allergies for Patient 1
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
      insertAllergy.run(
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
    }

    // Labs for Patient 1
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
        notes: 'Stage 3a CKD. Renal clearance reduced.',
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
        notes: 'Elevated from baseline 1.2 mg/dL six months prior.',
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
        notes: 'Mildly elevated BUN/Cr ratio.',
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
        notes: 'Normal hepatic transaminases.',
      },
      {
        id: 'lab-p1-5',
        testName: 'Aspartate Aminotransferase (AST)',
        category: 'hepatic',
        value: 20.0,
        unit: 'U/L',
        referenceRange: '8.0 - 35.0 U/L',
        interpretation: 'normal',
        collectionDate: '2026-08-10',
        verificationStatus: 'confirmed',
        source: 'Regional Health Outpatient Lab',
        notes: 'Within normal limits.',
      },
      {
        id: 'lab-p1-6',
        testName: 'Serum Albumin',
        category: 'hepatic',
        value: 3.9,
        unit: 'g/dL',
        referenceRange: '3.5 - 5.0 g/dL',
        interpretation: 'normal',
        collectionDate: '2026-08-10',
        verificationStatus: 'confirmed',
        source: 'Regional Health Outpatient Lab',
        notes: 'Normal synthetic liver function.',
      },
    ];

    for (const l of p1Labs) {
      insertLab.run(
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
    }

    // Medications for Patient 1 (Includes duplicate acetaminophen!)
    const p1Meds = [
      {
        id: 'med-p1-1',
        brand: 'Tylenol Extra Strength',
        genericName: 'Acetaminophen',
        activeIngredients: [{ name: 'Acetaminophen', strength: '500 mg' }],
        salt: 'None (Free base)',
        strength: '500 mg',
        formulation: 'Oral Tablet',
        route: 'Oral',
        prescribedDose: '1 tablet (500 mg)',
        frequency: 'Every 6 hours as needed for joint pain',
        administrationInstructions: 'Take with 8oz water. Do not exceed 3000mg total daily APAP.',
        prescriber: 'Dr. Robert Patel, MD',
        source: 'Patient Self-Report & OTC Log',
        status: 'active',
        verificationStatus: 'confirmed',
        startDate: '2025-01-10',
        endDate: null,
        indication: 'Osteoarthritis knee pain',
      },
      {
        id: 'med-p1-2',
        brand: 'Percocet 5/325',
        genericName: 'Oxycodone Hydrochloride and Acetaminophen',
        activeIngredients: [
          { name: 'Oxycodone', strength: '5 mg' },
          { name: 'Acetaminophen', strength: '325 mg' },
        ],
        salt: 'Hydrochloride (Oxycodone HCl)',
        strength: '5 mg / 325 mg',
        formulation: 'Oral Tablet',
        route: 'Oral',
        prescribedDose: '1 tablet',
        frequency: 'Every 6 hours PRN severe breakthrough pain',
        administrationInstructions: 'Take with food. Warning: Contains acetaminophen and opioid.',
        prescriber: 'Dr. Linda Chen, MD (Orthopedic Surgery)',
        source: 'Discharge Summary 2026-09-02',
        status: 'prn',
        verificationStatus: 'confirmed',
        startDate: '2026-09-02',
        endDate: null,
        indication: 'Post-arthroscopy acute breakthrough knee pain',
      },
      {
        id: 'med-p1-3',
        brand: 'Glucophage XR',
        genericName: 'Metformin Hydrochloride',
        activeIngredients: [{ name: 'Metformin', strength: '500 mg' }],
        salt: 'Hydrochloride',
        strength: '500 mg',
        formulation: 'Extended-Release Tablet',
        route: 'Oral',
        prescribedDose: '1 tablet (500 mg)',
        frequency: 'Twice daily with breakfast and dinner',
        administrationInstructions: 'Take whole with meals; do not chew or crush. Monitor renal status.',
        prescriber: 'Dr. Robert Patel, MD',
        source: 'Electronic Health Record',
        status: 'active',
        verificationStatus: 'confirmed',
        startDate: '2020-03-15',
        endDate: null,
        indication: 'Type 2 Diabetes Mellitus',
      },
      {
        id: 'med-p1-4',
        brand: 'Prinivil',
        genericName: 'Lisinopril',
        activeIngredients: [{ name: 'Lisinopril', strength: '10 mg' }],
        salt: 'Dihydrate',
        strength: '10 mg',
        formulation: 'Oral Tablet',
        route: 'Oral',
        prescribedDose: '1 tablet (10 mg)',
        frequency: 'Once daily in the morning',
        administrationInstructions: 'Take in the morning with water. Monitor blood pressure and potassium.',
        prescriber: 'Dr. Robert Patel, MD',
        source: 'Electronic Health Record',
        status: 'active',
        verificationStatus: 'confirmed',
        startDate: '2016-08-20',
        endDate: null,
        indication: 'Hypertension and Renal Protection',
      },
      {
        id: 'med-p1-5',
        brand: 'Norvasc',
        genericName: 'Amlodipine Besylate',
        activeIngredients: [{ name: 'Amlodipine', strength: '5 mg' }],
        salt: 'Besylate',
        strength: '5 mg',
        formulation: 'Oral Tablet',
        route: 'Oral',
        prescribedDose: '1 tablet (5 mg)',
        frequency: 'Once daily in the morning',
        administrationInstructions: 'Take in the morning with or without food.',
        prescriber: 'Dr. Robert Patel, MD',
        source: 'Electronic Health Record',
        status: 'active',
        verificationStatus: 'confirmed',
        startDate: '2019-11-05',
        endDate: null,
        indication: 'Hypertension',
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
        administrationInstructions: 'Take at bedtime with water.',
        prescriber: 'Dr. Robert Patel, MD',
        source: 'Electronic Health Record',
        status: 'active',
        verificationStatus: 'unverified',
        startDate: '2023-04-12',
        endDate: null,
        indication: 'Hyperlipidemia / Cardiovascular primary prevention',
      },
    ];

    for (const m of p1Meds) {
      insertMed.run(
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

      insertAudit.run(
        `aud-${m.id}-init`,
        p1Id,
        'medication',
        m.id,
        'CREATE',
        now,
        'Clinical Reconciler',
        `Reconciled ${m.brand} (${m.genericName}) from ${m.source}`,
        null,
        JSON.stringify({ brand: m.brand, genericName: m.genericName, strength: m.strength }),
        JSON.stringify(['brand', 'genericName', 'strength', 'prescribedDose'])
      );
    }

    // -------------------------------------------------------------
    // PATIENT 2: ARTHUR PENDELTON (Age 84, AFib, Hepatic Impairment)
    // -------------------------------------------------------------
    const p2Id = 'p2222222-2222-2222-2222-222222222222';
    insertPatient.run(
      p2Id,
      'SYNTH-49211',
      'Arthur Pendelton',
      '1942-07-28',
      'male',
      74.5,
      175.0,
      'Dr. Katherine Bell, MD (Cardiology)',
      'Assisted Living Community',
      'Clara Pendelton (Spouse) - (555) 782-1209',
      'High fall risk, moderate hepatic elevation. Chrono-dosing focus: avoid nocturnal diuretic dosing.',
      now,
      now
    );

    insertAudit.run(
      'aud-p2-init',
      p2Id,
      'patient',
      p2Id,
      'CREATE',
      now,
      'Clinical System Importer',
      'Created synthetic patient profile for Arthur Pendelton',
      null,
      JSON.stringify({ name: 'Arthur Pendelton', mrn: 'SYNTH-49211' }),
      JSON.stringify(['name', 'mrn', 'gender', 'dateOfBirth'])
    );

    // Patient 2 Diagnoses
    const p2Diagnoses = [
      {
        id: 'diag-p2-1',
        condition: 'Non-valvular Atrial Fibrillation',
        code: 'ICD-10 I48.0',
        clinicalStatus: 'active',
        verificationStatus: 'confirmed',
        onsetDate: '2021-02-14',
        dateRecorded: '2026-03-01',
        source: 'Cardiology Clinic Note',
        notes: 'CHA2DS2-VASc score 5. On therapeutic anticoagulation.',
      },
      {
        id: 'diag-p2-2',
        condition: 'Heart Failure with Preserved Ejection Fraction (HFpEF)',
        code: 'ICD-10 I50.30',
        clinicalStatus: 'active',
        verificationStatus: 'confirmed',
        onsetDate: '2022-10-11',
        dateRecorded: '2026-03-01',
        source: 'Cardiology Clinic Note',
        notes: 'NYHA Class II symptoms with peripheral edema.',
      },
      {
        id: 'diag-p2-3',
        condition: 'Nonalcoholic Steatohepatitis (NASH) with mild fibrosis',
        code: 'ICD-10 K75.81',
        clinicalStatus: 'active',
        verificationStatus: 'confirmed',
        onsetDate: '2023-01-20',
        dateRecorded: '2026-03-01',
        source: 'Gastroenterology Note',
        notes: 'Child-Pugh Class A. Monitor hepatic clearance.',
      },
    ];

    for (const d of p2Diagnoses) {
      insertDiagnosis.run(
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
    }

    // Patient 2 Allergies
    const p2Allergies = [
      {
        id: 'all-p2-1',
        allergen: 'Codeine',
        allergenType: 'drug',
        reaction: 'Severe nausea, delirium and vomiting',
        severity: 'severe',
        verificationStatus: 'confirmed',
        dateRecorded: '2019-07-15',
        source: 'Primary Care Chart',
        notes: 'Experienced acute delirium during postoperative care in 2019.',
      },
    ];

    for (const a of p2Allergies) {
      insertAllergy.run(
        a.id,
        p2Id,
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
    }

    // Patient 2 Labs
    const p2Labs = [
      {
        id: 'lab-p2-1',
        testName: 'eGFR (CKD-EPI 2021)',
        category: 'renal',
        value: 58.0,
        unit: 'mL/min/1.73m²',
        referenceRange: '> 60 mL/min/1.73m²',
        interpretation: 'low',
        collectionDate: '2026-09-15',
        verificationStatus: 'confirmed',
        source: 'Cardiology Lab Panel',
        notes: 'Mildly reduced filtration rate.',
      },
      {
        id: 'lab-p2-2',
        testName: 'Alanine Aminotransferase (ALT)',
        category: 'hepatic',
        value: 68.0,
        unit: 'U/L',
        referenceRange: '7.0 - 35.0 U/L',
        interpretation: 'high',
        collectionDate: '2026-09-15',
        verificationStatus: 'confirmed',
        source: 'Cardiology Lab Panel',
        notes: 'Elevated transaminases (approx 2x ULN).',
      },
      {
        id: 'lab-p2-3',
        testName: 'Aspartate Aminotransferase (AST)',
        category: 'hepatic',
        value: 74.0,
        unit: 'U/L',
        referenceRange: '8.0 - 35.0 U/L',
        interpretation: 'high',
        collectionDate: '2026-09-15',
        verificationStatus: 'confirmed',
        source: 'Cardiology Lab Panel',
        notes: 'Elevated AST concordant with NASH.',
      },
      {
        id: 'lab-p2-4',
        testName: 'Total Bilirubin',
        category: 'hepatic',
        value: 2.1,
        unit: 'mg/dL',
        referenceRange: '0.2 - 1.2 mg/dL',
        interpretation: 'high',
        collectionDate: '2026-09-15',
        verificationStatus: 'confirmed',
        source: 'Cardiology Lab Panel',
        notes: 'Mild hyperbilirubinemia.',
      },
    ];

    for (const l of p2Labs) {
      insertLab.run(
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
    }

    // Patient 2 Medications
    const p2Meds = [
      {
        id: 'med-p2-1',
        brand: 'Eliquis',
        genericName: 'Apixaban',
        activeIngredients: [{ name: 'Apixaban', strength: '5 mg' }],
        salt: 'None (Free base)',
        strength: '5 mg',
        formulation: 'Oral Tablet',
        route: 'Oral',
        prescribedDose: '1 tablet (5 mg)',
        frequency: 'Twice daily with or without food',
        administrationInstructions: 'Take morning and evening approx 12 hours apart. Do not skip doses.',
        prescriber: 'Dr. Katherine Bell, MD',
        source: 'Cardiology Clinic Note',
        status: 'active',
        verificationStatus: 'confirmed',
        startDate: '2021-03-01',
        endDate: null,
        indication: 'Stroke prevention in Non-valvular AFib',
      },
      {
        id: 'med-p2-2',
        brand: 'Lopressor',
        genericName: 'Metoprolol Tartrate',
        activeIngredients: [{ name: 'Metoprolol', strength: '25 mg' }],
        salt: 'Tartrate',
        strength: '25 mg',
        formulation: 'Oral Tablet',
        route: 'Oral',
        prescribedDose: '1 tablet (25 mg)',
        frequency: 'Twice daily with meals',
        administrationInstructions: 'Take with or immediately following meals. Check pulse regularly.',
        prescriber: 'Dr. Katherine Bell, MD',
        source: 'Cardiology Clinic Note',
        status: 'active',
        verificationStatus: 'confirmed',
        startDate: '2021-03-01',
        endDate: null,
        indication: 'Rate control in AFib',
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
        administrationInstructions: 'Take strictly in the morning (08:00) with water. Do not take in evening to prevent nocturia and fall hazard.',
        prescriber: 'Dr. Katherine Bell, MD',
        source: 'Cardiology Clinic Note',
        status: 'active',
        verificationStatus: 'confirmed',
        startDate: '2022-10-15',
        endDate: null,
        indication: 'Peripheral edema and HFpEF volume management',
      },
      {
        id: 'med-p2-4',
        brand: 'Ambien',
        genericName: 'Zolpidem Tartrate',
        activeIngredients: [{ name: 'Zolpidem', strength: '5 mg' }],
        salt: 'Tartrate',
        strength: '5 mg',
        formulation: 'Oral Tablet',
        route: 'Oral',
        prescribedDose: '1 tablet (5 mg)',
        frequency: 'At bedtime PRN severe insomnia',
        administrationInstructions: 'Take immediately prior to sleep. Caution: Beers Criteria sedative/fall risk in older adults.',
        prescriber: 'Dr. Arthur Miller, MD (Covering)',
        source: 'Community Pharmacy Fill History',
        status: 'prn',
        verificationStatus: 'unverified',
        startDate: '2026-01-10',
        endDate: null,
        indication: 'Chronic insomnia',
      },
    ];

    for (const m of p2Meds) {
      insertMed.run(
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

      insertAudit.run(
        `aud-${m.id}-init`,
        p2Id,
        'medication',
        m.id,
        'CREATE',
        now,
        'Cardiology Pharmacist',
        `Reconciled ${m.brand} (${m.genericName})`,
        null,
        JSON.stringify({ brand: m.brand, genericName: m.genericName, strength: m.strength }),
        JSON.stringify(['brand', 'genericName', 'strength', 'frequency'])
      );
    }

    // -------------------------------------------------------------
    // PATIENT 3: MARGARET CHEN (Age 72, Osteoporosis, Hypothyroidism)
    // -------------------------------------------------------------
    const p3Id = 'p3333333-3333-3333-3333-333333333333';
    insertPatient.run(
      p3Id,
      'SYNTH-92841',
      'Margaret Chen',
      '1954-11-09',
      'female',
      59.0,
      158.0,
      'Dr. William Davis, MD (Internal Medicine)',
      'Community Living / Independent',
      'David Chen (Spouse) - (555) 441-9820',
      'Chrono-dosing focus: Levothyroxine absorption interference with Calcium Carbonate.',
      now,
      now
    );

    insertAudit.run(
      'aud-p3-init',
      p3Id,
      'patient',
      p3Id,
      'CREATE',
      now,
      'Clinical System Importer',
      'Created synthetic patient profile for Margaret Chen',
      null,
      JSON.stringify({ name: 'Margaret Chen', mrn: 'SYNTH-92841' }),
      JSON.stringify(['name', 'mrn', 'gender', 'dateOfBirth'])
    );

    // Patient 3 Diagnoses
    const p3Diagnoses = [
      {
        id: 'diag-p3-1',
        condition: 'Primary Hypothyroidism',
        code: 'ICD-10 E03.9',
        clinicalStatus: 'active',
        verificationStatus: 'confirmed',
        onsetDate: '2012-04-10',
        dateRecorded: '2026-02-18',
        source: 'Endocrinology Note',
        notes: 'TSH euthyroid on Levothyroxine 75 mcg.',
      },
      {
        id: 'diag-p3-2',
        condition: 'Postmenopausal Osteoporosis',
        code: 'ICD-10 M81.0',
        clinicalStatus: 'active',
        verificationStatus: 'confirmed',
        onsetDate: '2019-08-15',
        dateRecorded: '2026-02-18',
        source: 'DEXA Scan Report',
        notes: 'T-score -2.8 lumbar spine.',
      },
    ];

    for (const d of p3Diagnoses) {
      insertDiagnosis.run(
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
    }

    // Patient 3 Allergies
    insertAllergy.run(
      'all-p3-1',
      p3Id,
      'No Known Drug Allergies (NKDA)',
      'other',
      'No adverse drug reactions reported',
      'unknown',
      'confirmed',
      '2026-02-18',
      'Patient Intake Interview',
      'Patient confirmed no known medication allergies.',
      now,
      now
    );

    // Patient 3 Labs
    const p3Labs = [
      {
        id: 'lab-p3-1',
        testName: 'eGFR (CKD-EPI 2021)',
        category: 'renal',
        value: 78.0,
        unit: 'mL/min/1.73m²',
        referenceRange: '> 60 mL/min/1.73m²',
        interpretation: 'normal',
        collectionDate: '2026-07-20',
        verificationStatus: 'confirmed',
        source: 'Outpatient Lab Panel',
        notes: 'Normal renal clearance.',
      },
      {
        id: 'lab-p3-2',
        testName: 'Alanine Aminotransferase (ALT)',
        category: 'hepatic',
        value: 19.0,
        unit: 'U/L',
        referenceRange: '7.0 - 35.0 U/L',
        interpretation: 'normal',
        collectionDate: '2026-07-20',
        verificationStatus: 'confirmed',
        source: 'Outpatient Lab Panel',
        notes: 'Normal liver function.',
      },
    ];

    for (const l of p3Labs) {
      insertLab.run(
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
    }

    // Patient 3 Medications (Levothyroxine vs Calcium absorption challenge)
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
        frequency: 'Once daily in the morning fasted',
        administrationInstructions: 'Take at least 60 minutes before breakfast on an empty stomach with a full glass of water. Must separate from calcium/iron by at least 4 hours.',
        prescriber: 'Dr. William Davis, MD',
        source: 'Primary Care Problem List',
        status: 'active',
        verificationStatus: 'confirmed',
        startDate: '2012-05-01',
        endDate: null,
        indication: 'Hypothyroidism',
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
        prescribedDose: '1 tablet',
        frequency: 'Twice daily with lunch and dinner',
        administrationInstructions: 'Take with food for optimal absorption. Never take simultaneously with levothyroxine.',
        prescriber: 'Dr. William Davis, MD',
        source: 'Patient Self-Report',
        status: 'active',
        verificationStatus: 'confirmed',
        startDate: '2019-09-01',
        endDate: null,
        indication: 'Osteoporosis supplementation',
      },
      {
        id: 'med-p3-3',
        brand: 'Zoloft',
        genericName: 'Sertraline Hydrochloride',
        activeIngredients: [{ name: 'Sertraline', strength: '50 mg' }],
        salt: 'Hydrochloride',
        strength: '50 mg',
        formulation: 'Oral Tablet',
        route: 'Oral',
        prescribedDose: '1 tablet (50 mg)',
        frequency: 'Once daily in the morning with breakfast',
        administrationInstructions: 'Take with food in the morning to prevent GI upset and insomnia.',
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
      insertMed.run(
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

      insertAudit.run(
        `aud-${m.id}-init`,
        p3Id,
        'medication',
        m.id,
        'CREATE',
        now,
        'Ambulatory Pharmacist',
        `Reconciled ${m.brand} (${m.genericName})`,
        null,
        JSON.stringify({ brand: m.brand, genericName: m.genericName }),
        JSON.stringify(['brand', 'genericName'])
      );
    }
  });

  transaction();
}
