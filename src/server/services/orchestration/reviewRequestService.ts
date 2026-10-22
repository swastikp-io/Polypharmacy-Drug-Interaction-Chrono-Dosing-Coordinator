import { randomUUID } from 'crypto';
import type { ReviewRequestRepository } from '../../repositories/reviewRequestRepository.js';
import type { ApprovalRecordRepository } from '../../repositories/approvalRecordRepository.js';
import type {
  ApprovalRecord,
  ReviewCategory,
  ReviewRequest,
  ReviewResolution,
  ReviewStatus,
  ReviewerRole,
  WorkflowArtifactType,
} from '../../../shared/orchestrationTypes.js';
import {
  ApprovalVersionMismatchError,
  UnauthorizedReviewerError,
} from './stateMachine/errors.js';
import { ReviewAuthorizationPolicy } from './reviewAuthorizationPolicy.js';
import type { AuditService } from '../auditService.js';

export class ReviewRequestService {
  constructor(
    private reviewRepo: ReviewRequestRepository,
    private auditService?: AuditService,
    private approvalRepo?: ApprovalRecordRepository
  ) {}

  public getApprovalRepository(): ApprovalRecordRepository | undefined {
    return this.approvalRepo;
  }

  public setApprovalRepository(repo: ApprovalRecordRepository): void {
    this.approvalRepo = repo;
  }

  public createRequest(
    data: Omit<ReviewRequest, 'id' | 'status' | 'createdAt' | 'resolvedAt'>
  ): ReviewRequest {
    const request: ReviewRequest = {
      id: `rev-${randomUUID()}`,
      workflowId: data.workflowId,
      category: data.category,
      reason: data.reason,
      supportingEvidenceReferences: data.supportingEvidenceReferences || [],
      missingOrConflictingInfo: data.missingOrConflictingInfo,
      requestedReviewerAction: data.requestedReviewerAction,
      status: 'pending',
      itemVersion: data.itemVersion,
      targetEntityType: data.targetEntityType,
      targetEntityId: data.targetEntityId,
      targetArtifactType:
        data.targetArtifactType ||
        this.inferArtifactType(data.targetEntityType, data.category),
      targetArtifactVersion:
        data.targetArtifactVersion !== undefined
          ? data.targetArtifactVersion
          : data.itemVersion,
      createdAt: new Date().toISOString(),
    };

    this.reviewRepo.create(request);
    return request;
  }

  public getRequest(id: string): ReviewRequest | null {
    return this.reviewRepo.findById(id);
  }

  public listPending(workflowId: string): ReviewRequest[] {
    return this.reviewRepo.findPendingByWorkflowId(workflowId);
  }

  public listAll(workflowId: string): ReviewRequest[] {
    return this.reviewRepo.findByWorkflowId(workflowId);
  }

  public listAllPending(): ReviewRequest[] {
    return this.reviewRepo.findPendingAll();
  }

  public getApprovalsForWorkflow(workflowId: string): ApprovalRecord[] {
    if (this.approvalRepo) {
      return this.approvalRepo.findByWorkflowId(workflowId);
    }
    return [];
  }

