import { z } from 'zod';

export const ProposeMedicationScheduleInputSchema = z.object({
  patientId: z.string().min(1, 'patientId is required').describe('Unique patient identifier UUID.'),
});

export type ProposeMedicationScheduleInput = z.infer<typeof ProposeMedicationScheduleInputSchema>;
