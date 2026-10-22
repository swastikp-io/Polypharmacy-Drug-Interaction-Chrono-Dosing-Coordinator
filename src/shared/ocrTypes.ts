import type { ActiveIngredient, MedicationStatus, VerificationStatus } from './types.js';
export type { ActiveIngredient, MedicationStatus, VerificationStatus };

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface OCRTextLine {
  text: string;
  confidence: number; // 0.0 - 1.0
  pageNumber: number;
  lineIndex: number;
  boundingBox?: BoundingBox;
}

export interface OCRPageResult {
  pageNumber: number;
  lines: OCRTextLine[];
  fullText: string;
  confidence: number;
}

export interface OCRDocumentResult {
  documentId: string;
  fileName: string;
  fileType: string;
  fileSizeBytes: number;
  pageCount: number;
  pages: OCRPageResult[];
  rawText: string;
  overallConfidence: number;
  extractedAt: string;
  engineName: string;
  isLocal: boolean;
  warnings: string[];
}

export interface FieldConfidence {
  brand: number;
  genericName: number;
  activeIngredients: number;
  salt: number;
  strength: number;
  dosageForm: number;
  route: number;
  frequency: number;
  instructions: number;
  overall: number;
}

export type AmbiguityType =
  | 'missing_dose'
  | 'missing_unit'
  | 'unreadable_text'
  | 'look_alike_sound_alike'
  | 'uncertain_formulation'
  | 'multiple_terminology_matches'
  | 'duplicate_ingredient_risk'
  | 'incomplete_sig';

export interface AmbiguityIssue {
  id: string;
  field: string;
  issueType: AmbiguityType;
  severity: 'critical' | 'warning' | 'info';
  description: string;
  candidates?: string[];
}

export interface TerminologyMatch {
  conceptId: string; // e.g. RxNorm CUI or Synthetic Clinical Code
  term: string;
  brandName?: string;
  genericName: string;
  activeIngredients: ActiveIngredient[];
  saltForm: string | null;
  standardStrength: string;
  dosageForm: string;
  matchScore: number; // 0.0 - 1.0
  matchType: 'exact' | 'alias' | 'brand_to_generic' | 'approximate' | 'ambiguous';
  isLASAHazard?: boolean; // Look-Alike Sound-Alike hazard
  lasaAlternatives?: string[];
}

export interface CandidateMedication {
  id: string;
  documentId: string;
  pageNumber: number;
  sourceLineIndex: number;
  sourceSnippet: string;
  boundingBox?: BoundingBox;

  // Extracted pharmacological fields
  brand: string;
  genericName: string;
  activeIngredients: ActiveIngredient[];
  salt: string | null; // null if unidentifiable
  strength: string; // null / empty if unreadable
  dosageForm: string;
  releaseFormulation: string | null; // e.g. "Extended Release", "Immediate Release", or null
  route: string;
  prescribedDose: string;
  frequency: string;
  administrationInstructions: string;
  prescriber: string;
  source: string;

  // Confidence & Clinical Decision Support
  fieldConfidence: FieldConfidence;
  ambiguities: AmbiguityIssue[];
  terminologyMatches: TerminologyMatch[];
  selectedTerminologyMatch?: TerminologyMatch | null;
  duplicateIngredientWarnings: string[];

  // Reconciliation workflow
  reconciliationStatus: 'pending_review' | 'accepted' | 'rejected';
  reconciledMedicationStatus?: MedicationStatus;
  reconciledVerificationStatus?: VerificationStatus;
}

export interface OCRProcessingResponse {
  document: OCRDocumentResult;
  candidateMedications: CandidateMedication[];
  summary: {
    totalExtracted: number;
    highConfidenceCount: number;
    ambiguityCount: number;
    criticalIssueCount: number;
    duplicateIngredientCount: number;
  };
  processedAt: string;
  privacyNotice: string;
}

export interface IOCREngine {
  name: string;
  version: string;
  isLocal: boolean;
  processDocument(
    buffer: Buffer,
    fileName: string,
    mimeType: string
  ): Promise<OCRDocumentResult>;
}

export interface IDrugTerminologyProvider {
  name: string;
  version: string;
  search(query: string): Promise<TerminologyMatch[]>;
  lookupByConceptId(id: string): Promise<TerminologyMatch | null>;
  findLASAPairs(query: string): string[];
}
