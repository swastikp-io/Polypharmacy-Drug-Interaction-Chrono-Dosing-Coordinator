import type {
  InteractionCategory,
  InteractionSeverity,
  EvidenceLevel,
} from '../../shared/interactionTypes.js';

export interface InteractionTestFixture {
  fixtureId: string;
  title: string;
  category: InteractionCategory;
  hypotheticalOrVerified: 'verified_reference' | 'hypothetical_engine_test';
  drugIdentifiers: {
    drugA: string;
    drugB?: string;
  };
  expectedBehavior: string;
  evidenceSourceMetadata?: {
    sourceAuthority: string;
    datasetVersion: string;
    publicationDate: string;
    citation: string;
  };
  expectedSeverity?: InteractionSeverity;
  expectedEvidenceLevel?: EvidenceLevel;
  patientContextPrerequisite?: {
    requiresRenalData?: boolean;
    requiresHepaticData?: boolean;
    requiresAgeThreshold?: number;
  };
  testAssertions: {
    ruleCountMin?: number;
    ruleCountMax?: number;
    shouldFlagDuplicate?: boolean;
    shouldReportDataGap?: boolean;
    expectedGapField?: string;
    shouldWarnStaleness?: boolean;
    shouldThrowProviderUnavailable?: boolean;
    isTheoreticalOnly?: boolean;
    requiresClinicalReview?: boolean;
    actionableWindowHours?: number;
  };
  notes: string;
}

