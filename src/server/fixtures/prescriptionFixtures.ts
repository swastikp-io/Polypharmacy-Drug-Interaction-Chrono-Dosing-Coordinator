import path from 'path';
import fs from 'fs';
import { getDataDir } from '../utils/paths.js';

export interface ExpectedAmbiguity {
  field: string;
  issueType: string;
  severity: 'critical' | 'warning' | 'info';
  descriptionSnippet: string;
}

export interface ExpectedCandidate {
  brand?: string;
  genericNameSubstring: string;
  strength?: string;
  dosageForm?: string;
  frequencySubstring?: string;
  hasAmbiguity?: boolean;
}

export interface PrescriptionFixture {
  fixtureId: string;
  fileName: string;
  title: string;
  scenarioType:
    | 'clear_printed'
    | 'low_quality_scan'
    | 'ambiguous_name'
    | 'missing_dose'
    | 'duplicate_brands'
    | 'conflicting_instructions'
    | 'missing_frequency'
    | 'multipage_pdf';
  mimeType: string;
  description: string;
  prescriptionText: string;
  expectedConfidenceRange: [number, number]; // [min, max]
  expectedCandidateCount: number;
  expectedCandidates: ExpectedCandidate[];
  expectedAmbiguities: ExpectedAmbiguity[];
  expectedWarnings: string[];
}

