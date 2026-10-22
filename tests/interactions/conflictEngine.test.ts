import { beforeEach, describe, expect, it } from 'vitest';
import type { LabMeasurement, Medication, Patient } from '../../src/shared/types.js';
import { PharmacokineticConflictEngine } from '../../src/server/services/interactions/conflictEngine.js';
import { LocalDrugReferenceProvider } from '../../src/server/services/interactions/referenceDataProvider.js';
import { LocalInteractionEvidenceProvider } from '../../src/server/services/interactions/interactionEvidenceProvider.js';

describe('Phase 3: Pharmacokinetic Conflict Engine', () => {
  let drugRefProvider: LocalDrugReferenceProvider;
  let evidenceProvider: LocalInteractionEvidenceProvider;
  let engine: PharmacokineticConflictEngine;

  const syntheticPatient: Patient = {
    id: 'p-test-01',
    mrn: 'SYNTH-991',
    name: 'Eleanor Vance',
    dateOfBirth: '1948-03-14', // Age 78
    gender: 'female',
    weightKg: 68,
    heightCm: 162,
    primaryPhysician: 'Dr. Robert Patel',
    careSetting: 'Outpatient Clinic',
    emergencyContact: 'Family',
    notes: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const createMed = (
    id: string,
    brand: string,
    genericName: string,
    dose: string,
    status: Medication['status'] = 'active',
    verification: Medication['verificationStatus'] = 'confirmed'
  ): Medication => ({
    id,
    patientId: syntheticPatient.id,
    brand,
    genericName,
    activeIngredients: [{ name: genericName, strength: dose }],
    salt: 'Unknown',
    strength: dose,
    formulation: 'Oral Tablet',
    route: 'Oral',
    prescribedDose: `1 tablet (${dose})`,
    frequency: 'Once daily',
    administrationInstructions: 'Take with water',
    prescriber: 'Dr. Robert Patel',
    source: 'Clinic Order',
    status,
    verificationStatus: verification,
    startDate: null,
    endDate: null,
    indication: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  const renalLab: LabMeasurement = {
    id: 'lab-egfr',
    patientId: syntheticPatient.id,
    testName: 'eGFR (Estimated Glomerular Filtration Rate)',
    category: 'renal',
    value: 42,
    unit: 'mL/min/1.73m²',
    referenceRange: '> 60 mL/min/1.73m²',
    interpretation: 'low',
    collectionDate: '2026-10-01',
    verificationStatus: 'confirmed',
    source: 'Outpatient Lab',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  beforeEach(() => {
    drugRefProvider = new LocalDrugReferenceProvider();
    evidenceProvider = new LocalInteractionEvidenceProvider();
    engine = new PharmacokineticConflictEngine(drugRefProvider, evidenceProvider);
  });

  describe('High-Severity Clinical Interaction Fixtures', () => {
    it('detects Apixaban + Naproxen as MAJOR pharmacodynamic bleeding interaction', async () => {
      const apixaban = createMed('med-1', 'Eliquis', 'Apixaban', '5 mg');
      const naproxen = createMed('med-2', 'Aleve', 'Naproxen', '220 mg');

      const result = await engine.evaluateRegimen(syntheticPatient, [apixaban, naproxen], [renalLab]);

      expect(result.findings.length).toBeGreaterThanOrEqual(1);
      const finding = result.findings.find((f) => f.ruleId === 'rule-ddi-apixaban-naproxen');
      expect(finding).toBeDefined();
      expect(finding?.severity).toBe('major');
      expect(finding?.category).toBe('pharmacodynamic');
      expect(finding?.evidenceLevel).toBe('established_clinical');
      expect(finding?.mechanism).toContain('Factor Xa');
      expect(finding?.mechanism).toContain('COX-1');
      expect(finding?.requiredReview).toBe('urgent_physician_review');
      expect(finding?.sourceCitation).toContain('FDA Eliquis Prescribing Information');
    });

    it('detects Oxycodone + Zolpidem as CONTRAINDICATED pharmacodynamic CNS depression', async () => {
      const oxycodone = createMed('med-1', 'OxyContin', 'Oxycodone', '10 mg');
      const zolpidem = createMed('med-2', 'Ambien', 'Zolpidem', '5 mg');

      const result = await engine.evaluateRegimen(syntheticPatient, [oxycodone, zolpidem]);

      const finding = result.findings.find((f) => f.ruleId === 'rule-ddi-oxycodone-zolpidem');
      expect(finding).toBeDefined();
      expect(finding?.severity).toBe('contraindicated');
      expect(finding?.category).toBe('pharmacodynamic');
      expect(finding?.evidenceLevel).toBe('established_clinical');
      expect(finding?.mechanism).toContain('respiratory depression');
      expect(finding?.sourceCitation).toContain('FDA Boxed Warning on Combined CNS Depressants');
    });

    it('detects Clarithromycin + Apixaban as MAJOR pharmacokinetic CYP3A4 & P-gp inhibition', async () => {
      const apixaban = createMed('med-1', 'Eliquis', 'Apixaban', '5 mg');
      const clarithromycin = createMed('med-2', 'Biaxin', 'Clarithromycin', '500 mg');

      const result = await engine.evaluateRegimen(syntheticPatient, [apixaban, clarithromycin]);

      const finding = result.findings.find((f) => f.ruleId === 'rule-ddi-apixaban-clarithromycin');
      expect(finding).toBeDefined();
      expect(finding?.severity).toBe('major');
      expect(finding?.category).toBe('pharmacokinetic');
      expect(finding?.evidenceLevel).toBe('established_clinical');
      expect(finding?.mechanism).toContain('CYP3A4');
      expect(finding?.mechanism).toContain('P-gp');
    });
  });

  describe('Clinical Constraint: CYP Sharing without Proven Conflict', () => {
    it('CLINICAL CONSTRAINT: Does NOT infer a clinically significant interaction merely because two drugs share a CYP enzyme', async () => {
      const atorvastatin = createMed('med-1', 'Lipitor', 'Atorvastatin', '20 mg');
      const amlodipine = createMed('med-2', 'Norvasc', 'Amlodipine', '5 mg');

      const result = await engine.evaluateRegimen(syntheticPatient, [atorvastatin, amlodipine]);

      const finding = result.findings.find((f) => f.ruleId === 'rule-ddi-atorvastatin-amlodipine');
      expect(finding).toBeDefined();

      // Must be classified as minor and theoretical only - NOT major
      expect(finding?.severity).toBe('minor');
      expect(finding?.evidenceLevel).toBe('theoretical_mechanism');
      expect(finding?.isTheoreticalOnly).toBe(true);
      expect(finding?.requiredReview).toBe('routine_monitoring');
    });
  });

  describe('Absorption Chelation Timing Separation', () => {
    it('detects Levothyroxine + Calcium Carbonate with 4-hour administration window requirement', async () => {
      const levo = createMed('med-1', 'Synthroid', 'Levothyroxine', '75 mcg');
      const calcium = createMed('med-2', 'Caltrate', 'Calcium Carbonate', '600 mg');

      const result = await engine.evaluateRegimen(syntheticPatient, [levo, calcium]);

      const finding = result.findings.find((f) => f.ruleId === 'rule-ddi-levothyroxine-calcium-carbonate');
      expect(finding).toBeDefined();
      expect(finding?.category).toBe('pharmacokinetic');
      expect(finding?.severity).toBe('moderate');
      expect(finding?.managementRecommendation).toContain('4 hours');
      expect(finding?.sourceCitation).toContain('American Thyroid Association');
    });
  });

  describe('Patient-Specific Context & Prerequisite Evaluation', () => {
    it('applies age and eGFR context to Lisinopril + Spironolactone rule', async () => {
      const lisinopril = createMed('med-1', 'Prinivil', 'Lisinopril', '10 mg');
      const spironolactone = createMed('med-2', 'Aldactone', 'Spironolactone', '25 mg');

      const result = await engine.evaluateRegimen(syntheticPatient, [lisinopril, spironolactone], [renalLab]);

      const finding = result.findings.find((f) => f.ruleId === 'rule-ddi-lisinopril-spironolactone');
      expect(finding).toBeDefined();
      expect(finding?.patientContextApplied.evaluatedAge).toBe(true);
      expect(finding?.patientContextApplied.patientAge).toBeGreaterThanOrEqual(65);
      expect(finding?.patientContextApplied.evaluatedRenal).toBe(true);
      expect(finding?.patientContextApplied.patientEgfr).toBe(42);
      expect(finding?.patientContextApplied.notes).toContain('eGFR is 42');
    });
  });

  describe('Absent Data & Clinical Data Gaps', () => {
    it('flags missing renal function data when patient takes renally-cleared drugs without eGFR', async () => {
      const metformin = createMed('med-1', 'Glucophage', 'Metformin', '500 mg');

      // Labs array is empty!
      const result = await engine.evaluateRegimen(syntheticPatient, [metformin], []);

      const renalGap = result.dataGaps.find((g) => g.gapType === 'missing_renal_data');
      expect(renalGap).toBeDefined();
      expect(renalGap?.severity).toBe('high');
      expect(renalGap?.title).toContain('Missing Renal Function');
      expect(renalGap?.affectedMedicationIds).toContain(metformin.id);
    });

    it('flags uncertain medicine identity when prescription status is unverified', async () => {
      const unverifiedMed = createMed('med-1', 'Unconfirmed Drug', 'Metformin', '500 mg', 'active', 'unverified');

      const result = await engine.evaluateRegimen(syntheticPatient, [unverifiedMed], [renalLab]);

      const identityGap = result.dataGaps.find((g) => g.gapType === 'uncertain_medicine_identity');
      expect(identityGap).toBeDefined();
      expect(identityGap?.affectedMedicationIds).toContain(unverifiedMed.id);
    });
  });

  describe('Safe Provider-Unavailable State & Outage Fallback', () => {
    it('CLINICAL CONSTRAINT: Never reports a regimen is safe during a provider outage', async () => {
      const apixaban = createMed('med-1', 'Eliquis', 'Apixaban', '5 mg');
      const naproxen = createMed('med-2', 'Aleve', 'Naproxen', '220 mg');

      // Simulate provider outage
      evidenceProvider.setOutageSimulation(true);

      const result = await engine.evaluateRegimen(syntheticPatient, [apixaban, naproxen], [renalLab]);

      expect(result.providerStatus.isAvailable).toBe(false);
      expect(result.clinicalDisclaimer).toContain('PROVIDER OUTAGE NOTICE');
      expect(result.clinicalDisclaimer).toContain('Absence of findings does NOT indicate regimen safety');

      const outageGap = result.dataGaps.find((g) => g.gapType === 'conflicting_evidence');
      expect(outageGap).toBeDefined();
      expect(outageGap?.title).toContain('Provider Unavailable');

      // Crucial safety invariant: Must not claim findings are empty and regimen is safe
      expect(result.findings.length).toBe(0);
    });
  });

  describe('Stale Dataset Detection', () => {
    it('flags stale dataset when evidence provider revision date exceeds threshold', async () => {
      // Mock stale dataset metadata (revision 250 days ago)
      const staleMeta = {
        ...evidenceProvider.getDatasetMetadata(),
        revisionDate: '2025-01-01',
        staleAfterDays: 180,
      };
      evidenceProvider.getDatasetMetadata = () => staleMeta;

      const apixaban = createMed('med-1', 'Eliquis', 'Apixaban', '5 mg');
      const result = await engine.evaluateRegimen(syntheticPatient, [apixaban], [renalLab]);

      expect(result.providerStatus.isStale).toBe(true);
      const staleGap = result.dataGaps.find((g) => g.gapType === 'stale_dataset');
      expect(staleGap).toBeDefined();
    });
  });

  describe('Conflicting Clinical Evidence Scenario', () => {
    it('handles conflicting evidence (Clopidogrel + Omeprazole) and surfaces clinical controversy', async () => {
      const clopidogrel = createMed('med-1', 'Plavix', 'Clopidogrel', '75 mg');
      const omeprazole = createMed('med-2', 'Prilosec', 'Omeprazole', '20 mg');

      const result = await engine.evaluateRegimen(syntheticPatient, [clopidogrel, omeprazole]);

      const finding = result.findings.find((f) => f.ruleId === 'rule-ddi-clopidogrel-omeprazole');
      expect(finding).toBeDefined();
      expect(finding?.clinicalImpact).toContain('Controversial clinical significance');
      expect(finding?.clinicalImpact).toContain('COGENT');
      expect(finding?.sourceCitation).toContain('COGENT Trial');
    });
  });
});
