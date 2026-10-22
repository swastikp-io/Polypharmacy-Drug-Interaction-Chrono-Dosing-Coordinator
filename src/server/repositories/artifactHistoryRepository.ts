import type Database from 'better-sqlite3';
import type {
  HistoricalArtifactRecord,
  WorkflowArtifactType,
} from '../../shared/orchestrationTypes.js';

export interface ArtifactHistoryDbRow {
  id: string;
  workflow_id: string;
  artifact_id: string;
  artifact_type: string;
  version: number;
  content_hash: string;
  dependency_fingerprint: string;
  reason_archived: string;
  data_json: string;
  created_at: string;
}

export class ArtifactHistoryRepository {
  constructor(private db: Database.Database) {}

  public create(record: HistoricalArtifactRecord): void {
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      INSERT INTO workflow_artifact_history (
        id,
        workflow_id,
        artifact_id,
        artifact_type,
        version,
        content_hash,
        dependency_fingerprint,
        reason_archived,
        data_json,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      record.historyId,
      record.workflowId,
      record.artifactId,
      record.artifactType,
      record.version,
      record.contentHash,
      record.dependencyFingerprint,
      record.reasonArchived,
      JSON.stringify(record.data ?? null),
      record.archivedAt || now
    );
  }

  public findByWorkflowId(workflowId: string): HistoricalArtifactRecord[] {
    const rows = this.db
      .prepare(
        'SELECT * FROM workflow_artifact_history WHERE workflow_id = ? ORDER BY created_at ASC'
      )
      .all(workflowId) as ArtifactHistoryDbRow[];

    return rows.map((r) => this.mapRow(r));
  }

  public findByArtifactType(
    workflowId: string,
    artifactType: WorkflowArtifactType
  ): HistoricalArtifactRecord[] {
    const rows = this.db
      .prepare(
        'SELECT * FROM workflow_artifact_history WHERE workflow_id = ? AND artifact_type = ? ORDER BY created_at ASC'
      )
      .all(workflowId, artifactType) as ArtifactHistoryDbRow[];

    return rows.map((r) => this.mapRow(r));
  }

  public countByWorkflow(workflowId: string): number {
    const row = this.db
      .prepare('SELECT COUNT(*) as count FROM workflow_artifact_history WHERE workflow_id = ?')
      .get(workflowId) as { count: number };
    return row.count;
  }

  private mapRow(row: ArtifactHistoryDbRow): HistoricalArtifactRecord {
    return {
      historyId: row.id,
      workflowId: row.workflow_id,
      artifactId: row.artifact_id,
      artifactType: row.artifact_type as WorkflowArtifactType,
      version: row.version,
      contentHash: row.content_hash,
      dependencyFingerprint: row.dependency_fingerprint,
      reasonArchived: row.reason_archived,
      archivedAt: row.created_at,
      data: row.data_json ? JSON.parse(row.data_json) : null,
    };
  }
}