export const SYNTHETIC_INTERACTION_FIXTURES: InteractionTestFixture[] = [
  {
    fixtureId: 'fix-ix-01-verified-apixaban-naproxen',
    title: 'Verified Reference Interaction: Apixaban + Naproxen (Factor Xa + NSAID)',
    category: 'pharmacodynamic',
    hypotheticalOrVerified: 'verified_reference',
    drugIdentifiers: {
      drugA: 'apixaban',
      drugB: 'naproxen',
    },
    expectedBehavior:
      'Engine matches authoritative FDA Boxed Warning and Beers Criteria 2023 rule. Identifies severe additive gastrointestinal and systemic bleeding hazard; requires clinical review and non-NSAID alternatives.',
    evidenceSourceMetadata: {
      sourceAuthority: 'FDA Eliquis Prescribing Info & AGS Beers Criteria 2023',
      datasetVersion: '2026.1.0',
      publicationDate: '2023-05-04',
      citation: 'J Am Coll Cardiol. 2020;76(19):2203-2214; FDA Prescribing Info Sec 7.2',
    },
    expectedSeverity: 'major',
    expectedEvidenceLevel: 'established_clinical',
    testAssertions: {
      ruleCountMin: 1,
      ruleCountMax: 1,
      requiresClinicalReview: true,
      isTheoreticalOnly: false,
    },
    notes:
      'VERIFIED REFERENCE: Supported by FDA product labeling and published geriatric cardiology consensus.',
  },
  {
    fixtureId: 'fix-ix-02-verified-oxycodone-zolpidem',
    title: 'Verified Reference Contraindication: Oxycodone + Zolpidem (Opioid + Sedative)',
    category: 'pharmacodynamic',
    hypotheticalOrVerified: 'verified_reference',
    drugIdentifiers: {
      drugA: 'oxycodone',
      drugB: 'zolpidem',
    },
    expectedBehavior:
      'Engine triggers contraindicated warning for additive respiratory depression and geriatric CNS sedation per FDA Boxed Warning.',
    evidenceSourceMetadata: {
      sourceAuthority: 'FDA Black Box Warning on Combined CNS Depressants & CDC Opioid Guidelines',
      datasetVersion: '2026.1.0',
      publicationDate: '2023-01-10',
      citation: 'FDA Safety Communication (2016, rev 2023); CDC MMWR 2022.',
    },
    expectedSeverity: 'contraindicated',
    expectedEvidenceLevel: 'established_clinical',
    testAssertions: {
      ruleCountMin: 1,
      ruleCountMax: 1,
      requiresClinicalReview: true,
      isTheoreticalOnly: false,
    },
    notes:
      'VERIFIED REFERENCE: Strict geriatric contraindication; falls and hip fracture risk.',
  },
  {
    fixtureId: 'fix-ix-03-pair-absent-from-reference',
    title: 'Pair Absent from Reference Dataset: Metformin + Levothyroxine',
    category: 'pharmacokinetic',
    hypotheticalOrVerified: 'hypothetical_engine_test',
    drugIdentifiers: {
      drugA: 'metformin',
      drugB: 'levothyroxine',
    },
    expectedBehavior:
      'Engine detects no direct pharmacokinetic or pharmacodynamic rule match in the reference dataset. Emits 0 rule matches without false positive alert fatigue.',
    testAssertions: {
      ruleCountMin: 0,
      ruleCountMax: 0,
      requiresClinicalReview: false,
    },
    notes:
      'TEST NEGATIVE CONTROL: Standard diabetes and thyroid co-therapy without direct interaction.',
  },
  {
    fixtureId: 'fix-ix-04-duplicate-ingredient-apap',
    title: 'Duplicate Active Ingredient Hazard: Tylenol + Percocet (Acetaminophen)',
    category: 'duplicate_therapy',
    hypotheticalOrVerified: 'hypothetical_engine_test',
    drugIdentifiers: {
      drugA: 'acetaminophen',
      drugB: 'acetaminophen',
    },
    expectedBehavior:
      'Engine aggregates active ingredients across distinct brand orders (Tylenol Extra Strength 500 mg and Percocet 5/325 mg) and flags duplicate APAP therapy exceeding safe daily geriatric thresholds.',
    expectedSeverity: 'major',
    testAssertions: {
      shouldFlagDuplicate: true,
      requiresClinicalReview: true,
    },
    notes:
      'SYNTHETIC SAFETY ENGINE TEST: Prevents accidental acetaminophen overdose from multi-source analgesia.',
  },
  {
    fixtureId: 'fix-ix-05-duplicate-nsaid-class',
    title: 'Duplicate Therapeutic Class: Celecoxib + Meloxicam (Dual NSAIDs)',
    category: 'duplicate_therapy',
    hypotheticalOrVerified: 'hypothetical_engine_test',
    drugIdentifiers: {
      drugA: 'celecoxib',
      drugB: 'meloxicam',
    },
    expectedBehavior:
      'Engine flags concurrent prescription of two systemic NSAIDs across different prescribers, detecting class duplication and compounding ulceration/nephrotoxicity hazard.',
    expectedSeverity: 'major',
    testAssertions: {
      shouldFlagDuplicate: true,
      requiresClinicalReview: true,
    },
    notes:
      'SYNTHETIC RECONCILIATION TEST: Common multi-prescriber fragmentation scenario (Rheumatology vs Urgent Care).',
  },
  {
    fixtureId: 'fix-ix-06-uncertain-ingredient-identity',
    title: 'Uncertain / Unmapped Ingredient Identity: Herbal Extract Supplement',
    category: 'other',
    hypotheticalOrVerified: 'hypothetical_engine_test',
    drugIdentifiers: {
      drugA: 'cardio-health-herbal-complex-unmapped',
      drugB: 'warfarin',
    },
    expectedBehavior:
      'Engine encounters an unmapped, ambiguous substance name without an RxNorm concept. Emits a clinical data gap alert indicating uncharacterized supplement interaction risk.',
    testAssertions: {
      shouldReportDataGap: true,
      expectedGapField: 'ingredient_identity',
      requiresClinicalReview: true,
    },
    notes:
      'SYNTHETIC DATA GAP TEST: Unmapped OTC herbal supplements must never be assumed safe.',
  },
  {
    fixtureId: 'fix-ix-07-missing-renal-prerequisite',
    title: 'Missing Clinical Prerequisite: Lisinopril + Spironolactone with Missing eGFR',
    category: 'pharmacodynamic',
    hypotheticalOrVerified: 'verified_reference',
    drugIdentifiers: {
      drugA: 'lisinopril',
      drugB: 'spironolactone',
    },
    expectedBehavior:
      'Rule requires renal function data (eGFR / Serum Creatinine) for hyperkalemia safety evaluation. When evaluated for patient with missing labs, engine issues an explicit Clinical Data Gap alert.',
    evidenceSourceMetadata: {
      sourceAuthority: 'AHA/ACC/HFSA Heart Failure Guidelines 2022',
      datasetVersion: '2026.1.0',
      publicationDate: '2022-04-01',
      citation: 'Circulation 2022;145:e895–e1032; RALES Trial N Engl J Med 1999',
    },
    expectedSeverity: 'major',
    patientContextPrerequisite: {
      requiresRenalData: true,
      requiresAgeThreshold: 65,
    },
    testAssertions: {
      ruleCountMin: 1,
      shouldReportDataGap: true,
      expectedGapField: 'renal_function',
      requiresClinicalReview: true,
    },
    notes:
      'SAFETY PREREQUISITE: Absence of renal data does NOT mean safe; patient requires immediate serum potassium and creatinine monitoring.',
  },
  {
    fixtureId: 'fix-ix-08-stale-reference-dataset',
    title: 'Stale Evidence Dataset Warning (> 180 Days Since Revision)',
    category: 'other',
    hypotheticalOrVerified: 'hypothetical_engine_test',
    drugIdentifiers: {
      drugA: 'apixaban',
      drugB: 'naproxen',
    },
    expectedBehavior:
      'When evidence provider metadata indicates dataset revision age exceeds staleAfterDays threshold, engine emits a prominent staleness disclaimer warning.',
    testAssertions: {
      shouldWarnStaleness: true,
    },
    notes:
      'GOVERNANCE TEST: Clinical decision support must continuously audit reference currency.',
  },
  {
    fixtureId: 'fix-ix-09-unavailable-evidence-provider',
    title: 'Provider Outage / Network Partition Resilience',
    category: 'other',
    hypotheticalOrVerified: 'hypothetical_engine_test',
    drugIdentifiers: {
      drugA: 'warfarin',
      drugB: 'amiodarone',
    },
    expectedBehavior:
      'When simulated outage is active, engine catches provider errors, prevents system crash, and returns a safe degraded-service disclaimer stating interaction safety cannot be determined.',
    testAssertions: {
      shouldThrowProviderUnavailable: true,
    },
    notes:
      'FAULT TOLERANCE TEST: Graceful failure mode prevents unverified silent passes.',
  },
  {
    fixtureId: 'fix-ix-10-theoretical-mechanism-not-promoted',
    title: 'Theoretical Mechanism Not Promoted: Atorvastatin + Amlodipine (Weak CYP3A4)',
    category: 'pharmacokinetic',
    hypotheticalOrVerified: 'verified_reference',
    drugIdentifiers: {
      drugA: 'atorvastatin',
      drugB: 'amlodipine',
    },
    expectedBehavior:
      'Engine identifies theoretical competitive CYP3A4 pathway sharing with minor exposure increase (~18%). Engine classifies as minor / theoretical and MUST NOT promote to a critical clinical alert.',
    evidenceSourceMetadata: {
      sourceAuthority: 'FDA Lipitor Prescribing Info & Clin Pharmacokinet 2006',
      datasetVersion: '2026.1.0',
      publicationDate: '2020-03-12',
      citation: 'Clin Pharmacokinet 2006;45(11):1089-1103',
    },
    expectedSeverity: 'minor',
    expectedEvidenceLevel: 'theoretical_mechanism',
    testAssertions: {
      ruleCountMin: 1,
      ruleCountMax: 1,
      isTheoreticalOnly: true,
      requiresClinicalReview: false,
    },
    notes:
      'ALERT FATIGUE PREVENTION: In vitro CYP affinity alone must not trigger high-severity clinical alarms.',
  },
  {
    fixtureId: 'fix-ix-11-organ-clearance-ckd4',
    title: 'Organ Clearance Conflict: Metformin in Severe CKD Stage 4 (eGFR 22 mL/min)',
    category: 'organ_clearance_conflict',
    hypotheticalOrVerified: 'verified_reference',
    drugIdentifiers: {
      drugA: 'metformin',
    },
    expectedBehavior:
      'Engine cross-references patient eGFR (22 mL/min/1.73m²) against FDA prescribing guidelines (contraindicated if eGFR < 30 mL/min). Issues critical lactic acidosis contraindication alert.',
    evidenceSourceMetadata: {
      sourceAuthority: 'FDA Drug Safety Communication: Metformin in Reduced Kidney Function',
      datasetVersion: '2026.1.0',
      publicationDate: '2016-04-08',
      citation: 'FDA Drug Safety Communication (2016); ADA Standards of Care in Diabetes 2024.',
    },
    expectedSeverity: 'contraindicated',
    patientContextPrerequisite: {
      requiresRenalData: true,
    },
    testAssertions: {
      ruleCountMin: 1,
      requiresClinicalReview: true,
    },
    notes:
      'PHYSIOLOGICAL THRESHOLD: Lactic acidosis hazard in severe renal insufficiency.',
  },
  {
    fixtureId: 'fix-ix-12-chelation-interval-separation',
    title: 'Pharmacokinetic Chelation: Levothyroxine + Calcium Carbonate (4-Hour Window)',
    category: 'pharmacokinetic',
    hypotheticalOrVerified: 'verified_reference',
    drugIdentifiers: {
      drugA: 'levothyroxine',
      drugB: 'calcium carbonate',
    },
    expectedBehavior:
      'Engine identifies gastrointestinal chelation reducing levothyroxine absorption. Provides an actionable chrono-dosing recommendation: separate dose times by at least 4 hours.',
    evidenceSourceMetadata: {
      sourceAuthority: 'American Thyroid Association (ATA) Hypothyroidism Guidelines',
      datasetVersion: '2026.1.0',
      publicationDate: '2021-08-15',
      citation: 'Thyroid 2014;24(12):1670-1751; JAMA 2000;283(21):2822-2825',
    },
    expectedSeverity: 'moderate',
    expectedEvidenceLevel: 'established_clinical',
    testAssertions: {
      ruleCountMin: 1,
      actionableWindowHours: 4,
      requiresClinicalReview: true,
    },
    notes:
      'ACTIONABLE CHRONO-DOSING: Resolution via schedule separation rather than drug discontinuation.',
  },
];

export function getInteractionFixtureById(fixtureId: string): InteractionTestFixture | undefined {
  return SYNTHETIC_INTERACTION_FIXTURES.find((f) => f.fixtureId === fixtureId);
}
