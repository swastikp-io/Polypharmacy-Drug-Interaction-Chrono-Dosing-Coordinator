import { describe, it, expect, beforeEach } from 'vitest';
import path from 'path';
import fs from 'fs';
import {
  SYNTHETIC_PRESCRIPTION_FIXTURES,
  ensurePrescriptionFixturesOnDisk,
} from '../../src/server/fixtures/prescriptionFixtures.js';
import { LocalOCREngine } from '../../src/server/services/ocr/ocrEngine.js';
import { OCRExtractionService } from '../../src/server/services/ocr/ocrExtractionService.js';
import { DrugNormalizationService } from '../../src/server/services/ocr/normalizationService.js';
import { LocalRxNormTerminologyProvider } from '../../src/server/services/ocr/terminologyProvider.js';
import { MedicationRepository } from '../../src/server/repositories/medicationRepository.js';
import Database from 'better-sqlite3';
import { initializeSchema } from '../../src/server/db/database.js';
import { getDataDir } from '../../src/server/utils/paths.js';

describe('Synthetic Prescription Fixtures (OCR & Normalization Verification)', () => {
  let db: Database.Database;
  let ocrEngine: LocalOCREngine;
  let extractionService: OCRExtractionService;
  let terminologyProvider: LocalRxNormTerminologyProvider;
  let normalizationService: DrugNormalizationService;
  let fixturesDir: string;

  beforeEach(() => {
    db = new Database(':memory:');
    initializeSchema(db);
    const medRepo = new MedicationRepository(db);

    ocrEngine = new LocalOCREngine();
    extractionService = new OCRExtractionService();
    terminologyProvider = new LocalRxNormTerminologyProvider();
    normalizationService = new DrugNormalizationService(
      extractionService,
      terminologyProvider,
      medRepo
    );

    ensurePrescriptionFixturesOnDisk();
    fixturesDir = path.resolve(getDataDir(), 'test-fixtures');
  });

  it('contains exactly 8 synthetic prescription test fixtures covering key clinical edge cases', () => {
    expect(SYNTHETIC_PRESCRIPTION_FIXTURES.length).toBe(8);

    const scenarioTypes = SYNTHETIC_PRESCRIPTION_FIXTURES.map((f) => f.scenarioType);
    expect(scenarioTypes).toContain('clear_printed');
    expect(scenarioTypes).toContain('low_quality_scan');
    expect(scenarioTypes).toContain('ambiguous_name');
    expect(scenarioTypes).toContain('missing_dose');
    expect(scenarioTypes).toContain('duplicate_brands');
    expect(scenarioTypes).toContain('conflicting_instructions');
    expect(scenarioTypes).toContain('missing_frequency');
    expect(scenarioTypes).toContain('multipage_pdf');
  });

  for (const fixture of SYNTHETIC_PRESCRIPTION_FIXTURES) {
    it(`evaluates fixture "${fixture.title}" (${fixture.fileName})`, async () => {
      const filePath = path.join(fixturesDir, fixture.fileName);
      expect(fs.existsSync(filePath)).toBe(true);

      const buffer = fs.readFileSync(filePath);
      const doc = await ocrEngine.processDocument(buffer, fixture.fileName, fixture.mimeType);

      // 1. Verify confidence bounds
      expect(doc.overallConfidence).toBeGreaterThanOrEqual(fixture.expectedConfidenceRange[0]);
      expect(doc.overallConfidence).toBeLessThanOrEqual(fixture.expectedConfidenceRange[1]);

      // 2. Extract & Normalize
      const extracted = extractionService.extractCandidates(doc);
      expect(extracted.length).toBe(fixture.expectedCandidateCount);

      const normalized = await normalizationService.processAndNormalize(doc);
      expect(normalized.candidateMedications.length).toBe(fixture.expectedCandidateCount);

      // 3. Verify specific candidate expectations
      for (let i = 0; i < fixture.expectedCandidates.length; i++) {
        const expected = fixture.expectedCandidates[i];
        const actual = normalized.candidateMedications[i];

        if (expected.brand) {
          expect(actual.brand.toLowerCase()).toContain(expected.brand.toLowerCase());
        }
        if (expected.genericNameSubstring) {
          expect(actual.genericName.toLowerCase()).toContain(
            expected.genericNameSubstring.toLowerCase()
          );
        }
        if (expected.strength !== undefined) {
          expect(actual.strength).toBe(expected.strength);
        }
      }

      // 4. Verify expected ambiguities
      for (const expectedAmbiguity of fixture.expectedAmbiguities) {
        const allAmbiguities = normalized.candidateMedications.flatMap((c) => c.ambiguities);
        const match = allAmbiguities.find(
          (a) =>
            a.field === expectedAmbiguity.field &&
            a.issueType === expectedAmbiguity.issueType &&
            a.severity === expectedAmbiguity.severity
        );

        expect(match).toBeDefined();
        if (expectedAmbiguity.descriptionSnippet) {
          expect(match?.description.toLowerCase()).toContain(
            expectedAmbiguity.descriptionSnippet.toLowerCase()
          );
        }
      }
    });
  }
});
