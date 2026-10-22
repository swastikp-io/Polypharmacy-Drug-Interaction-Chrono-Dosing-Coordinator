import type { ReviewCategory, ReviewerRole } from '../../../shared/orchestrationTypes.js';
import {
  UnauthorizedReviewerError,
  UnauthorizedReviewerRoleError,
} from './stateMachine/errors.js';

export const ROLE_PERMISSIONS: Record<ReviewCategory, readonly ReviewerRole[]> = {
  medication_identity_clarification: ['attending_physician', 'clinical_pharmacist'],
  missing_prescription_instructions: ['attending_physician', 'clinical_pharmacist'],
  potentially_significant_interaction: [
    'attending_physician',
    'clinical_pharmacist',
    'medical_director',
  ],
  insufficient_clinical_evidence: [
    'attending_physician',
    'clinical_pharmacist',
    'medical_director',
  ],
  conflicting_scheduling_constraints: [
    'attending_physician',
    'clinical_pharmacist',
    'registered_nurse',
  ],
  schedule_review: ['attending_physician', 'clinical_pharmacist'],
};

export class ReviewAuthorizationPolicy {
  /**
   * Asserts that reviewer identity represents a valid human and not an autonomous LLM or AI agent.
   */
  public static assertHumanReviewer(reviewerIdentity: string): void {
    if (!reviewerIdentity || reviewerIdentity.trim().length === 0) {
      throw new UnauthorizedReviewerError(
        reviewerIdentity,
        'Reviewer identity must not be empty.'
      );
    }

    const trimmed = reviewerIdentity.trim().toLowerCase();
    const prohibitedAiPatterns = [
      /(^|[\s_-])llm($|[\s_-])/i,
      /(^|[\s_-])ai($|[\s_-])/i,
      /(^|[\s_-])bot($|[\s_-])/i,
      /(^|[\s_-])agent($|[\s_-])/i,
      /(^|[\s_-])assistant($|[\s_-])/i,
      /(^|[\s_-])model($|[\s_-])/i,
      /(^|[\s_-])system($|[\s_-])/i,
      /(^|[\s_-])automated($|[\s_-])/i,
      /(^|[\s_-])orchestrator($|[\s_-])/i,
      /claude/i,
      /gpt/i,
      /chatgpt/i,
      /autonomous/i,
    ];

    for (const pattern of prohibitedAiPatterns) {
      if (pattern.test(trimmed)) {
        throw new UnauthorizedReviewerError(
          reviewerIdentity,
          'Autonomous LLM/AI actors are strictly prohibited from approving clinical reviews or impersonating licensed clinicians.'
        );
      }
    }
  }

  /**
   * Asserts that the reviewer role has permission to resolve the given review category.
   */
  public static assertRoleAuthorized(
    category: ReviewCategory,
    reviewerRole: ReviewerRole
  ): void {
    const permittedRoles = ROLE_PERMISSIONS[category];
    if (!permittedRoles || !permittedRoles.includes(reviewerRole)) {
      throw new UnauthorizedReviewerRoleError(
        reviewerRole,
        category,
        permittedRoles || []
      );
    }
  }

  public static isRoleAuthorized(
    category: ReviewCategory,
    reviewerRole: ReviewerRole
  ): boolean {
    const permittedRoles = ROLE_PERMISSIONS[category];
    return !!permittedRoles && permittedRoles.includes(reviewerRole);
  }
}
