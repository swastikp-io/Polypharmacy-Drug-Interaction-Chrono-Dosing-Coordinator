import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { ClinicalEngineService } from '../src/services/clinicalEngineService.js';
import {
  handleListPatients,
  handleGetPatientMedications,
} from '../src/tools/patientTools.js';
import { handleParsePrescription } from '../src/tools/ocrTools.js';
import {
  handleGetInteractionReport,
  handleGetClinicalEvidence,
} from '../src/tools/interactionTools.js';
import { handleProposeMedicationSchedule } from '../src/tools/scheduleTools.js';
import {
  handleGetReviewStatus,
  handleGetPatientReviewReport,
} from '../src/tools/reviewTools.js';
import { handleConfirmMedication } from '../src/tools/mutationTools.js';

describe('Phase 7: MCP Server - Tool Handlers Unit Tests', () => {
  let db: Database.Database;
  let engine: ClinicalEngineService;

  const P1_ID = 'p1111111-1111-1111-1111-111111111111'; // Eleanor Vance (unverified Atorvastatin)
  const P2_ID = 'p2222222-2222-2222-2222-222222222222'; // Arthur Pendelton (unverified Zolpidem)
  const P3_ID = 'p3333333-3333-3333-3333-333333333333'; // Margaret Chen (all confirmed)

  let testPrescriptionPath: string;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    engine = ClinicalEngineService.createWithDb(db);

    // Create a temporary synthetic prescription file for OCR tests inside allowed data directory
    const testDir = path.resolve(engine.repositoryRoot, 'data', 'test-fixtures');
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
    testPrescriptionPath = path.resolve(testDir, 'synthetic-rx.png');

    const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const rxText = Buffer.from(`===PRESCRIPTION_START===
Memorial Geriatric Health Clinic
Dr. Katherine Bell, MD
Rx: Eliquis (Apixaban) 5 mg
Oral Tablet
Sig: Take 1 tablet by mouth twice daily.
Disp: #60 Refills: 2
===PRESCRIPTION_END===`);

    fs.writeFileSync(testPrescriptionPath, Buffer.concat([pngHeader, rxText]));
  });

  afterEach(() => {
    if (fs.existsSync(testPrescriptionPath)) {
      try {
        fs.unlinkSync(testPrescriptionPath);
      } catch {}
    }
  });

  // ============================================================
  // TOOL 1: list_patients
  // ============================================================
  describe('Tool 1: list_patients', () => {
    it('returns minimal patient records from database', () => {
      const result = handleListPatients({}, engine);
      expect(result.total).toBeGreaterThanOrEqual(3);
      expect(result.patients.some((p) => p.name === 'Eleanor Vance')).toBe(true);
      expect(result.patients.some((p) => p.name === 'Arthur Pendelton')).toBe(true);
      expect(result.patients.some((p) => p.name === 'Margaret Chen')).toBe(true);

      const p1 = result.patients.find((p) => p.id === P1_ID);
      expect(p1?.mrn).toBe('SYNTH-84920');
      expect(p1?.gender).toBe('female');
    });

    it('filters patient records by search query', () => {
      const result = handleListPatients({ search: 'Arthur' }, engine);
      expect(result.total).toBe(1);
      expect(result.patients[0].name).toBe('Arthur Pendelton');
    });
  });

  // ============================================================
  // TOOL 2: get_patient_medications
  // ============================================================
  describe('Tool 2: get_patient_medications', () => {
    it('retrieves only confirmed medications when confirmedOnly is true (default)', () => {
      const result = handleGetPatientMedications({ patientId: P1_ID }, engine);
      expect(result.patientName).toBe('Eleanor Vance');
      expect(result.confirmedOnly).toBe(true);
      expect(result.medications.length).toBeGreaterThan(0);
      expect(result.medications.every((m) => m.verificationStatus === 'confirmed')).toBe(true);
      expect(result.epistemicNotice).toContain('verified confirmed truth');
    });

    it('retrieves unverified medications when confirmedOnly is false', () => {
      const result = handleGetPatientMedications(
        { patientId: P1_ID, confirmedOnly: false },
        engine
      );
      expect(result.confirmedOnly).toBe(false);
      expect(result.medications.some((m) => m.verificationStatus === 'unverified')).toBe(true);
      expect(result.epistemicNotice).toContain('CAUTION: Regimen contains unverified');
    });

    it('throws error when patient is not found', () => {
      expect(() =>
        handleGetPatientMedications({ patientId: 'invalid-id' }, engine)
      ).toThrow(/not found/);
    });
  });

  // ============================================================
  // TOOL 3: parse_prescription
  // ============================================================
  describe('Tool 3: parse_prescription', () => {
    it('successfully parses valid local synthetic prescription document', async () => {
      const result = await handleParsePrescription(
        { filePath: testPrescriptionPath, patientId: P2_ID },
        engine
      );

      expect(result.documentId).toBeDefined();
      expect(result.candidateMedications.length).toBeGreaterThan(0);
      expect(result.safetyCaveat).toContain('CANDIDATE RECORDS ONLY');

      const apixabanCandidate = result.candidateMedications.find((c) =>
        c.genericName.toLowerCase().includes('apixaban')
      );
      expect(apixabanCandidate).toBeDefined();
      expect(apixabanCandidate?.confidence).toBeGreaterThan(0.7);
    });

    it('strictly rejects path traversal attacks outside data boundary', async () => {
      const maliciousPaths = [
        '../../../../etc/passwd',
        '..\\..\\windows\\system32\\cmd.exe',
        path.resolve(engine.repositoryRoot, '../secret.pdf'),
      ];

      for (const malPath of maliciousPaths) {
        await expect(
          handleParsePrescription({ filePath: malPath }, engine)
        ).rejects.toThrow(/Path traversal attempt detected/);
      }
    });

    it('strictly rejects null byte injections', async () => {
      await expect(
        handleParsePrescription(
          { filePath: path.join(engine.allowedUploadDir, 'test.png\0.exe') },
          engine
        )
      ).rejects.toThrow(/Null byte injection/);
    });

    it('strictly rejects unsupported file formats (.txt, .exe)', async () => {
      const textFile = path.resolve(engine.allowedUploadDir, 'unsupported.txt');
      fs.writeFileSync(textFile, 'test script');
      try {
        await expect(
          handleParsePrescription({ filePath: textFile }, engine)
        ).rejects.toThrow(/Unsupported file format/);
      } finally {
        if (fs.existsSync(textFile)) fs.unlinkSync(textFile);
      }
    });
  });

  // ============================================================
  // TOOL 4: get_interaction_report
  // ============================================================
  describe('Tool 4: get_interaction_report', () => {
    it('evaluates Eleanor Vance and identifies duplicate Acetaminophen hazard and data gaps', async () => {
      const result = await handleGetInteractionReport({ patientId: P1_ID }, engine);

      expect(result.patientName).toBe('Eleanor Vance');
      expect(result.evaluatedMedicationCount).toBeGreaterThan(0);
      expect(result.totalPairsEvaluated).toBeGreaterThan(0);

      // Duplicate ingredient detection for Acetaminophen (Tylenol + Percocet)
      expect(result.duplicateIngredients.length).toBeGreaterThanOrEqual(1);
      expect(result.duplicateIngredients[0].ingredientName.toLowerCase()).toBe('acetaminophen');

      // Clinical data gaps identified for CKD stage 3a
      expect(result.clinicalDataGaps.length).toBeGreaterThan(0);

      // Epistemic safety caveat must always be included
      expect(result.safetyCaveat).toContain('Absence of documented interactions does not prove regimen safety');
    });

    it('throws error for invalid patient ID', async () => {
      await expect(
        handleGetInteractionReport({ patientId: 'nonexistent-id' }, engine)
      ).rejects.toThrow(/not found/);
    });
  });

  // ============================================================
  // TOOL 5: get_clinical_evidence
  // ============================================================
  describe('Tool 5: get_clinical_evidence', () => {
    it('returns authentic evidence for validated reference pair (e.g. Apixaban + Clarithromycin)', async () => {
      const result = await handleGetClinicalEvidence(
        { ingredientPair: ['apixaban', 'clarithromycin'] },
        engine
      );

      expect(result.evidenceFound).toBe(true);
      expect(result.citationMetadata).toBeDefined();
      expect(result.citationMetadata?.sourceCitation).toContain('FDA Eliquis Prescribing Information');
      expect(result.severity).toBe('major');
      expect(result.recommendation).toContain('reduce apixaban dose');
    });

    it('returns authentic evidence when queried by findingId', async () => {
      const result = await handleGetClinicalEvidence(
        { findingId: 'rule-ddi-oxycodone-zolpidem' },
        engine
      );

      expect(result.evidenceFound).toBe(true);
      expect(result.severity).toBe('contraindicated');
      expect(result.citationMetadata?.sourceCitation).toContain('FDA Boxed Warning');
    });

    it('returns evidenceFound: false without fabricating text for unverified pairs', async () => {
      const result = await handleGetClinicalEvidence(
        { ingredientPair: ['amoxicillin', 'melatonin'] },
        engine
      );

      expect(result.evidenceFound).toBe(false);
      expect(result.message).toContain('No validated clinical trial or authoritative reference rule documented');
    });
  });

  // ============================================================
  // TOOL 6: propose_medication_schedule
  // ============================================================
  describe('Tool 6: propose_medication_schedule', () => {
    it('proposes draft schedule with 100% dose preservation and timing rationales', async () => {
      const result = await handleProposeMedicationSchedule({ patientId: P3_ID }, engine);

      expect(result.status).toBe('draft');
      expect(result.isDraftOnly).toBe(true);
      expect(result.prescribedDosesPreserved100Percent).toBe(true);
      expect(result.slots.length).toBeGreaterThan(0);
      expect(result.safetyNotice).toContain('CLINICAL SAFETY NOTICE');

      // Verify Margaret Chen: Levothyroxine fasted in wake slot, separated from Calcium in lunch/dinner
      const wakeSlot = result.slots.find((s) => s.slotId === 'slot_wake_fasted');
      expect(wakeSlot).toBeDefined();
      const levo = wakeSlot?.doses.find((d) => d.genericName.toLowerCase().includes('levothyroxine'));
      expect(levo).toBeDefined();
      expect(levo?.timingRationale).toContain('empty stomach');
    });
  });

  // ============================================================
  // TOOL 7: get_review_status
  // ============================================================
  describe('Tool 7: get_review_status', () => {
    it('returns workflow review status and flags unconfirmed medications', async () => {
      const result = await handleGetReviewStatus({ patientId: P1_ID }, engine);

      expect(result.patientName).toBe('Eleanor Vance');
      expect(result.isAwaitingClinicalConfirmation).toBe(true);
      expect(result.unconfirmedMedicationsCount).toBe(1);
      expect(result.unconfirmedMedications[0].brand).toBe('Lipitor');
      expect(result.prioritizedReviewItems.length).toBeGreaterThan(0);
    });
  });

  // ============================================================
  // TOOL 8: confirm_medication
  // ============================================================
  describe('Tool 8: confirm_medication', () => {
    it('confirms an unverified medication order when valid CONFIRM_MUTATION token is supplied', () => {
      const unconfirmedMed = engine.medRepo
        .findByPatientId(P1_ID)
        .find((m) => m.verificationStatus === 'unverified');
      expect(unconfirmedMed).toBeDefined();

      const result = handleConfirmMedication(
        {
          medicationId: unconfirmedMed!.id,
          actor: 'Dr. Sarah Connor, MD',
          confirmationToken: 'CONFIRM_MUTATION',
          justification: 'Discharge summary reconciliation confirmed 20 mg daily bedtime dose',
        },
        engine
      );

      expect(result.success).toBe(true);
      expect(result.newStatus).toBe('confirmed');
      expect(result.confirmedBy).toBe('Dr. Sarah Connor, MD');
      expect(result.auditLogId).toBeDefined();

      // Verify database updated
      const updated = engine.medRepo.findById(unconfirmedMed!.id);
      expect(updated?.verificationStatus).toBe('confirmed');
    });

    it('strictly rejects confirm_medication when confirmationToken is incorrect or missing', () => {
      expect(() =>
        handleConfirmMedication(
          {
            medicationId: 'med-p1-6',
            actor: 'Unauthorized User',
            confirmationToken: 'INVALID_TOKEN' as any,
          },
          engine
        )
      ).toThrow(/CONFIRM_MUTATION/);
    });
  });

  // ============================================================
  // TOOL 9: get_patient_review_report
  // ============================================================
  describe('Tool 9: get_patient_review_report', () => {
    it('compiles full consolidated clinical dossier from existing services', async () => {
      const report = await handleGetPatientReviewReport({ patientId: P2_ID }, engine);

      expect(report.patientId).toBe(P2_ID);
      expect(report.patientSummary.name).toBe('Arthur Pendelton');
      expect(report.isPrototype).toBe(true);
      expect(report.interactionAnalysis).toBeDefined();
      expect(report.circadianCoordination).toBeDefined();
      expect(report.itemsRequiringPharmacistReview.length).toBeGreaterThan(0);
      expect(report.provenance.orchestratorVersion).toBeDefined();
    });
  });
});
