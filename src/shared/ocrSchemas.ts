import { z } from 'zod';
import {
  ActiveIngredientSchema,
  MedicationStatusSchema,
  VerificationStatusSchema,
} from './schemas.js';

export const ReconcileCandidateMedicationSchema = z.object({
  candidateId: z.string().optional(),
  documentId: z.string().optional(),
  patientId: z.string().trim().min(1, 'Valid patient ID is required'),
  brand: z.string().trim().min(1, 'Brand name is required'),
  genericName: z.string().trim().min(1, 'Generic name is required'),
  activeIngredients: z.array(ActiveIngredientSchema).min(1, 'At least one active ingredient is required'),
  salt: z.string().trim().min(1, 'Salt form is required (e.g. Besylate, Hydrochloride, or Unknown)'),
  strength: z.string().trim().min(1, 'Strength is required (e.g. 500 mg)'),
  formulation: z.string().trim().min(1, 'Formulation is required (e.g. Tablet)'),
  route: z.string().trim().min(1, 'Route is required (e.g. Oral)'),
  prescribedDose: z.string().trim().min(1, 'Prescribed dose is required (e.g. 1 tablet)'),
  frequency: z.string().trim().min(1, 'Frequency is required (e.g. Once daily)'),
  administrationInstructions: z.string().trim().min(1, 'Administration instructions are required'),
  prescriber: z.string().trim().min(1, 'Prescriber is required'),
  source: z.string().trim().min(1, 'Source reference is required'),
  status: MedicationStatusSchema.default('active'),
  verificationStatus: VerificationStatusSchema.default('unverified'),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Start date must be YYYY-MM-DD').nullable().optional().default(null),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'End date must be YYYY-MM-DD').nullable().optional().default(null),
  indication: z.string().nullable().optional().default(null),
  actor: z.string().trim().min(1, 'Reviewing clinician / actor is required for audit trail'),
  clinicalNotes: z.string().optional(),
  resolvedAmbiguities: z.array(z.string()).optional(),
});
