export type VerificationStatus = 'confirmed' | 'unverified' | 'unknown';

export type MedicationStatus = 'active' | 'discontinued' | 'held' | 'prn';

export type Gender = 'male' | 'female' | 'other' | 'unknown';

export type AllergyType = 'drug' | 'food' | 'environmental' | 'other';

export type AllergySeverity = 'mild' | 'moderate' | 'severe' | 'life-threatening' | 'unknown';

export type ClinicalStatus = 'active' | 'resolved' | 'remission' | 'unknown';

export type LabCategory = 'renal' | 'hepatic' | 'other';

export type LabInterpretation = 'normal' | 'low' | 'high' | 'critical' | 'unknown';

export type EntityType = 'patient' | 'medication' | 'allergy' | 'diagnosis' | 'lab_measurement';

export type AuditAction = 'CREATE' | 'UPDATE' | 'DELETE' | 'STATUS_CHANGE' | 'PURGE';

export interface ActiveIngredient {
  name: string;
  strength?: string;
}

export interface Patient {
  id: string;
  mrn: string;
  name: string;
  dateOfBirth: string; // YYYY-MM-DD
  gender: Gender;
  weightKg: number | null;
  heightCm: number | null;
  primaryPhysician: string;
  careSetting: string;
  emergencyContact: string;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Medication {
  id: string;
  patientId: string;
  brand: string;
  genericName: string;
  activeIngredients: ActiveIngredient[];
  salt: string; // e.g. Besylate, Hydrochloride, Sodium, or Unknown
  strength: string; // e.g. 500 mg, 5 mg / 325 mg
  formulation: string; // Tablet, Capsule, Solution, Patch, Inhaler, etc.
  route: string; // Oral, Topical, Subcutaneous, Inhalation, etc.
  prescribedDose: string; // 1 tablet (500 mg)
  frequency: string; // Daily, BID, Q6H PRN
  administrationInstructions: string; // Take with morning meal and 8oz water
  prescriber: string; // Dr. Jane Smith, MD
  source: string; // Discharge Summary, Pharmacy Fill, Patient Report
  status: MedicationStatus;
  verificationStatus: VerificationStatus;
  startDate: string | null;
  endDate: string | null;
  indication: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Allergy {
  id: string;
  patientId: string;
  allergen: string;
  allergenType: AllergyType;
  reaction: string;
  severity: AllergySeverity;
  verificationStatus: VerificationStatus;
  dateRecorded: string;
  source: string;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Diagnosis {
  id: string;
  patientId: string;
  condition: string;
  code: string; // ICD-10 or SNOMED
  clinicalStatus: ClinicalStatus;
  verificationStatus: VerificationStatus;
  onsetDate: string | null;
  dateRecorded: string;
  source: string;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LabMeasurement {
  id: string;
  patientId: string;
  testName: string; // e.g. eGFR, Serum Creatinine, ALT, AST, Total Bilirubin
  category: LabCategory;
  value: number;
  unit: string;
  referenceRange: string;
  interpretation: LabInterpretation;
  collectionDate: string;
  verificationStatus: VerificationStatus;
  source: string;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AuditLog {
  id: string;
  patientId: string;
  entityType: EntityType;
  entityId: string;
  action: AuditAction;
  timestamp: string;
  actor: string;
  summary: string;
  previousState: string | null; // JSON string
  newState: string | null; // JSON string
  changedFields: string[]; // List of modified field names
}

export interface DuplicateIngredientGroup {
  ingredientName: string;
  normalizedName: string;
  medications: Array<{
    id: string;
    brand: string;
    genericName: string;
    strength: string;
    prescribedDose: string;
    frequency: string;
    status: MedicationStatus;
    verificationStatus: VerificationStatus;
    source: string;
  }>;
  totalMedicationCount: number;
  severity: 'high' | 'moderate' | 'low';
  clinicalRationale: string;
}

export interface PatientComprehensiveProfile {
  patient: Patient;
  medications: Medication[];
  allergies: Allergy[];
  diagnoses: Diagnosis[];
  labMeasurements: LabMeasurement[];
  auditLogs: AuditLog[];
  duplicateIngredients: DuplicateIngredientGroup[];
}