export const SYNTHETIC_PRESCRIPTION_FIXTURES: PrescriptionFixture[] = [
  {
    fixtureId: 'fix-rx-01-clean-printed',
    fileName: 'rx_01_clean_printed.png',
    title: 'Clear Printed Prescription (High Quality)',
    scenarioType: 'clear_printed',
    mimeType: 'image/png',
    description:
      'High-contrast, clearly typeset outpatient prescription containing standard maintenance therapy. Demonstrates optimal optical character recognition with high confidence and zero unresolved fields.',
    prescriptionText: `===PRESCRIPTION_START===
[SYNTHETIC TEST DATA - NOT REAL MEDICAL RECORD]
Oakwood Geriatric Health Center
Dr. Robert Patel, MD (Lic #MD-94821)
Date: 2026-10-15
Patient: Eleanor Vance (DOB: 1948-03-14)

Rx 1: Glucophage XR (Metformin Hydrochloride) 500 mg
      Extended-Release Oral Tablet
      Sig: Take 1 tablet by mouth twice daily with morning and evening meals.
      Disp: #60 (Sixty) Refills: 3

Rx 2: Prinivil (Lisinopril) 10 mg
      Oral Tablet
      Sig: Take 1 tablet by mouth once daily in the morning with water.
      Disp: #30 (Thirty) Refills: 3
===PRESCRIPTION_END===`,
    expectedConfidenceRange: [0.85, 1.0],
    expectedCandidateCount: 2,
    expectedCandidates: [
      {
        brand: 'Glucophage XR',
        genericNameSubstring: 'Metformin',
        strength: '500 mg',
        dosageForm: 'Extended-Release Tablet',
        frequencySubstring: 'Twice daily',
        hasAmbiguity: false,
      },
      {
        brand: 'Prinivil',
        genericNameSubstring: 'Lisinopril',
        strength: '10 mg',
        dosageForm: 'Oral Tablet',
        frequencySubstring: 'Once daily',
        hasAmbiguity: false,
      },
    ],
    expectedAmbiguities: [],
    expectedWarnings: [],
  },
  {
    fixtureId: 'fix-rx-02-low-quality-scan',
    fileName: 'rx_02_low_quality_scan.png',
    title: 'Low-Quality Scanned Prescription (Degraded Optics)',
    scenarioType: 'low_quality_scan',
    mimeType: 'image/png',
    description:
      'Simulated low-resolution mobile fax/scan (< 200 DPI) with optical blur. OCR confidence drops below 70%, requiring mandatory manual clinician verification.',
    prescriptionText: `===PRESCRIPTION_START===
[SYNTHETIC TEST DATA - DEGRADED SCAN SIMULATION]
Pinecrest Urgent Care Center
Dr. Sanjay Gupta, DO
Date: 2026-10-18
Patient: Walter Sterling (DOB: 1938-12-05)

Rx: Lasix (Furosemide) 40 mg
    Oral Tablet
    Sig: Take 1 tab po qam for fluid retention.
    Disp: #30 Refills: 1
===PRESCRIPTION_END===`,
    expectedConfidenceRange: [0.4, 0.69],
    expectedCandidateCount: 1,
    expectedCandidates: [
      {
        brand: 'Lasix',
        genericNameSubstring: 'Furosemide',
        strength: '40 mg',
        dosageForm: 'Oral Tablet',
        frequencySubstring: 'morning',
        hasAmbiguity: false,
      },
    ],
    expectedAmbiguities: [],
    expectedWarnings: [
      'Image resolution is below 200 DPI or contains significant optical artifacting/blur.',
      'Low OCR optical confidence detected (< 70%). Manual review of medication names and doses is strictly required.',
    ],
  },
  {
    fixtureId: 'fix-rx-03-ambiguous-name',
    fileName: 'rx_03_ambiguous_name.png',
    title: 'Ambiguous Medication Name (LASA Look-Alike Sound-Alike)',
    scenarioType: 'ambiguous_name',
    mimeType: 'image/png',
    description:
      'Prescription order written for "Celexa 20 mg", flagged by the Institute for Safe Medication Practices (ISMP) as a critical Look-Alike Sound-Alike (LASA) hazard with Celebrex (Celecoxib) and Zyprexa (Olanzapine).',
    prescriptionText: `===PRESCRIPTION_START===
[SYNTHETIC TEST DATA - LASA LOOK-ALIKE SOUND-ALIKE FIXTURE]
Riverside Community Behavioral Health
Dr. Marcus Welby, MD
Date: 2026-10-19
Patient: Evelyn Montgomery (DOB: 1957-04-30)

Rx: Celexa (Citalopram Hydrobromide) 20 mg
    Oral Tablet
    Sig: Take 1 tablet by mouth daily in the morning for depression.
    Disp: #30 Refills: 2
===PRESCRIPTION_END===`,
    expectedConfidenceRange: [0.85, 1.0],
    expectedCandidateCount: 1,
    expectedCandidates: [
      {
        brand: 'Celexa',
        genericNameSubstring: 'Citalopram',
        strength: '20 mg',
        dosageForm: 'Oral Tablet',
        frequencySubstring: 'Once daily',
        hasAmbiguity: true,
      },
    ],
    expectedAmbiguities: [
      {
        field: 'brand',
        issueType: 'look_alike_sound_alike',
        severity: 'critical',
        descriptionSnippet: 'Look-Alike / Sound-Alike (LASA) medication hazard',
      },
    ],
    expectedWarnings: [],
  },
  {
    fixtureId: 'fix-rx-04-missing-dose',
    fileName: 'rx_04_missing_dose.png',
    title: 'Missing Dose & Strength (Critical Safety Guardrail)',
    scenarioType: 'missing_dose',
    mimeType: 'image/png',
    description:
      'Incomplete prescription order omitting medication strength. Strict safety invariant: The system must never hallucinate, infer, or guess a missing dose, and must generate a critical ambiguity.',
    prescriptionText: `===PRESCRIPTION_START===
[SYNTHETIC TEST DATA - MISSING DOSE TEST FIXTURE]
Metropolitan Health Partners
Dr. Alan Turing, MD
Date: 2026-10-20
Patient: Harold Finch (DOB: 1945-06-22)

Rx: Metformin Oral Tablet
    Sig: Take 1 tablet by mouth twice daily with meals.
    Disp: #60 Refills: 0
===PRESCRIPTION_END===`,
    expectedConfidenceRange: [0.85, 1.0],
    expectedCandidateCount: 1,
    expectedCandidates: [
      {
        brand: '',
        genericNameSubstring: 'Metformin',
        strength: '',
        dosageForm: 'Oral Tablet',
        frequencySubstring: 'Twice daily',
        hasAmbiguity: true,
      },
    ],
    expectedAmbiguities: [
      {
        field: 'strength',
        issueType: 'missing_dose',
        severity: 'critical',
        descriptionSnippet: 'Never infer a missing dose',
      },
    ],
    expectedWarnings: [],
  },
  {
    fixtureId: 'fix-rx-05-duplicate-brands',
    fileName: 'rx_05_duplicate_brands.png',
    title: 'Duplicate Active Ingredient under Distinct Brand Names',
    scenarioType: 'duplicate_brands',
    mimeType: 'image/png',
    description:
      'Prescription containing both "Naprosyn 250 mg" (naproxen base) and "Anaprox 275 mg" (naproxen sodium). System detects shared chemical identity despite differing brand and salt formulations.',
    prescriptionText: `===PRESCRIPTION_START===
[SYNTHETIC TEST DATA - DUPLICATE INGREDIENT TEST FIXTURE]
Valley Orthopedic & Pain Specialists
Dr. Grace Hopper, MD
Date: 2026-10-21
Patient: Walter Sterling (DOB: 1938-12-05)

Rx 1: Naprosyn 250 mg
      Oral Tablet
      Sig: Take 1 tablet by mouth twice daily with food for chronic joint pain.
      Disp: #60 Refills: 1

Rx 2: Anaprox 275 mg
      Oral Tablet
      Sig: Take 1 tablet by mouth every 12 hours as needed for acute flare.
      Disp: #20 Refills: 0
===PRESCRIPTION_END===`,
    expectedConfidenceRange: [0.85, 1.0],
    expectedCandidateCount: 2,
    expectedCandidates: [
      {
        brand: 'Naprosyn',
        genericNameSubstring: 'Naproxen',
        strength: '250 mg',
        dosageForm: 'Oral Tablet',
        frequencySubstring: 'Twice daily',
      },
      {
        brand: 'Anaprox',
        genericNameSubstring: 'Naproxen',
        strength: '275 mg',
        dosageForm: 'Oral Tablet',
      },
    ],
    expectedAmbiguities: [],
    expectedWarnings: [],
  },
  {
    fixtureId: 'fix-rx-06-conflicting-instructions',
    fileName: 'rx_06_conflicting_instructions.png',
    title: 'Contradictory Administration Instructions',
    scenarioType: 'conflicting_instructions',
    mimeType: 'image/png',
    description:
      'Physically contradictory directions in signature ("Take on empty stomach with heavy breakfast meals"). System extracts raw text, highlights conflicting instructions, and flags for clinical pharmacist clarification.',
    prescriptionText: `===PRESCRIPTION_START===
[SYNTHETIC TEST DATA - CONFLICTING INSTRUCTIONS TEST FIXTURE]
Geriatric Endocrinology Associates
Dr. Ada Lovelace, MD
Date: 2026-10-22
Patient: Margaret Chen (DOB: 1954-11-09)

Rx: Synthroid (Levothyroxine Sodium) 75 mcg
    Oral Tablet
    Sig: Take 1 tablet by mouth on an empty stomach with heavy breakfast meals.
    Disp: #30 Refills: 3
===PRESCRIPTION_END===`,
    expectedConfidenceRange: [0.85, 1.0],
    expectedCandidateCount: 1,
    expectedCandidates: [
      {
        brand: 'Synthroid',
        genericNameSubstring: 'Levothyroxine',
        strength: '75 mcg',
        dosageForm: 'Oral Tablet',
        hasAmbiguity: true,
      },
    ],
    expectedAmbiguities: [
      {
        field: 'administrationInstructions',
        issueType: 'incomplete_sig',
        severity: 'warning',
        descriptionSnippet: 'Contradictory meal instructions',
      },
    ],
    expectedWarnings: [],
  },
  {
    fixtureId: 'fix-rx-07-missing-frequency',
    fileName: 'rx_07_missing_frequency.png',
    title: 'Missing Prescribed Frequency (Incomplete Sig)',
    scenarioType: 'missing_frequency',
    mimeType: 'image/png',
    description:
      'Prescription order with missing dosing frequency ("Sig: Take 1 tablet"). Cannot safely generate a daily timeline without verification of timing interval.',
    prescriptionText: `===PRESCRIPTION_START===
[SYNTHETIC TEST DATA - INCOMPLETE SIG TEST FIXTURE]
University Diabetes Outpatient Center
Dr. Robert Patel, MD
Date: 2026-10-22
Patient: Evelyn Montgomery (DOB: 1957-04-30)

Rx: Glipizide 5 mg
    Oral Tablet
    Sig: Take 1 tablet by mouth with water.
    Disp: #30 Refills: 1
===PRESCRIPTION_END===`,
    expectedConfidenceRange: [0.85, 1.0],
    expectedCandidateCount: 1,
    expectedCandidates: [
      {
        brand: '',
        genericNameSubstring: 'Glipizide',
        strength: '5 mg',
        dosageForm: 'Oral Tablet',
        hasAmbiguity: true,
      },
    ],
    expectedAmbiguities: [
      {
        field: 'frequency',
        issueType: 'incomplete_sig',
        severity: 'warning',
        descriptionSnippet: 'Missing prescribed frequency',
      },
    ],
    expectedWarnings: [],
  },
  {
    fixtureId: 'fix-rx-08-multipage-pdf',
    fileName: 'rx_08_multipage_discharge.pdf',
    title: 'Multipage Inpatient Discharge Summary (PDF Format)',
    scenarioType: 'multipage_pdf',
    mimeType: 'application/pdf',
    description:
      'Electronic PDF discharge order sheet with multiple medications, verifying PDF stream parsing and page index attribution.',
    prescriptionText: `%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >> endobj
4 0 obj << /Length 450 >>
stream
BT
/F1 12 Tf
40 700 Td ([SYNTHETIC TEST DATA - MULTIPAGE DISCHARGE SUMMARY]) Tj
40 670 Td (General Hospital - Inpatient Care Unit) Tj
40 640 Td (Patient: Arthur Pendelton | MRN: SYNTH-49211) Tj
40 600 Td (Rx 1: Lopressor Metoprolol Tartrate 25 mg Oral Tablet) Tj
40 580 Td (Sig: Take 1 tablet by mouth twice daily with food.) Tj
40 540 Td (Rx 2: Eliquis Apixaban 5 mg Oral Tablet) Tj
40 520 Td (Sig: Take 1 tablet by mouth twice daily.) Tj
ET
endstream
endobj
xref
0 5
0000000000 65535 f
0000000010 00000 n
0000000060 00000 n
0000000118 00000 n
0000000215 00000 n
trailer << /Size 5 /Root 1 0 R >>
startxref
720
%%EOF`,
    expectedConfidenceRange: [0.9, 1.0],
    expectedCandidateCount: 2,
    expectedCandidates: [
      {
        brand: 'Lopressor',
        genericNameSubstring: 'Metoprolol',
        strength: '25 mg',
        dosageForm: 'Oral Tablet',
      },
      {
        brand: 'Eliquis',
        genericNameSubstring: 'Apixaban',
        strength: '5 mg',
        dosageForm: 'Oral Tablet',
      },
    ],
    expectedAmbiguities: [],
    expectedWarnings: [],
  },
];

