import path from 'path';
import fs from 'fs';
import { z } from 'zod';
import type { ClinicalEngineService } from '../services/clinicalEngineService.js';
import {
  SYNTHETIC_PRESCRIPTION_FIXTURES,
  getPrescriptionFixtureById,
} from '../../../src/server/fixtures/prescriptionFixtures.js';
import {
  SYNTHETIC_INTERACTION_FIXTURES,
  getInteractionFixtureById,
} from '../../../src/server/fixtures/interactionFixtures.js';
import {
  SYNTHETIC_SCHEDULE_FIXTURES,
  getScheduleFixtureById,
} from '../../../src/server/fixtures/scheduleFixtures.js';

// Schemas
export const ListSyntheticPatientsInputSchema = z.object({
  scenarioFilter: z.string().optional(),
});

export const GetSyntheticMedicationsInputSchema = z.object({
  patientId: z.string().min(1, 'patientId is required'),
});

export const LoadOcrFixtureInputSchema = z.object({
  fixtureId: z.string().min(1, 'fixtureId is required'),
});

export const RunInteractionFixtureInputSchema = z.object({
  fixtureId: z.string().min(1, 'fixtureId is required'),
});

export const RunScheduleFixtureInputSchema = z.object({
  scenarioId: z.string().min(1, 'scenarioId is required'),
});

export const GetTestResultsInputSchema = z.object({
  category: z.enum(['all', 'ocr', 'interaction', 'schedule']).optional().default('all'),
});

// Handlers

export async function handleListSyntheticPatients(
  rawArgs: unknown,
  engine: ClinicalEngineService
) {
  ListSyntheticPatientsInputSchema.parse(rawArgs);
  const patients = engine.patientRepo.findAll();
  const syntheticPatients = patients.filter(
    (p) => p.mrn.startsWith('SYNTH-') || p.id.startsWith('p')
  );

  return {
    isSyntheticCohort: true,
    totalCount: syntheticPatients.length,
    disclaimer: 'ALL DATA IS SYNTHETIC / FICTIONAL - DO NOT USE FOR ACTUAL CLINICAL CARE',
    patients: syntheticPatients.map((p) => ({
      id: p.id,
      mrn: p.mrn,
      name: p.name,
      dateOfBirth: p.dateOfBirth,
      gender: p.gender,
      primaryPhysician: p.primaryPhysician,
      careSetting: p.careSetting,
      clinicalFocus: p.notes,
    })),
  };
}

export async function handleGetSyntheticMedications(
  rawArgs: unknown,
  engine: ClinicalEngineService
) {
  const args = GetSyntheticMedicationsInputSchema.parse(rawArgs);
  const patient = engine.patientRepo.findById(args.patientId);
  if (!patient) {
    throw new Error(`Patient record "${args.patientId}" not found in local database.`);
  }

  const meds = engine.medRepo.findByPatientId(args.patientId);

  return {
    isSyntheticRecord: true,
    patientId: patient.id,
    patientName: patient.name,
    mrn: patient.mrn,
    totalMedications: meds.length,
    medications: meds.map((m) => ({
      id: m.id,
      brand: m.brand,
      genericName: m.genericName,
      activeIngredients: m.activeIngredients,
      salt: m.salt,
      strength: m.strength,
      formulation: m.formulation,
      route: m.route,
      prescribedDose: m.prescribedDose,
      frequency: m.frequency,
      administrationInstructions: m.administrationInstructions,
      prescriber: m.prescriber,
      source: m.source,
      status: m.status,
      verificationStatus: m.verificationStatus,
      indication: m.indication,
    })),
  };
}

export async function handleLoadOcrFixture(
  rawArgs: unknown,
  engine: ClinicalEngineService
) {
  const args = LoadOcrFixtureInputSchema.parse(rawArgs);
  const fixture = getPrescriptionFixtureById(args.fixtureId);
  if (!fixture) {
    throw new Error(`Synthetic OCR fixture "${args.fixtureId}" not found.`);
  }

  const fixturePath = path.resolve(engine.allowedUploadDir, 'test-fixtures', fixture.fileName);
  if (!fs.existsSync(fixturePath)) {
    throw new Error(`Fixture file "${fixture.fileName}" not found in test-fixtures directory.`);
  }

  const fileBuffer = fs.readFileSync(fixturePath);
  const rawOcr = await engine.ocrEngine.processDocument(fileBuffer, fixture.fileName, fixture.mimeType);
  const normalized = await engine.ocrNormalizationService.processAndNormalize(rawOcr);

  const confidencePassed =
    rawOcr.overallConfidence >= fixture.expectedConfidenceRange[0] &&
    rawOcr.overallConfidence <= fixture.expectedConfidenceRange[1];

  const candidateCountPassed =
    normalized.candidateMedications.length === fixture.expectedCandidateCount;

  return {
    fixtureId: fixture.fixtureId,
    title: fixture.title,
    scenarioType: fixture.scenarioType,
    fileName: fixture.fileName,
    opticalConfidence: rawOcr.overallConfidence,
    expectedConfidenceRange: fixture.expectedConfidenceRange,
    confidencePassed,
    warnings: rawOcr.warnings,
    extractedCandidateCount: normalized.candidateMedications.length,
    expectedCandidateCount: fixture.expectedCandidateCount,
    candidateCountPassed,
    candidates: normalized.candidateMedications.map((c) => ({
      brand: c.brand,
      genericName: c.genericName,
      strength: c.strength,
      dosageForm: c.dosageForm,
      frequency: c.frequency,
      ambiguities: c.ambiguities,
    })),
    expectedAmbiguities: fixture.expectedAmbiguities,
  };
}

