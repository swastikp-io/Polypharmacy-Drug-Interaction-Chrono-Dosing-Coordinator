import { z } from 'zod';

export const WorkflowRunOptionsSchema = z.object({
  patientId: z.string().min(1, 'Patient ID is required'),
  requireConfirmedOnly: z.boolean().optional().default(true),
  ocrDocumentId: z.string().optional(),
  timeoutMs: z.number().int().positive().optional().default(10000),
  actor: z.string().min(1, 'Actor / clinician identity is required').default('Clinical Pharmacist Orchestrator'),
});

export const WorkflowResumeRequestSchema = z.object({
  confirmedMedicationIds: z.array(z.string()).optional().default([]),
  actor: z.string().min(1, 'Actor identity is required').default('Clinical Pharmacist'),
  notes: z.string().optional(),
});

export type WorkflowRunOptionsInput = z.infer<typeof WorkflowRunOptionsSchema>;
export type WorkflowResumeRequestInput = z.infer<typeof WorkflowResumeRequestSchema>;
