import type Database from 'better-sqlite3';
import type { WorkflowContext } from '../../shared/orchestrationTypes.js';
import { OptimisticConcurrencyError } from '../services/orchestration/stateMachine/errors.js';

export class WorkflowRepository {
  constructor(private db: Database.Database) {}

  public findById(workflowId: string): WorkflowContext | null {
    const row = this.db
      .prepare('SELECT context_json FROM workflow_contexts WHERE id = ?')
      .get(workflowId) as { context_json: string } | undefined;

    if (!row) return null;
    return JSON.parse(row.context_json) as WorkflowContext;
  }

  public findByPatientId(patientId: string): WorkflowContext[] {
    const rows = this.db
      .prepare(
        'SELECT context_json FROM workflow_contexts WHERE patient_id = ? ORDER BY created_at DESC'
      )
      .all(patientId) as Array<{ context_json: string }>;

    return rows.map((r) => JSON.parse(r.context_json) as WorkflowContext);
  }

  public findAll(): WorkflowContext[] {
    const rows = this.db
      .prepare('SELECT context_json FROM workflow_contexts ORDER BY created_at DESC')
      .all() as Array<{ context_json: string }>;
    return rows.map((r) => JSON.parse(r.context_json) as WorkflowContext);
  }

  public findActive(): WorkflowContext[] {
    const rows = this.db
      .prepare(
        "SELECT context_json FROM workflow_contexts WHERE state NOT IN ('COMPLETED', 'CANCELLED') ORDER BY created_at DESC"
      )
      .all() as Array<{ context_json: string }>;
    return rows.map((r) => JSON.parse(r.context_json) as WorkflowContext);
  }

  public getLatestForPatient(patientId: string): WorkflowContext | null {
    const row = this.db
      .prepare(
        'SELECT context_json FROM workflow_contexts WHERE patient_id = ? ORDER BY created_at DESC LIMIT 1'
      )
      .get(patientId) as { context_json: string } | undefined;

    if (!row) return null;
    return JSON.parse(row.context_json) as WorkflowContext;
  }

  public create(context: WorkflowContext): void {
    const now = new Date().toISOString();
    context.createdAt = context.createdAt || now;
    context.updatedAt = now;
    context.version = context.version || 1;

    const stmt = this.db.prepare(`
      INSERT INTO workflow_contexts (
        id, patient_id, state, version, context_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      context.workflowId,
      context.patientId,
      context.state,
      context.version,
      JSON.stringify(context),
      context.createdAt,
      context.updatedAt
    );
  }

  public update(context: WorkflowContext): void {
    const now = new Date().toISOString();
    const currentVersion = context.version;
    const nextVersion = currentVersion + 1;

    const updatedContext: WorkflowContext = {
      ...context,
      version: nextVersion,
      updatedAt: now,
    };

    const stmt = this.db.prepare(`
      UPDATE workflow_contexts
      SET state = ?, version = ?, context_json = ?, updated_at = ?
      WHERE id = ? AND version = ?
    `);

    const result = stmt.run(
      updatedContext.state,
      nextVersion,
      JSON.stringify(updatedContext),
      now,
      context.workflowId,
      currentVersion
    );

    if (result.changes === 0) {
      // Find actual existing version for diagnostic error
      const existing = this.findById(context.workflowId);
      throw new OptimisticConcurrencyError(
        context.workflowId,
        currentVersion,
        existing ? existing.version : undefined
      );
    }

    // Reflect new version and timestamp in the passed context
    context.version = nextVersion;
    context.updatedAt = now;
  }

  public delete(workflowId: string): boolean {
    const result = this.db
      .prepare('DELETE FROM workflow_contexts WHERE id = ?')
      .run(workflowId);
    return result.changes > 0;
  }
}
