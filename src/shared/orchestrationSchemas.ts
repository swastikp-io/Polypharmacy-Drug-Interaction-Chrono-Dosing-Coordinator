import { z } from 'zod';

export const AgenticWorkflowStateSchema = z.enum([
  'CREATED',
  'RETRIEVING_PATIENT_CONTEXT',
  'AWAITING_PRESCRIPTION',
  'EXTRACTING_PRESCRIPTION',
  'AWAITING_MEDICATION_CONFIRMATION',
  'MEDICATIONS_CONFIRMED',
  'CHECKING_INTERACTIONS',
  'AWAITING_CLINICAL_REVIEW',
  'PREPARING_SCHEDULE',
  'AWAITING_SCHEDULE_REVIEW',
  'COMPLETED',
  'BLOCKED',
  'FAILED',
  'CANCELLED',
]);

export const ReviewCategorySchema = z.enum([
  'medication_identity_clarification',
  'missing_prescription_instructions',
  'potentially_significant_interaction',
  'insufficient_clinical_evidence',
  'conflicting_scheduling_constraints',
  'schedule_review',
]);

export const ReviewStatusSchema = z.enum([
  'pending',
  'approved',
  'rejected',
  'modified',
  'invalidated',
]);

export const ReviewerRoleSchema = z.enum([
  'attending_physician',
  'clinical_pharmacist',
  'registered_nurse',
  'medical_director',
]);

export const ReviewResolutionSchema = z.object({
  status: z.enum(['approved', 'rejected', 'modified']),
  reviewerIdentity: z.string().min(1, 'Reviewer identity is required'),
  reviewerRole: ReviewerRoleSchema.optional().default('clinical_pharmacist'),
  reviewerNotes: z.string().optional(),
  targetVersion: z.number().int().positive('Target version must be a positive integer'),
});

export const ApprovalRecordSchema = z.object({
  approvalId: z.string().min(1),
  workflowId: z.string().min(1),
  reviewRequestId: z.string().min(1),
  category: ReviewCategorySchema,
  targetEntityType: z.string().min(1),
  targetEntityId: z.string().min(1),
  targetArtifactType: z.string().min(1),
  targetArtifactVersion: z.number().int().nonnegative(),
  reviewerIdentity: z.string().min(1),
  reviewerRole: ReviewerRoleSchema,
  decision: z.enum(['approved', 'rejected', 'modified']),
  rationale: z.string(),
  decidedAt: z.string(),
  validUntilStale: z.boolean().default(true),
  supersededBy: z.string().optional(),
});

export const AgenticWorkflowCreateInputSchema = z.object({
  patientId: z.string().min(1, 'Patient ID is required'),
  prescriptionDocumentId: z.string().optional(),
  requireExplicitConfirmation: z.boolean().optional().default(true),
  actor: z.string().min(1, 'Actor identity is required').default('Clinical Pharmacist Coordinator'),
});

export const AgenticWorkflowAdvanceInputSchema = z.object({
  workflowId: z.string().min(1, 'Workflow ID is required'),
  actor: z.string().min(1, 'Actor identity is required'),
  targetState: AgenticWorkflowStateSchema.optional(),
  reason: z.string().optional(),
});

export const MedicationCorrectionInputSchema = z.object({
  medicationId: z.string().min(1, 'Medication ID is required'),
  brand: z.string().optional(),
  genericName: z.string().optional(),
  prescribedDose: z.string().optional(),
  frequency: z.string().optional(),
  administrationInstructions: z.string().optional(),
  verificationStatus: z.enum(['unverified', 'pending_review', 'confirmed', 'discontinued']).optional(),
  actor: z.string().min(1, 'Actor / clinician identity is required'),
  justification: z.string().min(1, 'Clinical justification is required'),
});

export const ToolExecutionRequestSchema = z.object({
  name: z.string().min(1, 'Tool name is required'),
  arguments: z.record(z.any()).default({}),
  actor: z.string().optional().default('Clinical Assistant'),
  actorRole: z.enum(['clinician', 'pharmacist', 'nurse', 'assistant', 'system', 'admin']).optional().default('assistant'),
  confirmationToken: z.string().optional(),
});

// Backward compatibility schemas
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

export type AgenticWorkflowCreateInput = z.infer<typeof AgenticWorkflowCreateInputSchema>;
export type AgenticWorkflowAdvanceInput = z.infer<typeof AgenticWorkflowAdvanceInputSchema>;
export type ReviewResolutionInput = z.infer<typeof ReviewResolutionSchema>;
export type ApprovalRecordInput = z.infer<typeof ApprovalRecordSchema>;
export type ReviewerRoleInput = z.infer<typeof ReviewerRoleSchema>;
export type ToolExecutionRequestInput = z.infer<typeof ToolExecutionRequestSchema>;
export type MedicationCorrectionInput = z.infer<typeof MedicationCorrectionInputSchema>;
export type WorkflowRunOptionsInput = z.infer<typeof WorkflowRunOptionsSchema>;
export type WorkflowResumeRequestInput = z.infer<typeof WorkflowResumeRequestSchema>;
