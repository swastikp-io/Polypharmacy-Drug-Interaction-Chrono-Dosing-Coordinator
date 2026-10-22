import { randomUUID } from 'crypto';
import { normalizeIngredientName } from '../../../shared/calculations.js';
import type {
  CandidateMedication,
  IDrugTerminologyProvider,
  OCRDocumentResult,
  OCRProcessingResponse,
} from '../../../shared/ocrTypes.js';
import type { MedicationRepository } from '../../repositories/medicationRepository.js';
import type { OCRExtractionService } from './ocrExtractionService.js';

export class DrugNormalizationService {
  constructor(
    private extractionService: OCRExtractionService,
    private terminologyProvider: IDrugTerminologyProvider,
    private medRepo: MedicationRepository
  ) {}

  async processAndNormalize(
    document: OCRDocumentResult,
    patientId?: string
  ): Promise<OCRProcessingResponse> {
    // 1. Layer A: Raw OCR Extraction (Independent of Terminology)
    const rawCandidates = this.extractionService.extractCandidates(document);

    // Fetch patient's existing active medications for duplicate ingredient check
    const existingPatientMeds = patientId
      ? this.medRepo
          .findByPatientId(patientId)
          .filter((m) => m.status === 'active' || m.status === 'prn' || m.status === 'held')
      : [];

    // 2. Layer B: Drug Identity Resolution & Clinical Safety Checks
    const candidateMedications: CandidateMedication[] = [];

    for (const candidate of rawCandidates) {
      const normalizedCandidate = await this.normalizeCandidate(candidate, existingPatientMeds);
      candidateMedications.push(normalizedCandidate);
    }

    const totalExtracted = candidateMedications.length;
    const highConfidenceCount = candidateMedications.filter(
      (c) => c.fieldConfidence.overall >= 0.85 && c.ambiguities.length === 0
    ).length;
    const ambiguityCount = candidateMedications.filter((c) => c.ambiguities.length > 0).length;
    const criticalIssueCount = candidateMedications.reduce(
      (acc, c) => acc + c.ambiguities.filter((a) => a.severity === 'critical').length,
      0
    );
    const duplicateIngredientCount = candidateMedications.filter(
      (c) => c.duplicateIngredientWarnings.length > 0
    ).length;

    return {
      document,
      candidateMedications,
      summary: {
        totalExtracted,
        highConfidenceCount,
        ambiguityCount,
        criticalIssueCount,
        duplicateIngredientCount,
      },
      processedAt: new Date().toISOString(),
      privacyNotice:
        'LOCAL-FIRST OCR PROCESSING: Document was analyzed entirely within the local execution environment. Zero external AI or cloud OCR services were contacted.',
    };
  }

  async normalizeCandidates(
    candidates: CandidateMedication[],
    patientId?: string
  ): Promise<CandidateMedication[]> {
    const existingPatientMeds = patientId
      ? this.medRepo
          .findByPatientId(patientId)
          .filter((m) => m.status === 'active' || m.status === 'prn' || m.status === 'held')
      : [];

    const normalized: CandidateMedication[] = [];
    for (const candidate of candidates) {
      normalized.push(await this.normalizeCandidate(candidate, existingPatientMeds));
    }
    return normalized;
  }

  private async normalizeCandidate(
    candidate: CandidateMedication,
    existingPatientMeds: ReturnType<MedicationRepository['findByPatientId']>
  ): Promise<CandidateMedication> {
    const updated = { ...candidate };

    // Search Terminology Provider
    const matches = await this.terminologyProvider.search(candidate.brand);
    updated.terminologyMatches = matches;

    // Check for Look-Alike / Sound-Alike (LASA) Ambiguities
    const lasaPairs = this.terminologyProvider.findLASAPairs(candidate.brand);
    if (lasaPairs.length > 0) {
      updated.ambiguities.push({
        id: randomUUID(),
        field: 'brand',
        issueType: 'look_alike_sound_alike',
        severity: 'critical',
        description: `High-alert Look-Alike / Sound-Alike (LASA) medication hazard: "${candidate.brand}" may be confused with ${lasaPairs.join(', ')}. Strict prescriber verification required.`,
        candidates: [candidate.brand, ...lasaPairs],
      });
    }

    // Safety rule: Never silently choose between multiple similarly-scored candidates
    if (matches.length > 1 && Math.abs(matches[0].matchScore - matches[1].matchScore) < 0.1) {
      updated.ambiguities.push({
        id: randomUUID(),
        field: 'genericName',
        issueType: 'multiple_terminology_matches',
        severity: 'warning',
        description: `Multiple standard formulary concepts match "${candidate.brand}". Clinician must explicitly select correct drug entity.`,
        candidates: matches.slice(0, 3).map((m) => m.term),
      });
      // Do not automatically select ambiguous match
      updated.selectedTerminologyMatch = null;
    } else if (matches.length > 0 && matches[0].matchScore >= 0.85 && !lasaPairs.length) {
      // Safe high-confidence match
      const best = matches[0];
      updated.selectedTerminologyMatch = best;
      updated.genericName = best.genericName;
      if (best.activeIngredients && best.activeIngredients.length > 0) {
        updated.activeIngredients = best.activeIngredients;
      }
      if (best.saltForm && !updated.salt) {
        updated.salt = best.saltForm;
      }
    }

    // 3. Duplicate Active Ingredient Detection against Patient's Existing Regimen
    const duplicateWarnings: string[] = [];
    const candidateIngNames = (updated.activeIngredients || []).map((i) =>
      normalizeIngredientName(i.name)
    );
    if (updated.genericName) {
      candidateIngNames.push(normalizeIngredientName(updated.genericName));
    }

    for (const patientMed of existingPatientMeds) {
      const patientIngNames = (patientMed.activeIngredients || []).map((i) =>
        normalizeIngredientName(i.name)
      );
      if (patientMed.genericName) {
        patientIngNames.push(normalizeIngredientName(patientMed.genericName));
      }

      for (const candIng of candidateIngNames) {
        if (!candIng) continue;
        const hasMatch = patientIngNames.some(
          (patIng) => patIng === candIng || (patIng.length > 4 && candIng.includes(patIng))
        );

        if (hasMatch) {
          const warning = `Duplicate active ingredient "${candIng}" detected: Patient currently takes active order "${patientMed.brand} (${patientMed.genericName}) [${patientMed.prescribedDose}]". Co-prescribing creates cumulative overdose hazard.`;
          duplicateWarnings.push(warning);

          updated.ambiguities.push({
            id: randomUUID(),
            field: 'activeIngredients',
            issueType: 'duplicate_ingredient_risk',
            severity: 'critical',
            description: warning,
            candidates: [patientMed.brand, updated.brand],
          });
          break;
        }
      }
    }

    updated.duplicateIngredientWarnings = duplicateWarnings;

    return updated;
  }
}
