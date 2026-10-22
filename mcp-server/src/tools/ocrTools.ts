import fs from 'fs';
import path from 'path';
import type { ClinicalEngineService } from '../services/clinicalEngineService.js';
import {
  ParsePrescriptionInputSchema,
  type ParsePrescriptionInput,
} from '../schemas/ocrSchemas.js';

export async function handleParsePrescription(
  rawArgs: unknown,
  engine: ClinicalEngineService
) {
  const args = ParsePrescriptionInputSchema.parse(rawArgs);

  // 1. Strict Path Traversal Prevention
  const resolvedPath = path.isAbsolute(args.filePath)
    ? args.filePath
    : path.resolve(engine.repositoryRoot, args.filePath);

  const safePath = engine.validateSafePath(resolvedPath);

  if (!fs.existsSync(safePath)) {
    throw new Error(`Prescription file not found at path "${safePath}".`);
  }

  // 2. Allowed Format Validation
  const ext = path.extname(safePath).toLowerCase();
  const allowedExtensions: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.pdf': 'application/pdf',
  };

  const mimeType = allowedExtensions[ext];
  if (!mimeType) {
    throw new Error(
      `Unsupported file format "${ext}". Allowed prescription formats: PNG, JPEG, WEBP, and PDF.`
    );
  }

  // 3. Process Document through OCR Engine & Normalization Layer
  const fileBuffer = fs.readFileSync(safePath);
  const fileName = path.basename(safePath);

  const rawOcr = await engine.ocrEngine.processDocument(fileBuffer, fileName, mimeType);
  const normalized = await engine.ocrNormalizationService.processAndNormalize(
    rawOcr,
    args.patientId
  );

  return {
    documentId: rawOcr.documentId,
    originalFileName: fileName,
    pageCount: rawOcr.pageCount,
    candidateMedications: normalized.candidateMedications.map((c) => ({
      candidateId: c.id,
      brand: c.brand,
      genericName: c.genericName,
      confidence: c.fieldConfidence?.overall ?? 0.8,
      ambiguities: c.ambiguities.map((a) => a.description),
      lasaWarning: c.selectedTerminologyMatch?.isLASAHazard
        ? `LASA Hazard: ${c.selectedTerminologyMatch.lasaAlternatives?.join(', ')}`
        : undefined,
      prescribedDose: c.prescribedDose,
      frequency: c.frequency,
      route: c.route,
      releaseFormulation: c.releaseFormulation,
      reconciliationStatus: c.reconciliationStatus,
    })),
    extractionSummary: {
      totalExtracted: normalized.summary.totalExtracted,
      highConfidenceCount: normalized.summary.highConfidenceCount,
      ambiguityCount: normalized.summary.ambiguityCount,
    },
    safetyCaveat:
      'CANDIDATE RECORDS ONLY - Explicit clinician confirmation required before saving to patient record. Never treat OCR extraction as verified clinical truth.',
  };
}
