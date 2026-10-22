import type Database from 'better-sqlite3';
import type {
  ApprovalRecord,
  ReviewCategory,
  ReviewerRole,
  WorkflowArtifactType,
} from '../../shared/orchestrationTypes.js';

export interface ApprovalRecordDbRow {
  id: string;
  workflow_id: string;
  review_request_id: string;
  category: string;
  target_entity_type: string;
  target_entity_id: string;
  target_artifact_type: string;
  target_artifact_version: number;
  reviewer_identity: string;
  reviewer_role: string;
  decision: string;
  rationale: string;
  decided_at: string;
  valid_until_stale: number;
  superseded_by: string | null;
  created_at: string;
}

export class ApprovalRecordRepository {
  constructor(private db: Database.Database) {}

  public create(record: ApprovalRecord): void {
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      INSERT INTO approval_records (
        id,
        workflow_id,
        review_request_id,
        category,
        target_entity_type,
        target_entity_id,
        target_artifact_type,
        target_artifact_version,
        reviewer_identity,
        reviewer_role,
        decision,
        rationale,
        decided_at,
        valid_until_stale,
        superseded_by,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      record.approvalId,
      record.workflowId,
      record.reviewRequestId,
      record.category,
      record.targetEntityType,
      record.targetEntityId,
      record.targetArtifactType,
      record.targetArtifactVersion,
      record.reviewerIdentity,
      record.reviewerRole,
      record.decision,
      record.rationale,
      record.decidedAt,
      record.validUntilStale ? 1 : 0,
      record.supersededBy || null,
      now
    );
  }

  public findById(id: string): ApprovalRecord | null {
    const row = this.db
      .prepare('SELECT * FROM approval_records WHERE id = ?')
      .get(id) as ApprovalRecordDbRow | undefined;

    return row ? this.mapRow(row) : null;
  }

  public findByWorkflowId(workflowId: string): ApprovalRecord[] {
    const rows = this.db
      .prepare('SELECT * FROM approval_records WHERE workflow_id = ? ORDER BY decided_at ASC')
      .all(workflowId) as ApprovalRecordDbRow[];

    return rows.map((r) => this.mapRow(r));
  }

  public findActiveByWorkflowId(workflowId: string): ApprovalRecord[] {
    const rows = this.db
      .prepare(
        'SELECT * FROM approval_records WHERE workflow_id = ? AND valid_until_stale = 1 AND decision = ? ORDER BY decided_at ASC'
      )
      .all(workflowId, 'approved') as ApprovalRecordDbRow[];

    return rows.map((r) => this.mapRow(r));
  }

  public findByReviewRequestId(reviewRequestId: string): ApprovalRecord[] {
    const rows = this.db
      .prepare('SELECT * FROM approval_records WHERE review_request_id = ? ORDER BY decided_at ASC')
      .all(reviewRequestId) as ApprovalRecordDbRow[];

    return rows.map((r) => this.mapRow(r));
  }

  public invalidateApprovalsForArtifact(
    workflowId: string,
    artifactType: WorkflowArtifactType,
    supersededReason?: string
  ): number {
    const stmt = this.db.prepare(`
      UPDATE approval_records
      SET valid_until_stale = 0,
          superseded_by = ?
      WHERE workflow_id = ?
        AND target_artifact_type = ?
        AND valid_until_stale = 1
    `);

    const result = stmt.run(
      supersededReason || `Invalidated: artifact "${artifactType}" became stale`,
      workflowId,
      artifactType
    );

    return result.changes;
  }

  public invalidateAllForWorkflow(workflowId: string, reason?: string): number {
    const stmt = this.db.prepare(`
      UPDATE approval_records
      SET valid_until_stale = 0,
          superseded_by = ?
      WHERE workflow_id = ?
        AND valid_until_stale = 1
    `);

    const result = stmt.run(reason || 'Invalidated all approvals for workflow', workflowId);
    return result.changes;
  }

  private mapRow(row: ApprovalRecordDbRow): ApprovalRecord {
    return {
      approvalId: row.id,
      workflowId: row.workflow_id,
      reviewRequestId: row.review_request_id,
      category: row.category as ReviewCategory,
      targetEntityType: row.target_entity_type,
      targetEntityId: row.target_entity_id,
      targetArtifactType: row.target_artifact_type as WorkflowArtifactType,
      targetArtifactVersion: row.target_artifact_version,
      reviewerIdentity: row.reviewer_identity,
      reviewerRole: row.reviewer_role as ReviewerRole,
      decision: row.decision as 'approved' | 'rejected' | 'modified',
      rationale: row.rationale,
      decidedAt: row.decided_at,
      validUntilStale: row.valid_until_stale === 1,
      supersededBy: row.superseded_by || undefined,
    };
  }
}
