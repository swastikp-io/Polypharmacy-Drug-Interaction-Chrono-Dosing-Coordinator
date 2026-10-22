import { z } from 'zod';

const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;

export const PatientRoutineSchema = z.object({
  patientId: z.string().min(1, 'Patient ID is required'),
  wakeTime: z.string().regex(timeRegex, 'Wake time must be in HH:mm 24-hour format'),
  breakfastTime: z.string().regex(timeRegex, 'Breakfast time must be in HH:mm 24-hour format'),
  lunchTime: z.string().regex(timeRegex, 'Lunch time must be in HH:mm 24-hour format'),
  dinnerTime: z.string().regex(timeRegex, 'Dinner time must be in HH:mm 24-hour format'),
  bedTime: z.string().regex(timeRegex, 'Bed time must be in HH:mm 24-hour format'),
  notes: z.string().optional(),
});

export const ScheduleReviewSubmissionSchema = z.object({
  decision: z.enum(['accepted', 'rejected', 'modified']),
  actor: z.string().min(1, 'Reviewer identity is required'),
  rationale: z.string().min(1, 'Review rationale or clinical justification is required'),
  clinicianNotes: z.string().optional().default(''),
  modifiedSlots: z.array(z.any()).optional(),
});

export type PatientRoutineInput = z.infer<typeof PatientRoutineSchema>;
export type ScheduleReviewSubmissionInput = z.infer<typeof ScheduleReviewSubmissionSchema>;
