import type Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import type { Diagnosis, VerificationStatus } from '../../shared/types.js';
import type { z } from 'zod';
import type { CreateDiagnosisSchema, UpdateDiagnosisSchema } from '../../shared/schemas.js';

export class DiagnosisRepository {
  constructor(private db: Database.Database) {}

  private mapRow(row: any): Diagnosis {
    return {
      id: row.id,
      patientId: row.patient_id,
      condition: row.condition,
      code: row.code,
      clinicalStatus: row.clinical_status,
      verificationStatus: row.verification_status,
      onsetDate: row.onset_date,
      dateRecorded: row.date_recorded,
      source: row.source,
      notes: row.notes,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  findByPatientId(patientId: string): Diagnosis[] {
    const rows = this.db
      .prepare('SELECT * FROM diagnoses WHERE patient_id = ? ORDER BY date_recorded DESC')
      .all(patientId);
    return rows.map((r) => this.mapRow(r));
  }

  findById(id: string): Diagnosis | null {
    const row = this.db.prepare('SELECT * FROM diagnoses WHERE id = ?').get(id);
    return row ? this.mapRow(row) : null;
  }

  create(data: z.infer<typeof CreateDiagnosisSchema>): Diagnosis {
    const id = randomUUID();
    const now = new Date().toISOString();

    this.db
      .prepare(`
        INSERT INTO diagnoses (
          id, patient_id, condition, code, clinical_status,
          verification_status, onset_date, date_recorded, source, notes, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        id,
        data.patientId,
        data.condition,
        data.code,
        data.clinicalStatus || 'active',
        data.verificationStatus || 'unverified',
        data.onsetDate ?? null,
        data.dateRecorded,
        data.source,
        data.notes ?? null,
        now,
        now
      );

    return this.findById(id)!;
  }

  update(id: string, data: z.infer<typeof UpdateDiagnosisSchema>): Diagnosis | null {
    const existing = this.findById(id);
    if (!existing) return null;

    const updated = {
      condition: data.condition !== undefined ? data.condition : existing.condition,
      code: data.code !== undefined ? data.code : existing.code,
      clinicalStatus: data.clinicalStatus !== undefined ? data.clinicalStatus : existing.clinicalStatus,
      verificationStatus: data.verificationStatus !== undefined ? data.verificationStatus : existing.verificationStatus,
      onsetDate: data.onsetDate !== undefined ? data.onsetDate : existing.onsetDate,
      dateRecorded: data.dateRecorded !== undefined ? data.dateRecorded : existing.dateRecorded,
      source: data.source !== undefined ? data.source : existing.source,
      notes: data.notes !== undefined ? data.notes : existing.notes,
      updatedAt: new Date().toISOString(),
    };

    this.db
      .prepare(`
        UPDATE diagnoses SET
          condition = ?, code = ?, clinical_status = ?,
          verification_status = ?, onset_date = ?, date_recorded = ?,
          source = ?, notes = ?, updated_at = ?
        WHERE id = ?
      `)
      .run(
        updated.condition,
        updated.code,
        updated.clinicalStatus,
        updated.verificationStatus,
        updated.onsetDate,
        updated.dateRecorded,
        updated.source,
        updated.notes,
        updated.updatedAt,
        id
      );

    return this.findById(id);
  }

  updateVerificationStatus(id: string, status: VerificationStatus): Diagnosis | null {
    const now = new Date().toISOString();
    this.db
      .prepare('UPDATE diagnoses SET verification_status = ?, updated_at = ? WHERE id = ?')
      .run(status, now, id);
    return this.findById(id);
  }

  delete(id: string): boolean {
    const result = this.db.prepare('DELETE FROM diagnoses WHERE id = ?').run(id);
    return result.changes > 0;
  }
}
