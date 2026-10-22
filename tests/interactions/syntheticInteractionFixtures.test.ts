import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { initializeSchema } from '../../src/server/db/database.js';
import { seedSyntheticData } from '../../src/server/db/seeds.js';
import { PatientRepository } from '../../src/server/repositories/patientRepository.js';
import { MedicationRepository } from '../../src/server/repositories/medicationRepository.js';
import { LabMeasurementRepository } from '../../src/server/repositories/labMeasurementRepository.js';
import { PharmacokineticConflictEngine } from '../../src/server/services/interactions/conflictEngine.js';
import { LocalDrugReferenceProvider } from '../../src/server/services/interactions/referenceDataProvider.js';
import { LocalInteractionEvidenceProvider } from '../../src/server/services/interactions/interactionEvidenceProvider.js';
import {
  SYNTHETIC_INTERACTION_FIXTURES,
  getInteractionFixtureById,
} from '../../src/server/fixtures/interactionFixtures.js';

describe('Synthetic Clinical Interaction Fixtures (Rule-Engine Behavior)', () => {
  let db: Database.Database;
  let patientRepo: PatientRepository;
  let medRepo: MedicationRepository;
  let labRepo: LabMeasurementRepository;
  let drugRefProvider: LocalDrugReferenceProvider;
  let evidenceProvider: LocalInteractionEvidenceProvider;
  let conflictEngine: PharmacokineticConflictEngine;

  beforeEach(() => {
    db = new Database(':memory:');
    initializeSchema(db);
    seedSyntheticData(db);

    patientRepo = new PatientRepository(db);
    medRepo = new MedicationRepository(db);
    labRepo = new LabMeasurementRepository(db);
    drugRefProvider = new LocalDrugReferenceProvider();
    evidenceProvider = new LocalInteractionEvidenceProvider();
    conflictEngine = new PharmacokineticConflictEngine(drugRefProvider, evidenceProvider);
  });

  it('contains exactly 12 interaction test fixtures covering diverse evidence classes and failure modes', () => {
    expect(SYNTHETIC_INTERACTION_FIXTURES.length).toBe(12);

    const categories = SYNTHETIC_INTERACTION_FIXTURES.map((f) => f.category);
    expect(categories).toContain('pharmacodynamic');
    expect(categories).toContain('pharmacokinetic');
    expect(categories).toContain('duplicate_therapy');
    expect(categories).toContain('organ_clearance_conflict');
  });

  it('verifies verified-reference interaction: Apixaban + Naproxen major bleed hazard', async () => {
    const fixture = getInteractionFixtureById('fix-ix-01-verified-apixaban-naproxen')!;
    expect(fixture.hypotheticalOrVerified).toBe('verified_reference');

    const rules = await evidenceProvider.findRulesForPair('apixaban', 'naproxen');
    expect(rules.length).toBe(1);
    expect(rules[0].severity).toBe('major');
    expect(rules[0].evidenceLevel).toBe('established_clinical');
    expect(rules[0].requiresClinicalReview).toBe(true);
  });

  it('verifies verified-reference contraindication: Oxycodone + Zolpidem CNS depression', async () => {
    const fixture = getInteractionFixtureById('fix-ix-02-verified-oxycodone-zolpidem')!;
    expect(fixture.hypotheticalOrVerified).toBe('verified_reference');

    const rules = await evidenceProvider.findRulesForPair('oxycodone', 'zolpidem');
    expect(rules.length).toBe(1);
    expect(rules[0].severity).toBe('contraindicated');
    expect(rules[0].evidenceLevel).toBe('established_clinical');
  });

  it('NEGATIVE CONTROL: Pair absent from reference database triggers 0 rules and no false positives', async () => {
    const rules = await evidenceProvider.findRulesForPair('metformin', 'levothyroxine');
    expect(rules.length).toBe(0);
  });

  it('evaluates Eleanor Vance and detects duplicate Acetaminophen hazard from two distinct sources', async () => {
    const p1 = patientRepo.findById('p1111111-1111-1111-1111-111111111111')!;
    const p1Meds = medRepo.findByPatientId(p1.id);
    const p1Labs = labRepo.findByPatientId(p1.id);

    const evalResult = await conflictEngine.evaluateRegimen(p1, p1Meds, p1Labs);

    expect(evalResult.duplicateIngredients.length).toBeGreaterThanOrEqual(1);
    const apap = evalResult.duplicateIngredients.find((d) => d.normalizedName.includes('acetaminophen'));
    expect(apap).toBeDefined();
    expect(apap?.medications.length).toBe(2); // Tylenol + Percocet
  });

  it('evaluates Walter Sterling and detects duplicate NSAID therapy (Celecoxib + Meloxicam) with Apixaban', async () => {
    const p6 = patientRepo.findById('p6666666-6666-6666-6666-666666666666')!;
    const p6Meds = medRepo.findByPatientId(p6.id);
    const p6Labs = labRepo.findByPatientId(p6.id);

    const evalResult = await conflictEngine.evaluateRegimen(p6, p6Meds, p6Labs);

    // Should detect duplicate active ingredients or duplicate therapeutic class
    const dupNsaid = evalResult.findings.some(
      (f) =>
        f.category === 'duplicate_therapy' ||
        (f.description && f.description.toLowerCase().includes('nsaid')) ||
        (f.mechanism && f.mechanism.toLowerCase().includes('nsaid'))
    );
    expect(dupNsaid).toBe(true);
  });

  it('evaluates Evelyn Montgomery and reports high-severity clinical data gap for missing renal labs', async () => {
    const p7 = patientRepo.findById('p7777777-7777-7777-7777-777777777777')!;
    const p7Meds = medRepo.findByPatientId(p7.id);
    const p7Labs = labRepo.findByPatientId(p7.id); // Intentionally empty in seed data

    expect(p7Labs.length).toBe(0);

    const evalResult = await conflictEngine.evaluateRegimen(p7, p7Meds, p7Labs);

    const renalGap = evalResult.dataGaps.find((g) => g.gapType === 'missing_renal_data');
    expect(renalGap).toBeDefined();
    expect(renalGap?.severity).toBe('high');
    expect(renalGap?.description).toContain('renally-eliminated');
  });

  it('SAFETY INVARIANT: Theoretical mechanism (Atorvastatin + Amlodipine) is NOT promoted to major clinical alert', async () => {
    const rules = await evidenceProvider.findRulesForPair('atorvastatin', 'amlodipine');
    expect(rules.length).toBe(1);

    const rule = rules[0];
    expect(rule.evidenceLevel).toBe('theoretical_mechanism');
    expect(rule.severity).toBe('minor');
    expect(rule.requiresClinicalReview).toBe(false);
  });

  it('FAULT TOLERANCE: Simulated provider outage activates degraded state without crashing', async () => {
    evidenceProvider.setOutageSimulation(true);
    try {
      const p1 = patientRepo.findById('p1111111-1111-1111-1111-111111111111')!;
      const p1Meds = medRepo.findByPatientId(p1.id);

      const result = await conflictEngine.evaluateRegimen(p1, p1Meds, []);

      expect(result.providerStatus.isAvailable).toBe(false);
      expect(result.clinicalDisclaimer).toContain('PROVIDER OUTAGE NOTICE');
      expect(result.dataGaps.some((g) => g.gapType === 'conflicting_evidence')).toBe(true);
    } finally {
      evidenceProvider.setOutageSimulation(false);
    }
  });
});
