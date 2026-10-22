import type Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import type { AuditAction, AuditLog, EntityType } from '../../shared/types.js';

export interface CreateAuditLogParams {
  patientId: string;
  entityType: EntityType;
  entityId: string;
  action: AuditAction;
  actor: string;
  summary: string;
  previousState?: any;
  newState?: any;
  changedFields?: string[];
}

export class AuditLogRepository {
  constructor(private db: Database.Database) {}

  private mapRow(row: any): AuditLog {
    let changedFields: string[] = [];
    try {
      changedFields = JSON.parse(row.changed_fields_json || '[]');
    } catch {
      changedFields = [];
    }

    return {
      id: row.id,
      patientId: row.patient_id,
      entityType: row.entity_type,
      entityId: row.entity_id,
      action: row.action,
      timestamp: row.timestamp,
      actor: row.actor,
      summary: row.summary,
      previousState: row.previous_state,
      newState: row.new_state,
      changedFields,
    };
  }

  findByPatientId(patientId: string): AuditLog[] {
    const rows = this.db
      .prepare('SELECT * FROM audit_logs WHERE patient_id = ? ORDER BY timestamp DESC')
      .all(patientId);
    return rows.map((r) => this.mapRow(r));
  }

  findByEntity(entityType: EntityType, entityId: string): AuditLog[] {
    const rows = this.db
      .prepare('SELECT * FROM audit_logs WHERE entity_type = ? AND entity_id = ? ORDER BY timestamp DESC')
      .all(entityType, entityId);
    return rows.map((r) => this.mapRow(r));
  }

  record(params: CreateAuditLogParams): AuditLog {
    const id = randomUUID();
    const timestamp = new Date().toISOString();

    const prevStateJson = params.previousState ? JSON.stringify(params.previousState) : null;
    const newStateJson = params.newState ? JSON.stringify(params.newState) : null;
    const changedFieldsJson = JSON.stringify(params.changedFields || []);

    this.db
      .prepare(`
        INSERT INTO audit_logs (
          id, patient_id, entity_type, entity_id, action, timestamp,
          actor, summary, previous_state, new_state, changed_fields_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        id,
        params.patientId,
        params.entityType,
        params.entityId,
        params.action,
        timestamp,
        params.actor,
        params.summary,
        prevStateJson,
        newStateJson,
        changedFieldsJson
      );

    const row = this.db.prepare('SELECT * FROM audit_logs WHERE id = ?').get(id);
    return this.mapRow(row);
  }
}