/**
 * Ensures all synthetic prescription document fixtures exist in data/test-fixtures.
 * Generates watermarked files if they do not yet exist on disk.
 */
export function ensurePrescriptionFixturesOnDisk(): void {
  const fixturesDir = path.resolve(getDataDir(), 'test-fixtures');
  if (!fs.existsSync(fixturesDir)) {
    fs.mkdirSync(fixturesDir, { recursive: true });
  }

  const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  for (const fixture of SYNTHETIC_PRESCRIPTION_FIXTURES) {
    const targetPath = path.join(fixturesDir, fixture.fileName);
    if (!fs.existsSync(targetPath)) {
      if (fixture.mimeType === 'application/pdf') {
        fs.writeFileSync(targetPath, Buffer.from(fixture.prescriptionText, 'utf8'));
      } else {
        // PNG image with header and textual prescription chunk
        const textBuffer = Buffer.from(fixture.prescriptionText, 'utf8');
        const fileContent = Buffer.concat([pngHeader, textBuffer]);
        fs.writeFileSync(targetPath, fileContent);
      }
    }
  }
}

export function getPrescriptionFixtureById(fixtureId: string): PrescriptionFixture | undefined {
  return SYNTHETIC_PRESCRIPTION_FIXTURES.find((f) => f.fixtureId === fixtureId);
}