export async function handleRunInteractionFixture(
  rawArgs: unknown,
  engine: ClinicalEngineService
) {
  const args = RunInteractionFixtureInputSchema.parse(rawArgs);
  const fixture = getInteractionFixtureById(args.fixtureId);
  if (!fixture) {
    throw new Error(`Synthetic interaction fixture "${args.fixtureId}" not found.`);
  }

  // Handle simulated provider outage fixture
  if (fixture.testAssertions.shouldThrowProviderUnavailable) {
    engine.interactionEvidenceProvider.setOutageSimulation(true);
    try {
      const dummyPatient = engine.patientRepo.findById('p2222222-2222-2222-2222-222222222222')!;
      const dummyMeds = engine.medRepo.findByPatientId('p2222222-2222-2222-2222-222222222222');
      const evalResult = await engine.conflictEngine.evaluateRegimen(dummyPatient, dummyMeds, []);

      return {
        fixtureId: fixture.fixtureId,
        title: fixture.title,
        hypotheticalOrVerified: fixture.hypotheticalOrVerified,
        outageSimulationCaught: true,
        dataGaps: evalResult.dataGaps,
        clinicalDisclaimer: evalResult.clinicalDisclaimer,
        assertionsPassed: evalResult.dataGaps.some((g) => g.gapType === 'conflicting_evidence'),
      };
    } finally {
      engine.interactionEvidenceProvider.setOutageSimulation(false);
    }
  }

  const rules = fixture.drugIdentifiers.drugB
    ? await engine.interactionEvidenceProvider.findRulesForPair(
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

  return {
    fixtureId: fixture.fixtureId,
    title: fixture.title,
    hypotheticalOrVerified: fixture.hypotheticalOrVerified,
    drugA: fixture.drugIdentifiers.drugA,
    drugB: fixture.drugIdentifiers.drugB || null,
    matchedRuleCount: rules.length,
    rules,
    assertionsPassed,
    expectedSeverity: fixture.expectedSeverity,
    expectedEvidenceLevel: fixture.expectedEvidenceLevel,
    evidenceSourceMetadata: fixture.evidenceSourceMetadata || null,
    notes: fixture.notes,
  };
}

export async function handleRunScheduleFixture(
  rawArgs: unknown,
  engine: ClinicalEngineService
) {
  const args = RunScheduleFixtureInputSchema.parse(rawArgs);
  const scenario = getScheduleFixtureById(args.scenarioId);
  if (!scenario) {
    throw new Error(`Synthetic schedule scenario "${args.scenarioId}" not found.`);
  }

  const patient = engine.patientRepo.findById(scenario.patientId);
  if (!patient) {
    throw new Error(`Patient "${scenario.patientId}" for scenario not found in database.`);
  }

  const allMeds = engine.medRepo.findByPatientId(scenario.patientId);
  const schedule = engine.chronoCoordinator.generateSchedule({
    patient,
    medications: allMeds,
  });

  const totalScheduledDoses =
    schedule.slots.reduce((sum, s) => sum + s.doses.length, 0) + (schedule.prnDoses?.length || 0);

  return {
    scenarioId: scenario.scenarioId,
    title: scenario.title,
    status: schedule.status,
    totalScheduledDoses,
    activeTimeSlots: schedule.slots.filter((s) => s.doses.length > 0).map((s) => ({
      slotId: s.slotId,
      slotName: s.slotName,
      targetTime: s.targetTime,
      doseCount: s.doses.length,
    })),
    conflicts: schedule.conflicts,
    assertionsExpected: scenario.expectedAssertions,
    safetyNotice: schedule.safetyNotice,
  };
}

export async function handleGetTestResults(
  rawArgs: unknown,
  engine: ClinicalEngineService
) {
  const args = GetTestResultsInputSchema.parse(rawArgs);
  const results: any = {
    evaluatedAt: new Date().toISOString(),
    category: args.category,
    summary: {},
  };

  if (args.category === 'all' || args.category === 'ocr') {
    results.ocr = {
      totalFixtures: SYNTHETIC_PRESCRIPTION_FIXTURES.length,
      fixtures: SYNTHETIC_PRESCRIPTION_FIXTURES.map((f) => ({
        fixtureId: f.fixtureId,
        title: f.title,
        scenarioType: f.scenarioType,
        expectedCandidateCount: f.expectedCandidateCount,
      })),
    };
  }

  if (args.category === 'all' || args.category === 'interaction') {
    results.interaction = {
      totalFixtures: SYNTHETIC_INTERACTION_FIXTURES.length,
      fixtures: SYNTHETIC_INTERACTION_FIXTURES.map((ix) => ({
        fixtureId: ix.fixtureId,
        title: ix.title,
        hypotheticalOrVerified: ix.hypotheticalOrVerified,
        expectedSeverity: ix.expectedSeverity || null,
      })),
    };
  }

  if (args.category === 'all' || args.category === 'schedule') {
    results.schedule = {
      totalScenarios: SYNTHETIC_SCHEDULE_FIXTURES.length,
      scenarios: SYNTHETIC_SCHEDULE_FIXTURES.map((s) => ({
        scenarioId: s.scenarioId,
        title: s.title,
        patientId: s.patientId,
      })),
    };
  }

  return results;
}
