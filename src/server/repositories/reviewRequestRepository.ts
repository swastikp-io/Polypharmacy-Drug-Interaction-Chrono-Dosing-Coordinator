import type Database from 'better-sqlite3';
import type { ReviewRequest } from '../../shared/orchestrationTypes.js';

export class ReviewRequestRepository {
  constructor(private db: Database.Database) {}

  public findById(id: string): ReviewRequest | null {
    const row = this.db
      .prepare('SELECT * FROM review_requests WHERE id = ?')
      .get(id) as any;

    if (!row) return null;
    return this.mapRowToReviewRequest(row);
  }

  public findByWorkflowId(workflowId: string): ReviewRequest[] {
    const rows = this.db
      .prepare(
        'SELECT * FROM review_requests WHERE workflow_id = ? ORDER BY created_at ASC'
      )
      .all(workflowId) as any[];

    return rows.map((r) => this.mapRowToReviewRequest(r));
  }

  public findPendingByWorkflowId(workflowId: string): ReviewRequest[] {
    const rows = this.db
      .prepare(
        "SELECT * FROM review_requests WHERE workflow_id = ? AND status = 'pending' ORDER BY created_at ASC"
      )
      .all(workflowId) as any[];

    return rows.map((r) => this.mapRowToReviewRequest(r));
  }

  public findByTargetEntity(
    targetEntityType: string,
    targetEntityId: string
  ): ReviewRequest[] {
    const rows = this.db
      .prepare(
        'SELECT * FROM review_requests WHERE target_entity_type = ? AND target_entity_id = ? ORDER BY created_at DESC'
      )
      .all(targetEntityType, targetEntityId) as any[];

    return rows.map((r) => this.mapRowToReviewRequest(r));
  }

  public findAll(limit = 100): ReviewRequest[] {
    const rows = this.db
      .prepare('SELECT * FROM review_requests ORDER BY created_at DESC LIMIT ?')
      .all(limit) as any[];

    return rows.map((r) => this.mapRowToReviewRequest(r));
  }

  public findPendingAll(limit = 100): ReviewRequest[] {
    const rows = this.db
      .prepare(
        "SELECT * FROM review_requests WHERE status = 'pending' ORDER BY created_at DESC LIMIT ?"
      )
      .all(limit) as any[];

    return rows.map((r) => this.mapRowToReviewRequest(r));
  }

  public create(request: ReviewRequest): void {
    const now = new Date().toISOString();
    request.createdAt = request.createdAt || now;

    const stmt = this.db.prepare(`
      INSERT INTO review_requests (
        id, workflow_id, category, reason, supporting_evidence_json,
        missing_or_conflicting_info, requested_action, status, item_version,
        target_entity_type, target_entity_id, target_artifact_type,
        target_artifact_version, reviewer_identity, reviewer_role, reviewer_notes,
        created_at, resolved_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      request.id,
      request.workflowId,
      request.category,
      request.reason,
      JSON.stringify(request.supportingEvidenceReferences || []),
      request.missingOrConflictingInfo || null,
      request.requestedReviewerAction,
      request.status,
      request.itemVersion,
      request.targetEntityType,
      request.targetEntityId,
      request.targetArtifactType || null,
      request.targetArtifactVersion !== undefined ? request.targetArtifactVersion : null,
      request.reviewerIdentity || null,
      request.reviewerRole || null,
      request.reviewerNotes || null,
      request.createdAt,
      request.resolvedAt || null
    );
  }

  public update(request: ReviewRequest): void {
    const stmt = this.db.prepare(`
      UPDATE review_requests
      SET category = ?, reason = ?, supporting_evidence_json = ?,
          missing_or_conflicting_info = ?, requested_action = ?, status = ?,
          item_version = ?, target_entity_type = ?, target_entity_id = ?,
          target_artifact_type = ?, target_artifact_version = ?,
          reviewer_identity = ?, reviewer_role = ?, reviewer_notes = ?, resolved_at = ?
      WHERE id = ?
    `);

    stmt.run(
      request.category,
      request.reason,
      JSON.stringify(request.supportingEvidenceReferences || []),
      request.missingOrConflictingInfo || null,
      request.requestedReviewerAction,
      request.status,
      request.itemVersion,
      request.targetEntityType,
      request.targetEntityId,
      request.targetArtifactType || null,
      request.targetArtifactVersion !== undefined ? request.targetArtifactVersion : null,
      request.reviewerIdentity || null,
      request.reviewerRole || null,
      request.reviewerNotes || null,
      request.resolvedAt || null,
      request.id
    );
  }

  private mapRowToReviewRequest(row: any): ReviewRequest {
    return {
      id: row.id,
      workflowId: row.workflow_id,
      category: row.category,
      reason: row.reason,
      supportingEvidenceReferences: JSON.parse(
        row.supporting_evidence_json || '[]'
      ),
      missingOrConflictingInfo: row.missing_or_conflicting_info || undefined,
      requestedReviewerAction: row.requested_action,
      status: row.status,
      itemVersion: row.item_version,
      targetEntityType: row.target_entity_type,
      targetEntityId: row.target_entity_id,
      targetArtifactType: row.target_artifact_type || undefined,
      targetArtifactVersion:
        row.target_artifact_version !== null ? row.target_artifact_version : undefined,
      reviewerIdentity: row.reviewer_identity || undefined,
      reviewerRole: row.reviewer_role || undefined,
      reviewerNotes: row.reviewer_notes || undefined,
      createdAt: row.created_at,
      resolvedAt: row.resolved_at || undefined,
    };
  }
}
