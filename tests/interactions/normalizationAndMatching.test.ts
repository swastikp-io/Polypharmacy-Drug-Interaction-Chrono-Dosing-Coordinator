import { describe, expect, it } from 'vitest';
import { detectDuplicateIngredients, normalizeIngredientName } from '../../src/shared/calculations.js';
import type { Medication } from '../../src/shared/types.js';
import { LocalDrugReferenceProvider } from '../../src/server/services/interactions/referenceDataProvider.js';
import { LocalInteractionEvidenceProvider } from '../../src/server/services/interactions/interactionEvidenceProvider.js';

describe('Phase 3: Ingredient Normalization & Drug Pair Matching', () => {
  const drugRefProvider = new LocalDrugReferenceProvider();
  const evidenceProvider = new LocalInteractionEvidenceProvider();

  describe('Ingredient Normalization & Alias Resolution', () => {
    it('normalizes common brand names, aliases, and salt variations to canonical entities', async () => {
      expect(normalizeIngredientName('Eliquis')).toBe('eliquis');
      expect(normalizeIngredientName('Glucophage XR 500mg')).toContain('glucophage');
      expect(normalizeIngredientName('Tylenol Extra Strength')).toContain('tylenol');
      expect(normalizeIngredientName('Lisinopril Dihydrate')).toBe('lisinopril dihydrate');

      // Test alias resolution through DrugReferenceProvider
      const apixabanRef = await drugRefProvider.lookupByAlias('Eliquis');
      expect(apixabanRef).not.toBeNull();
      expect(apixabanRef?.canonicalName).toBe('apixaban');
      expect(apixabanRef?.pharmacologicalClass).toContain('DOAC');
      expect(apixabanRef?.narrowTherapeuticIndex).toBe(true);

      const naproxenRef = await drugRefProvider.lookupByAlias('Aleve');
      expect(naproxenRef).not.toBeNull();
      expect(naproxenRef?.canonicalName).toBe('naproxen');
      expect(naproxenRef?.pharmacologicalClass).toContain('NSAID');

      const synthroidRef = await drugRefProvider.lookupByAlias('Synthroid');
      expect(synthroidRef?.canonicalName).toBe('levothyroxine');
    });

    it('retrieves CYP and transporter profiles without hallucinating enzyme roles', async () => {
      const apixabanRef = await drugRefProvider.lookupByIngredient('apixaban');
      expect(apixabanRef).not.toBeNull();

      const cyp3a4Effect = apixabanRef?.enzymeTransporterProfile.find((e) => e.target === 'CYP3A4');
      expect(cyp3a4Effect).toBeDefined();
      expect(cyp3a4Effect?.role).toBe('substrate');
      expect(cyp3a4Effect?.strength).toBe('moderate');

      const pgpEffect = apixabanRef?.enzymeTransporterProfile.find((e) => e.target === 'P-gp');
      expect(pgpEffect).toBeDefined();
      expect(pgpEffect?.role).toBe('substrate');
      expect(pgpEffect?.strength).toBe('strong');

      const clarithroRef = await drugRefProvider.lookupByIngredient('clarithromycin');
      const clarithroInhibitor = clarithroRef?.enzymeTransporterProfile.find((e) => e.target === 'CYP3A4');
      expect(clarithroInhibitor?.role).toBe('inhibitor');
      expect(clarithroInhibitor?.strength).toBe('strong');
    });

    it('returns null safely for unknown or unlisted chemical substances', async () => {
      const unknown = await drugRefProvider.lookupByIngredient('completely_unknown_chemical_xyz');
      expect(unknown).toBeNull();
    });
  });

  describe('Duplicate Ingredient Detection Across Combinations', () => {
    it('detects duplicate acetaminophen between single-ingredient Tylenol and combination Percocet', () => {
      const meds: Medication[] = [
        {
          id: 'med-tylenol',
          patientId: 'p1',
          brand: 'Tylenol Extra Strength',
          genericName: 'Acetaminophen',
          activeIngredients: [{ name: 'Acetaminophen', strength: '500 mg' }],
          salt: 'None',
          strength: '500 mg',
          formulation: 'Tablet',
          route: 'Oral',
          prescribedDose: '1 tablet (500mg)',
          frequency: 'Twice daily PRN',
          administrationInstructions: 'Take for pain',
          prescriber: 'Dr. Patel',
          source: 'Chart',
          status: 'active',
          verificationStatus: 'confirmed',
          startDate: null,
          endDate: null,
          indication: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'med-percocet',
          patientId: 'p1',
          brand: 'Percocet 5/325',
          genericName: 'Oxycodone and Acetaminophen',
          activeIngredients: [
            { name: 'Oxycodone', strength: '5 mg' },
            { name: 'Acetaminophen', strength: '325 mg' },
          ],
          salt: 'Hydrochloride',
          strength: '5 mg / 325 mg',
          formulation: 'Tablet',
          route: 'Oral',
          prescribedDose: '1 tablet',
          frequency: 'Every 6 hours PRN',
          administrationInstructions: 'Take for breakthrough pain',
          prescriber: 'Dr. Chen',
          source: 'Discharge',
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
      expect(duplicates.length).toBe(1);
      expect(duplicates[0].normalizedName).toBe('acetaminophen');
      expect(duplicates[0].medications.length).toBe(2);
      expect(duplicates[0].severity).toBe('high');
      expect(duplicates[0].clinicalRationale.toLowerCase()).toContain('hepatotoxicity');
    });
  });

  describe('Drug-Pair Rule Matching via Normalized Identifiers', () => {
    it('matches interaction pairs bidirectionally regardless of ingredient order', async () => {
      // Order A: Apixaban then Naproxen
      const rulesForward = await evidenceProvider.findRulesForPair('apixaban', 'naproxen');
      expect(rulesForward.length).toBe(1);
      expect(rulesForward[0].ruleId).toBe('rule-ddi-apixaban-naproxen');
      expect(rulesForward[0].severity).toBe('major');
      expect(rulesForward[0].category).toBe('pharmacodynamic');

      // Order B: Naproxen then Apixaban (reversed)
      const rulesReverse = await evidenceProvider.findRulesForPair('naproxen', 'apixaban');
      expect(rulesReverse.length).toBe(1);
      expect(rulesReverse[0].ruleId).toBe('rule-ddi-apixaban-naproxen');
    });

    it('returns empty array when two drugs have no documented interaction', async () => {
      const rules = await evidenceProvider.findRulesForPair('acetaminophen', 'lisinopril');
      expect(rules).toEqual([]);
    });
  });
});