  public resolveRequest(
    reviewId: string,
    resolution: ReviewResolution,
    currentItemVersion: number
  ): { request: ReviewRequest; approvalRecord: ApprovalRecord } {
    const request = this.reviewRepo.findById(reviewId);
    if (!request) {
      throw new Error(`Review request "${reviewId}" not found.`);
    }

    if (request.status !== 'pending') {
      throw new Error(
        `Review request "${reviewId}" is already resolved with status "${request.status}".`
      );
    }

    // 1. Guard against AI/LLM Impersonation (Rule 4)
    ReviewAuthorizationPolicy.assertHumanReviewer(resolution.reviewerIdentity);

    // 2. Guard against Role Authorization (Rule 7)
    const reviewerRole: ReviewerRole = resolution.reviewerRole || 'clinical_pharmacist';
    ReviewAuthorizationPolicy.assertRoleAuthorized(request.category, reviewerRole);

    // 3. Guard against Stale Approvals (Item version verification)
    if (resolution.targetVersion !== currentItemVersion) {
      throw new ApprovalVersionMismatchError(
        request.targetEntityId,
        request.targetEntityType,
        resolution.targetVersion,
        currentItemVersion
      );
    }

    // 4. Mark resolution
    request.status = resolution.status;
    request.reviewerIdentity = resolution.reviewerIdentity;
    request.reviewerRole = reviewerRole;
    request.reviewerNotes = resolution.reviewerNotes;
    request.resolvedAt = new Date().toISOString();

    this.reviewRepo.update(request);

    // 5. Create explicit ApprovalRecord (Rule 6: separate from workflow completion)
    const targetArtifactType =
      request.targetArtifactType ||
      this.inferArtifactType(request.targetEntityType, request.category);
    const targetArtifactVersion =
      request.targetArtifactVersion !== undefined
        ? request.targetArtifactVersion
        : currentItemVersion;

    const approvalRecord: ApprovalRecord = {
      approvalId: `app-${randomUUID()}`,
      workflowId: request.workflowId,
      reviewRequestId: request.id,
      category: request.category,
      targetEntityType: request.targetEntityType,
      targetEntityId: request.targetEntityId,
      targetArtifactType,
      targetArtifactVersion,
      reviewerIdentity: resolution.reviewerIdentity,
      reviewerRole,
      decision: resolution.status,
      rationale:
        resolution.reviewerNotes ||
        `Review resolved with status ${resolution.status} by ${resolution.reviewerIdentity} (${reviewerRole}).`,
      decidedAt: request.resolvedAt,
      validUntilStale: true,
    };

    if (this.approvalRepo) {
      this.approvalRepo.create(approvalRecord);
    }

    if (this.auditService) {
      this.auditService.logEvent({
        patientId: 'workflow-review',
        entityType: 'review_request',
        entityId: request.id,
        action: `REVIEW_${resolution.status.toUpperCase()}`,
        actor: resolution.reviewerIdentity,
        summary: `Review [${request.category}] ${resolution.status} for ${request.targetEntityType} ${request.targetEntityId} by ${resolution.reviewerIdentity} (${reviewerRole}).`,
        changedFields: {
          status: resolution.status,
          targetVersion: resolution.targetVersion,
          reviewerRole,
          notes: resolution.reviewerNotes || null,
          approvalId: approvalRecord.approvalId,
        },
      });
    }

    return { request, approvalRecord };
  }

  public invalidateApprovalsForEntity(
    workflowId: string,
    targetEntityType: string,
    targetEntityId: string,
    invalidationReason: string
  ): ReviewRequest[] {
    const requests = this.reviewRepo.findByTargetEntity(
      targetEntityType,
      targetEntityId
    );
    const invalidated: ReviewRequest[] = [];

    for (const req of requests) {
      if (req.workflowId === workflowId && req.status === 'approved') {
        req.status = 'invalidated';
        req.reviewerNotes = `${
          req.reviewerNotes ? req.reviewerNotes + ' | ' : ''
        }[INVALIDATED]: ${invalidationReason}`;
        req.resolvedAt = new Date().toISOString();

        this.reviewRepo.update(req);
        invalidated.push(req);

        if (this.auditService) {
          this.auditService.logEvent({
            patientId: 'workflow-review',
            entityType: 'review_request',
            entityId: req.id,
            action: 'REVIEW_APPROVAL_INVALIDATED',
            actor: 'FeedbackEngine',
            summary: `Approval on ${targetEntityType} ${targetEntityId} invalidated: ${invalidationReason}`,
            changedFields: {
              status: 'invalidated',
              reason: invalidationReason,
            },
          });
        }
      }
    }

    return invalidated;
  }

  public invalidateApprovalsForArtifact(
    workflowId: string,
    artifactType: WorkflowArtifactType,
    reason: string
  ): void {
    if (this.approvalRepo) {
      this.approvalRepo.invalidateApprovalsForArtifact(workflowId, artifactType, reason);
    }
  }

  public inferArtifactType(
    targetEntityType: string,
    category: ReviewCategory
  ): WorkflowArtifactType {
    if (
      targetEntityType === 'ocr_candidate' ||
      category === 'medication_identity_clarification' ||
      category === 'missing_prescription_instructions'
    ) {
      return 'confirmed_medications';
    }
    if (
      targetEntityType === 'interaction' ||
      category === 'potentially_significant_interaction' ||
      category === 'insufficient_clinical_evidence'
    ) {
      return 'interaction_findings';
    }
    if (category === 'conflicting_scheduling_constraints') {
      return 'scheduling_constraints';
    }
    if (targetEntityType === 'schedule' || category === 'schedule_review') {
      return 'draft_schedule';
    }
    return 'human_approval';
  }
}
