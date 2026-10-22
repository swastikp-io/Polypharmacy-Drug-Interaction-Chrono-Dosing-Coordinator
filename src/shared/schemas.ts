import { z } from 'zod';

export const VerificationStatusSchema = z.enum(['confirmed', 'unverified', 'unknown']);

export const MedicationStatusSchema = z.enum(['active', 'discontinued', 'held', 'prn']);

export const GenderSchema = z.enum(['male', 'female', 'other', 'unknown']);

export const AllergyTypeSchema = z.enum(['drug', 'food', 'environmental', 'other']);

export const AllergySeveritySchema = z.enum(['mild', 'moderate', 'severe', 'life-threatening', 'unknown']);

export const ClinicalStatusSchema = z.enum(['active', 'resolved', 'remission', 'unknown']);

export const LabCategorySchema = z.enum(['renal', 'hepatic', 'other']);

export const LabInterpretationSchema = z.enum(['normal', 'low', 'high', 'critical', 'unknown']);

export const ActiveIngredientSchema = z.object({
  name: z.string().trim().min(1, 'Active ingredient name is required'),
  strength: z.string().trim().optional().default(''),
});

export const PatientSchema = z.object({
  id: z.string().uuid(),
  mrn: z.string().trim().min(1, 'Medical Record Number (MRN) is required'),
  name: z.string().trim().min(1, 'Patient name is required'),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date of birth must be YYYY-MM-DD'),
  gender: GenderSchema,
  weightKg: z.number().positive('Weight must be positive').nullable().optional().default(null),
  heightCm: z.number().positive('Height must be positive').nullable().optional().default(null),
  primaryPhysician: z.string().trim().min(1, 'Primary physician is required'),
  careSetting: z.string().trim().min(1, 'Care setting is required'),
  emergencyContact: z.string().trim().min(1, 'Emergency contact is required'),
  notes: z.string().nullable().optional().default(null),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
});

export const CreatePatientSchema = PatientSchema.omit({ id: true, createdAt: true, updatedAt: true });
export const UpdatePatientSchema = CreatePatientSchema.partial();

export const MedicationSchema = z.object({
  id: z.string().trim().min(1),
  patientId: z.string().trim().min(1, 'Valid patient ID is required'),
  brand: z.string().trim().min(1, 'Brand name is required (use generic if unbranded)'),
  genericName: z.string().trim().min(1, 'Generic name is required'),
  activeIngredients: z.array(ActiveIngredientSchema).min(1, 'At least one active ingredient is required'),
  salt: z.string().trim().min(1, 'Salt form is required (e.g. Besylate, Sodium, or Unknown)'),
  strength: z.string().trim().min(1, 'Strength is required (e.g. 500 mg)'),
  formulation: z.string().trim().min(1, 'Formulation is required (e.g. Tablet, Capsule)'),
  route: z.string().trim().min(1, 'Route is required (e.g. Oral, Inhalation)'),
  prescribedDose: z.string().trim().min(1, 'Prescribed dose is required'),
  frequency: z.string().trim().min(1, 'Frequency is required (e.g. Once daily)'),
  administrationInstructions: z.string().trim().min(1, 'Administration instructions are required'),
  prescriber: z.string().trim().min(1, 'Prescriber is required (or "Unknown")'),
  source: z.string().trim().min(1, 'Source is required (e.g. Discharge Summary, Patient Report)'),
  status: MedicationStatusSchema.default('active'),
  verificationStatus: VerificationStatusSchema.default('unverified'),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Start date must be YYYY-MM-DD').nullable().optional().default(null),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'End date must be YYYY-MM-DD').nullable().optional().default(null),
  indication: z.string().nullable().optional().default(null),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
});

export const CreateMedicationSchema = MedicationSchema.omit({ id: true, createdAt: true, updatedAt: true });
export const UpdateMedicationSchema = CreateMedicationSchema.partial();

export const AllergySchema = z.object({
  id: z.string().trim().min(1),
  patientId: z.string().trim().min(1, 'Valid patient ID is required'),
  allergen: z.string().trim().min(1, 'Allergen name is required'),
  allergenType: AllergyTypeSchema.default('drug'),
  reaction: z.string().trim().min(1, 'Reaction description is required'),
  severity: AllergySeveritySchema.default('moderate'),
  verificationStatus: VerificationStatusSchema.default('unverified'),
  dateRecorded: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date recorded must be YYYY-MM-DD'),
  source: z.string().trim().min(1, 'Source is required'),
  notes: z.string().nullable().optional().default(null),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
});

export const CreateAllergySchema = AllergySchema.omit({ id: true, createdAt: true, updatedAt: true });
export const UpdateAllergySchema = CreateAllergySchema.partial();

export const DiagnosisSchema = z.object({
  id: z.string().trim().min(1),
  patientId: z.string().trim().min(1, 'Valid patient ID is required'),
  condition: z.string().trim().min(1, 'Condition description is required'),
  code: z.string().trim().min(1, 'Diagnostic code is required (e.g. ICD-10 or Unknown)'),
  clinicalStatus: ClinicalStatusSchema.default('active'),
  verificationStatus: VerificationStatusSchema.default('unverified'),
  onsetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Onset date must be YYYY-MM-DD').nullable().optional().default(null),
  dateRecorded: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date recorded must be YYYY-MM-DD'),
  source: z.string().trim().min(1, 'Source is required'),
  notes: z.string().nullable().optional().default(null),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
});

export const CreateDiagnosisSchema = DiagnosisSchema.omit({ id: true, createdAt: true, updatedAt: true });
export const UpdateDiagnosisSchema = CreateDiagnosisSchema.partial();

export const LabMeasurementSchema = z.object({
  id: z.string().trim().min(1),
  patientId: z.string().trim().min(1, 'Valid patient ID is required'),
  testName: z.string().trim().min(1, 'Test name is required'),
  category: LabCategorySchema.default('renal'),
  value: z.number({ invalid_type_error: 'Measurement value must be a number' }),
  unit: z.string().trim().min(1, 'Unit is required (e.g. mg/dL, mL/min/1.73m²)'),
  referenceRange: z.string().trim().min(1, 'Reference range is required'),
  interpretation: LabInterpretationSchema.default('normal'),
  collectionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Collection date must be YYYY-MM-DD'),
  verificationStatus: VerificationStatusSchema.default('unverified'),
  source: z.string().trim().min(1, 'Source is required (e.g. Outpatient Lab, Discharge Panel)'),
  notes: z.string().nullable().optional().default(null),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
});

export const CreateLabMeasurementSchema = LabMeasurementSchema.omit({ id: true, createdAt: true, updatedAt: true });
export const UpdateLabMeasurementSchema = CreateLabMeasurementSchema.partial();

export const StatusUpdateSchema = z.object({
  verificationStatus: VerificationStatusSchema,
  actor: z.string().trim().min(1, 'Actor name is required for audit trail'),
  reason: z.string().trim().optional(),
});
