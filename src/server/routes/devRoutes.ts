import { Router } from 'express';
import type Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { seedSyntheticData, resetSyntheticDataset } from '../db/seeds.js';
import {
  SYNTHETIC_PRESCRIPTION_FIXTURES,
  getPrescriptionFixtureById,
} from '../fixtures/prescriptionFixtures.js';
import {
  SYNTHETIC_INTERACTION_FIXTURES,
  getInteractionFixtureById,
} from '../fixtures/interactionFixtures.js';
import {
  SYNTHETIC_SCHEDULE_FIXTURES,
  getScheduleFixtureById,
} from '../fixtures/scheduleFixtures.js';
import { LocalOCREngine } from '../services/ocr/ocrEngine.js';
import { OCRExtractionService } from '../services/ocr/ocrExtractionService.js';
import { DrugNormalizationService } from '../services/ocr/normalizationService.js';
import { LocalRxNormTerminologyProvider } from '../services/ocr/terminologyProvider.js';
import { MedicationRepository } from '../repositories/medicationRepository.js';
import { PatientRepository } from '../repositories/patientRepository.js';
import { LabMeasurementRepository } from '../repositories/labMeasurementRepository.js';
import { PharmacokineticConflictEngine } from '../services/interactions/conflictEngine.js';
import { LocalDrugReferenceProvider } from '../services/interactions/referenceDataProvider.js';
import { LocalInteractionEvidenceProvider } from '../services/interactions/interactionEvidenceProvider.js';
import { CircadianScheduleCoordinator } from '../services/chrono/scheduleCoordinator.js';
import { getDataDir } from '../utils/paths.js';

