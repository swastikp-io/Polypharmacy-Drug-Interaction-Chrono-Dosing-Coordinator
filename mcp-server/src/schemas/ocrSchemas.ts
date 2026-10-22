import { z } from 'zod';

export const ParsePrescriptionInputSchema = z.object({
  filePath: z
    .string()
    .min(1, 'filePath is required')
    .describe('Relative or safe absolute path to a local prescription image (.png, .jpg, .jpeg, .webp) or PDF document.'),
  patientId: z
    .string()
    .optional()
    .describe('Optional patient UUID to check extracted candidates against active patient medications for duplicate ingredients.'),
});

export type ParsePrescriptionInput = z.infer<typeof ParsePrescriptionInputSchema>;
