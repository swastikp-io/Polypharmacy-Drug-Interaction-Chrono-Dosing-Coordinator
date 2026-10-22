import { z } from 'zod';

export const ListPatientsInputSchema = z.object({
  search: z.string().optional().describe('Optional name, MRN, or care setting search filter.'),
});

export const GetPatientMedicationsInputSchema = z.object({
  patientId: z.string().min(1, 'patientId is required').describe('Unique patient identifier UUID.'),
  confirmedOnly: z
    .boolean()
    .optional()
    .default(true)
    .describe('Whether to restrict returned medications to confirmed records only (default: true).'),
});

export type ListPatientsInput = z.infer<typeof ListPatientsInputSchema>;
export type GetPatientMedicationsInput = z.infer<typeof GetPatientMedicationsInputSchema>;