export function createDevRouter(db: Database.Database): Router {
  const router = Router();

  const patientRepo = new PatientRepository(db);
  const medRepo = new MedicationRepository(db);
  const labRepo = new LabMeasurementRepository(db);
  const ocrEngine = new LocalOCREngine();
  const extractionService = new OCRExtractionService();
  const terminologyProvider = new LocalRxNormTerminologyProvider();
  const normalizationService = new DrugNormalizationService(
    extractionService,
    terminologyProvider,
    medRepo
  );
  const drugRefProvider = new LocalDrugReferenceProvider();
  const evidenceProvider = new LocalInteractionEvidenceProvider();
  const conflictEngine = new PharmacokineticConflictEngine(drugRefProvider, evidenceProvider);
  const scheduleCoordinator = new CircadianScheduleCoordinator();

  // 1. GET /api/dev/stats - Synthetic Dataset Statistics
  router.get('/stats', (req, res) => {
    try {
      const patientCount = (
        db.prepare("SELECT count(*) as c FROM patients WHERE mrn LIKE 'SYNTH-%' OR id LIKE 'p%-%'").get() as { c: number }
      ).c;
      const medCount = (
        db.prepare("SELECT count(*) as c FROM medications WHERE patient_id LIKE 'p%-%'").get() as { c: number }
      ).c;
      const labCount = (
        db.prepare("SELECT count(*) as c FROM lab_measurements WHERE patient_id LIKE 'p%-%'").get() as { c: number }
      ).c;
      const allergyCount = (
        db.prepare("SELECT count(*) as c FROM allergies WHERE patient_id LIKE 'p%-%'").get() as { c: number }
      ).c;
      const diagnosisCount = (
        db.prepare("SELECT count(*) as c FROM diagnoses WHERE patient_id LIKE 'p%-%'").get() as { c: number }
      ).c;

      res.status(200).json({
        success: true,
        data: {
          syntheticPatients: patientCount,
          syntheticMedications: medCount,
          syntheticLabs: labCount,
          syntheticAllergies: allergyCount,
          syntheticDiagnoses: diagnosisCount,
          prescriptionFixturesCount: SYNTHETIC_PRESCRIPTION_FIXTURES.length,
          interactionFixturesCount: SYNTHETIC_INTERACTION_FIXTURES.length,
          scheduleFixturesCount: SYNTHETIC_SCHEDULE_FIXTURES.length,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 2. POST /api/dev/seed - Idempotent Dataset Seeding
  router.post('/seed', (req, res) => {
    try {
      const summary = seedSyntheticData(db);
      res.status(200).json({
        success: true,
        data: summary,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 3. POST /api/dev/reset - Reset Dedicated Test Dataset
  router.post('/reset', (req, res) => {
    try {
      const { confirmationToken } = req.body;
      if (!confirmationToken || confirmationToken !== 'CONFIRM_RESET_TEST_DATASET') {
        res.status(400).json({
          success: false,
          error:
            'Reset operation requires explicit confirmationToken: "CONFIRM_RESET_TEST_DATASET". Non-synthetic and production data cannot be wiped.',
        });
        return;
      }

      const summary = resetSyntheticDataset(db, confirmationToken);
      res.status(200).json({
        success: true,
        data: summary,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 4. GET /api/dev/fixtures/ocr - List OCR Prescription Fixtures
  router.get('/fixtures/ocr', (req, res) => {
    res.status(200).json({
      success: true,
      data: SYNTHETIC_PRESCRIPTION_FIXTURES.map((f) => ({
        fixtureId: f.fixtureId,
        fileName: f.fileName,
        title: f.title,
        scenarioType: f.scenarioType,
        mimeType: f.mimeType,
        description: f.description,
        expectedCandidateCount: f.expectedCandidateCount,
      })),
    });
  });

  // 5. POST /api/dev/fixtures/ocr/:fixtureId/run - Run OCR Extraction on a Specific Fixture
  router.post('/fixtures/ocr/:fixtureId/run', async (req, res, next) => {
    try {
      const { fixtureId } = req.params;
      const fixture = getPrescriptionFixtureById(fixtureId);
      if (!fixture) {
        res.status(404).json({
          success: false,
          error: `OCR Fixture "${fixtureId}" not found.`,
        });
        return;
      }

      const fixturesDir = path.resolve(getDataDir(), 'test-fixtures');
      const filePath = path.join(fixturesDir, fixture.fileName);
      if (!fs.existsSync(filePath)) {
        res.status(404).json({
          success: false,
          error: `Fixture file "${fixture.fileName}" not found in test fixtures directory.`,
        });
        return;
      }

      const fileBuffer = fs.readFileSync(filePath);
      const rawOcr = await ocrEngine.processDocument(fileBuffer, fixture.fileName, fixture.mimeType);
      const extracted = extractionService.extractCandidates(rawOcr);
      const normalized = await normalizationService.processAndNormalize(rawOcr);

      // Check assertions
      const confidenceValid =
        rawOcr.overallConfidence >= fixture.expectedConfidenceRange[0] &&
        rawOcr.overallConfidence <= fixture.expectedConfidenceRange[1];

      const countMatches = extracted.length === fixture.expectedCandidateCount;

      res.status(200).json({
        success: true,
        data: {
          fixtureId,
          title: fixture.title,
          scenarioType: fixture.scenarioType,
          overallConfidence: rawOcr.overallConfidence,
          confidenceValid,
          warnings: rawOcr.warnings,
          candidateCount: extracted.length,
          countMatches,
          candidates: extracted.map((c) => ({
            id: c.id,
            brand: c.brand,
            genericName: c.genericName,
            strength: c.strength,
            dosageForm: c.dosageForm,
            frequency: c.frequency,
            fieldConfidence: c.fieldConfidence,
            ambiguities: c.ambiguities,
          })),
          normalizedMedications: normalized.candidateMedications,
          expectedAmbiguities: fixture.expectedAmbiguities,
        },
      });
    } catch (err) {
      next(err);
    }
  });

  // 6. GET /api/dev/fixtures/interactions - List Clinical Interaction Fixtures
  router.get('/fixtures/interactions', (req, res) => {
    res.status(200).json({
      success: true,
      data: SYNTHETIC_INTERACTION_FIXTURES,
    });
  });

  // 7. POST /api/dev/fixtures/interactions/:fixtureId/run - Run Interaction Fixture
  router.post('/fixtures/interactions/:fixtureId/run', async (req, res, next) => {
    try {
      const { fixtureId } = req.params;
      const fixture = getInteractionFixtureById(fixtureId);
      if (!fixture) {
        res.status(404).json({
          success: false,
          error: `Interaction Fixture "${fixtureId}" not found.`,
        });
        return;
      }

      // Execute scenario
      if (fixture.testAssertions.shouldThrowProviderUnavailable) {
        evidenceProvider.setOutageSimulation(true);
        try {
          const dummyPatient = patientRepo.findById('p2222222-2222-2222-2222-222222222222')!;
          const dummyMeds = medRepo.findByPatientId('p2222222-2222-2222-2222-222222222222');
          const result = await conflictEngine.evaluateRegimen(dummyPatient, dummyMeds, []);

          res.status(200).json({
            success: true,
            data: {
              fixtureId,
              title: fixture.title,
              simulatedOutageCaught: true,
              dataGaps: result.dataGaps,
              disclaimer: result.clinicalDisclaimer,
              providerStatus: result.providerStatus,
              assertionsPassed: result.dataGaps.some((g) => g.gapType === 'conflicting_evidence'),
            },
          });
        } finally {
          evidenceProvider.setOutageSimulation(false);
        }
        return;
      }

      // Evaluate pair or rules
      const rules = fixture.drugIdentifiers.drugB
        ? await evidenceProvider.findRulesForPair(
            fixture.drugIdentifiers.drugA,
            fixture.drugIdentifiers.drugB
          )
        : [];

      let assertionsPassed = true;
      if (fixture.testAssertions.ruleCountMin !== undefined) {
        assertionsPassed = assertionsPassed && rules.length >= fixture.testAssertions.ruleCountMin;
      }
      if (fixture.testAssertions.ruleCountMax !== undefined) {
        assertionsPassed = assertionsPassed && rules.length <= fixture.testAssertions.ruleCountMax;
      }
      if (fixture.testAssertions.isTheoreticalOnly) {
        assertionsPassed = assertionsPassed && rules.every((r) => r.evidenceLevel === 'theoretical_mechanism');
      }

      res.status(200).json({
        success: true,
        data: {
          fixtureId,
          title: fixture.title,
          matchedRuleCount: rules.length,
          rules,
          assertionsPassed,
          expectedSeverity: fixture.expectedSeverity,
          expectedEvidenceLevel: fixture.expectedEvidenceLevel,
          notes: fixture.notes,
        },
      });
    } catch (err) {
      next(err);
    }
  });

  // 8. GET /api/dev/fixtures/schedules - List Schedule Scenarios
  router.get('/fixtures/schedules', (req, res) => {
    res.status(200).json({
      success: true,
      data: SYNTHETIC_SCHEDULE_FIXTURES,
    });
  });

  // 9. POST /api/dev/fixtures/schedules/:scenarioId/run - Run Schedule Scenario
  router.post('/fixtures/schedules/:scenarioId/run', (req, res, next) => {
    try {
      const { scenarioId } = req.params;
      const scenario = getScheduleFixtureById(scenarioId);
      if (!scenario) {
        res.status(404).json({
          success: false,
          error: `Schedule Scenario "${scenarioId}" not found.`,
        });
        return;
      }

      const patient = patientRepo.findById(scenario.patientId);
      if (!patient) {
        res.status(404).json({
          success: false,
          error: `Patient "${scenario.patientId}" for scenario not found in database.`,
        });
        return;
      }

      const allMeds = medRepo.findByPatientId(scenario.patientId);
      const schedule = scheduleCoordinator.generateSchedule({
        patient,
        medications: allMeds,
      });

      res.status(200).json({
        success: true,
        data: {
          scenarioId,
          title: scenario.title,
          status: schedule.status,
          totalDoses:
            schedule.slots.reduce((sum, s) => sum + s.doses.length, 0) + (schedule.prnDoses?.length || 0),
          slots: schedule.slots.filter((s) => s.doses.length > 0),
          conflicts: schedule.conflicts,
          safetyNotice: schedule.safetyNotice,
          assertionsExpected: scenario.expectedAssertions,
        },
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
