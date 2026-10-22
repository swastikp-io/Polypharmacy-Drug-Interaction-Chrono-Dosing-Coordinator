import { z } from 'zod';

export const GetPatientOverviewSchema = z.object({
  patientId: z.string().min(1, 'Patient ID is required'),
});

export const GetConfirmedMedicationsSchema = z.object({
  patientId: z.string().min(1, 'Patient ID is required'),
});

export const RunInteractionAnalysisSchema = z.object({
  patientId: z.string().min(1, 'Patient ID is required'),
  explain: z.boolean().optional().default(true),
});

export const GetCircadianTimetableSchema = z.object({
  patientId: z.string().min(1, 'Patient ID is required'),
});

export const GetConsolidatedReportSchema = z.object({
  patientId: z.string().min(1, 'Patient ID is required'),
});

export const ConfirmMedicationOrderSchema = z.object({
  patientId: z.string().optional(),
  medicationId: z.string().min(1, 'Medication ID is required'),
  actor: z.string().min(1, 'Clinician credentials are required'),
  justification: z.string().optional().default('Clinician confirmed medication identity'),
  confirmationToken: z.literal('CONFIRM_MUTATION', {
    errorMap: () => ({
      message:
        'Validation failed: Explicit confirmation token ("CONFIRM_MUTATION") is mandatory to execute clinical record mutation.',
    }),
  }),
});

export type GetPatientOverviewInput = z.infer<typeof GetPatientOverviewSchema>;
export type GetConfirmedMedicationsInput = z.infer<typeof GetConfirmedMedicationsSchema>;
export type RunInteractionAnalysisInput = z.infer<typeof RunInteractionAnalysisSchema>;
export type GetCircadianTimetableInput = z.infer<typeof GetCircadianTimetableSchema>;
export type GetConsolidatedReportInput = z.infer<typeof GetConsolidatedReportSchema>;
export type ConfirmMedicationOrderInput = z.infer<typeof ConfirmMedicationOrderSchema>;
