import { z } from 'zod';

export const ConfirmMedicationInputSchema = z.object({
  medicationId: z.string().min(1, 'medicationId is required').describe('ID of the medication order to verify as clinical truth.'),
  actor: z.string().min(1, 'actor credentials are required').describe('Authoritative clinician or pharmacist verifying the order.'),
  confirmationToken: z
    .literal('CONFIRM_MUTATION', {
      errorMap: () => ({
        message: 'Explicit confirmation token "CONFIRM_MUTATION" is required to confirm medication orders.',
      }),
    })
    .describe('Security guard token ("CONFIRM_MUTATION") confirming human clinical review.'),
  justification: z
    .string()
    .min(5, 'Clinical justification must be at least 5 characters')
    .optional()
    .default('Clinician confirmed identity against official medical records')
    .describe('Clinical justification documenting provenance.'),
});

export type ConfirmMedicationInput = z.infer<typeof ConfirmMedicationInputSchema>;
