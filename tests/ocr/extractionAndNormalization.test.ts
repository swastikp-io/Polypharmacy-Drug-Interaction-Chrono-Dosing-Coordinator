import Database from 'better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';
import { initializeSchema } from '../../src/server/db/database.js';
import { seedSyntheticData } from '../../src/server/db/seeds.js';
import { MedicationRepository } from '../../src/server/repositories/medicationRepository.js';
import { PatientRepository } from '../../src/server/repositories/patientRepository.js';
import { LocalOCREngine } from '../../src/server/services/ocr/ocrEngine.js';
import { OCRExtractionService } from '../../src/server/services/ocr/ocrExtractionService.js';
import { DrugNormalizationService } from '../../src/server/services/ocr/normalizationService.js';
import { LocalRxNormTerminologyProvider } from '../../src/server/services/ocr/terminologyProvider.js';

describe('OCR Extraction (Layer A) & Normalization (Layer B)', () => {
  let db: Database.Database;
  let ocrEngine: LocalOCREngine;
  let extractionService: OCRExtractionService;
  let terminologyProvider: LocalRxNormTerminologyProvider;
  let normalizationService: DrugNormalizationService;
  let medRepo: MedicationRepository;
  let patientRepo: PatientRepository;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    initializeSchema(db);
    seedSyntheticData(db);

    medRepo = new MedicationRepository(db);
    patientRepo = new PatientRepository(db);
    ocrEngine = new LocalOCREngine();
    extractionService = new OCRExtractionService();
    terminologyProvider = new LocalRxNormTerminologyProvider();
    normalizationService = new DrugNormalizationService(
      extractionService,
      terminologyProvider,
      medRepo
    );
  });

  describe('Layer A: OCRExtractionService', () => {
    it('extracts candidate medication orders from clean printed prescription text', async () => {
      const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      const text = Buffer.from(`===PRESCRIPTION_START===
Memorial Geriatric Health Clinic
Dr. Robert Patel, MD
Date: 2026-10-15
Patient: Eleanor Vance

1. Glucophage XR (Metformin Hydrochloride) 500 mg
   Extended-Release Tablet
   Sig: Take 1 tablet by mouth twice daily with meals.
   Disp: #60 Refills: 3

2. Prinivil (Lisinopril) 10 mg
   Oral Tablet
   Sig: Take 1 tablet by mouth once daily in the morning.
   Disp: #30 Refills: 3
===PRESCRIPTION_END===`);

      const doc = await ocrEngine.processDocument(
        Buffer.concat([pngHeader, text]),
        'clean_order.png',
        'image/png'
      );

      const candidates = extractionService.extractCandidates(doc);

      expect(candidates.length).toBe(2);

      // Verify Metformin candidate
      const c1 = candidates[0];
      expect(c1.brand).toBe('Glucophage XR');
      expect(c1.genericName).toContain('Metformin');
      expect(c1.salt).toBe('Hydrochloride');
      expect(c1.strength).toBe('500 mg');
      expect(c1.dosageForm).toContain('Tablet');
      expect(c1.releaseFormulation).toContain('Extended Release');
      expect(c1.frequency).toContain('Twice daily');
      expect(c1.prescriber).toContain('Robert Patel');
      expect(c1.sourceSnippet).toContain('Glucophage XR');
      expect(c1.sourceLineIndex).toBeGreaterThan(0);
      expect(c1.pageNumber).toBe(1);

      // Verify field-level confidence
      expect(c1.fieldConfidence.brand).toBeGreaterThanOrEqual(0.8);
      expect(c1.fieldConfidence.strength).toBeGreaterThanOrEqual(0.8);
      expect(c1.fieldConfidence.dosageForm).toBeGreaterThanOrEqual(0.8);
    });

    it('SAFETY: Never infers missing dose - flags critical ambiguity for missing strength', async () => {
      const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      const text = Buffer.from(`===PRESCRIPTION_START===
Rx: Metformin Oral Tablet
Sig: Take 1 tablet by mouth twice daily with meals.
===PRESCRIPTION_END===`);

      const doc = await ocrEngine.processDocument(
        Buffer.concat([pngHeader, text]),
        'missing_dose.png',
        'image/png'
      );

      const candidates = extractionService.extractCandidates(doc);

      expect(candidates.length).toBe(1);
      const c = candidates[0];

      // Dose must NOT be hallucinated or inferred
      expect(c.strength).toBe('');

      // Must be flagged as a critical missing dose ambiguity
      const missingDoseAmbiguity = c.ambiguities.find(
        (a) => a.field === 'strength' && a.issueType === 'missing_dose'
      );
      expect(missingDoseAmbiguity).toBeDefined();
      expect(missingDoseAmbiguity?.severity).toBe('critical');
      expect(missingDoseAmbiguity?.description).toContain('Never infer a missing dose');
    });

    it('SAFETY: Flags missing units when dose has a bare number', async () => {
      const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      const text = Buffer.from(`===PRESCRIPTION_START===
Rx: Norvasc 5
Sig: Take 1 tablet once daily.
===PRESCRIPTION_END===`);

      const doc = await ocrEngine.processDocument(
        Buffer.concat([pngHeader, text]),
        'missing_unit.png',
        'image/png'
      );

      const candidates = extractionService.extractCandidates(doc);

      expect(candidates.length).toBe(1);
      const c = candidates[0];

      const missingUnitAmbiguity = c.ambiguities.find(
        (a) => a.field === 'strength' && a.issueType === 'missing_unit'
      );
      expect(missingUnitAmbiguity).toBeDefined();
      expect(missingUnitAmbiguity?.severity).toBe('critical');
      expect(missingUnitAmbiguity?.description).toContain('has no measurement unit');
    });
  });

  describe('Layer B: DrugNormalizationService & Terminology Provider', () => {
    it('normalizes candidates to standard RxNorm concepts and identifies explicit salts', async () => {
      const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      const text = Buffer.from(`===PRESCRIPTION_START===
Rx: Norvasc 5 mg Oral Tablet
Sig: Take 1 tablet daily.
===PRESCRIPTION_END===`);

      const doc = await ocrEngine.processDocument(
        Buffer.concat([pngHeader, text]),
        'amlodipine.png',
        'image/png'
      );

      const candidates = extractionService.extractCandidates(doc);
      const normalized = await normalizationService.normalizeCandidates(candidates);

      expect(normalized.length).toBe(1);
      const c = normalized[0];

      expect(c.terminologyMatches.length).toBeGreaterThan(0);
      const topMatch = c.terminologyMatches[0];
      expect(topMatch.genericName).toContain('Amlodipine');
      expect(topMatch.saltForm).toBe('Besylate');
      expect(topMatch.conceptId).toBeDefined();
    });

    it('SAFETY: Detects Look-Alike / Sound-Alike (LASA) hazard and never silently chooses', async () => {
      const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      const text = Buffer.from(`===PRESCRIPTION_START===
Rx: Celexa 20 mg Oral Tablet
Sig: Take 1 tablet daily in morning.
===PRESCRIPTION_END===`);

      const doc = await ocrEngine.processDocument(
        Buffer.concat([pngHeader, text]),
        'celexa.png',
        'image/png'
      );

      const candidates = extractionService.extractCandidates(doc);
      const normalized = await normalizationService.normalizeCandidates(candidates);

      expect(normalized.length).toBe(1);
      const c = normalized[0];

      // Must identify critical LASA ambiguity
      const lasaAmbiguity = c.ambiguities.find((a) => a.issueType === 'look_alike_sound_alike');
      expect(lasaAmbiguity).toBeDefined();
      expect(lasaAmbiguity?.severity).toBe('critical');
      expect(lasaAmbiguity?.description).toContain('Look-Alike / Sound-Alike');

      // Check alternatives are surfaced (Celebrex, Zyprexa)
      const topMatch = c.terminologyMatches[0];
      expect(topMatch.isLASAHazard).toBe(true);
      expect(topMatch.lasaAlternatives).toBeDefined();
      expect(topMatch.lasaAlternatives?.length).toBeGreaterThanOrEqual(1);
    });

    it('SAFETY: Detects duplicate active ingredients against active patient medications', async () => {
      const p1Id = 'p1111111-1111-1111-1111-111111111111'; // Eleanor Vance (has Tylenol & Percocet with Acetaminophen)

      const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      const text = Buffer.from(`===PRESCRIPTION_START===
Rx: Percocet 5/325 (Oxycodone Hydrochloride and Acetaminophen 5 mg / 325 mg)
Sig: Take 1 tablet every 6 hours PRN severe pain.
===PRESCRIPTION_END===`);

      const doc = await ocrEngine.processDocument(
        Buffer.concat([pngHeader, text]),
        'percocet_discharge.png',
        'image/png'
      );

      const candidates = extractionService.extractCandidates(doc);
      const normalized = await normalizationService.normalizeCandidates(candidates, p1Id);

      expect(normalized.length).toBe(1);
      const c = normalized[0];

      expect(c.duplicateIngredientWarnings.length).toBeGreaterThanOrEqual(1);
      expect(
        c.duplicateIngredientWarnings.some((w) =>
          w.toLowerCase().includes('acetaminophen')
        )
      ).toBe(true);

      const dupAmbiguity = c.ambiguities.find((a) => a.issueType === 'duplicate_ingredient_risk');
      expect(dupAmbiguity).toBeDefined();
      expect(dupAmbiguity?.severity).toBe('critical');
    });

    it('terminology search returns valid concept matches and LASA flags', async () => {
      const results = await terminologyProvider.search('Metformin');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].genericName).toContain('Metformin');
      expect(results[0].saltForm).toBe('Hydrochloride');

      const nonExistent = await terminologyProvider.search('NonExistentDrug999');
      expect(nonExistent).toEqual([]);
    });
  });
});
