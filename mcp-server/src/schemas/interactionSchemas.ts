import { z } from 'zod';

export const GetInteractionReportInputSchema = z.object({
  patientId: z.string().min(1, 'patientId is required').describe('Unique patient identifier UUID.'),
});

export const GetClinicalEvidenceInputSchema = z.object({
  findingId: z
    .string()
    .optional()
    .describe('Specific interaction finding identifier (e.g., finding-apixaban-metoprolol).'),
  ingredientPair: z
    .tuple([z.string().min(1), z.string().min(1)])
    .optional()
    .describe('Two pharmacological active ingredient names to lookup evidence for (e.g., ["apixaban", "fluconazole"]).'),
}).refine(
  (data) => Boolean(data.findingId || data.ingredientPair),
  { message: 'Either findingId or ingredientPair must be provided.' }
);

export type GetInteractionReportInput = z.infer<typeof GetInteractionReportInputSchema>;
export type GetClinicalEvidenceInput = z.infer<typeof GetClinicalEvidenceInputSchema>;
