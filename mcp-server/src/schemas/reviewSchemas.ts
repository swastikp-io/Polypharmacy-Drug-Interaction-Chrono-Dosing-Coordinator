import { z } from 'zod';

export const GetReviewStatusInputSchema = z.object({
  patientId: z.string().min(1, 'patientId is required').describe('Unique patient identifier UUID.'),
});

export const GetPatientReviewReportInputSchema = z.object({
  patientId: z.string().min(1, 'patientId is required').describe('Unique patient identifier UUID.'),
  actor: z
    .string()
    .optional()
    .default('Claude MCP Clinician')
    .describe('Clinician or pharmacist initiating report generation.'),
});

export type GetReviewStatusInput = z.infer<typeof GetReviewStatusInputSchema>;
export type GetPatientReviewReportInput = z.infer<typeof GetPatientReviewReportInputSchema>;
