import type Database from 'better-sqlite3';
import type { ToolExecutionRecord } from '../../shared/agentContractTypes.js';

export interface ToolExecutionDbRow {
  id: string;
  workflow_id: string | null;
  agent_id: string | null;
  tool_name: string;
  input_hash: string;
  dependency_versions_json: string;
  status: string;
  started_at: string;
  completed_at: string;
  duration_ms: number;
  error_json: string | null;
  result_summary: string | null;
  created_at: string;
}

export class ToolExecutionRepository {
  constructor(private db: Database.Database) {}

  public create(record: ToolExecutionRecord): void {
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      INSERT INTO tool_executions (
        id,
        workflow_id,
        agent_id,
        tool_name,
        input_hash,
        dependency_versions_json,
        status,
        started_at,
        completed_at,
        duration_ms,
        error_json,
        result_summary,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const targetWfId =
      record.workflowId &&
      record.workflowId !== 'untracked' &&
      record.workflowId !== 'independent'
        ? record.workflowId
        : null;

    stmt.run(
      record.operationId,
      targetWfId,
      record.agentId || null,
      record.toolName,
      record.inputHash,
      JSON.stringify(record.dependencyVersions || {}),
      record.status,
      record.startedAt,
      record.completedAt,
      record.durationMs,
      record.error ? JSON.stringify(record.error) : null,
      record.resultSummary || null,
      now
    );
  }

  public findByWorkflowId(workflowId: string): ToolExecutionRecord[] {
    const rows = this.db
      .prepare(
        'SELECT * FROM tool_executions WHERE workflow_id = ? ORDER BY started_at ASC'
      )
      .all(workflowId) as ToolExecutionDbRow[];

    return rows.map((r) => this.mapRow(r));
  }

  public findByOperationId(operationId: string): ToolExecutionRecord | null {
    const row = this.db
      .prepare('SELECT * FROM tool_executions WHERE id = ?')
      .get(operationId) as ToolExecutionDbRow | undefined;

    if (!row) return null;
    return this.mapRow(row);
  }

  public countByWorkflow(workflowId: string): number {
    const row = this.db
      .prepare('SELECT COUNT(*) as count FROM tool_executions WHERE workflow_id = ?')
      .get(workflowId) as { count: number };
    return row.count;
  }

  public listRecent(limit: number = 50): ToolExecutionRecord[] {
    const rows = this.db
      .prepare(
        'SELECT * FROM tool_executions ORDER BY started_at DESC LIMIT ?'
      )
      .all(limit) as ToolExecutionDbRow[];

    return rows.map((r) => this.mapRow(r));
  }

  private mapRow(row: ToolExecutionDbRow): ToolExecutionRecord {
    return {
      operationId: row.id,
      workflowId: row.workflow_id || '',
      agentId: row.agent_id || undefined,
      toolName: row.tool_name,
      inputHash: row.input_hash,
      dependencyVersions: row.dependency_versions_json
        ? JSON.parse(row.dependency_versions_json)
        : {},
      status: row.status as ToolExecutionRecord['status'],
      startedAt: row.started_at,
      completedAt: row.completed_at,
      durationMs: row.duration_ms,
      error: row.error_json ? JSON.parse(row.error_json) : undefined,
      resultSummary: row.result_summary || undefined,
    };
  }
}
