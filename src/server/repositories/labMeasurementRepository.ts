import type Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import type { LabMeasurement, VerificationStatus } from '../../shared/types.js';
import type { z } from 'zod';
import type { CreateLabMeasurementSchema, UpdateLabMeasurementSchema } from '../../shared/schemas.js';

export class LabMeasurementRepository {
  constructor(private db: Database.Database) {}

  private mapRow(row: any): LabMeasurement {
    return {
      id: row.id,
      patientId: row.patient_id,
      testName: row.test_name,
      category: row.category,
      value: Number(row.value),
      unit: row.unit,
      referenceRange: row.reference_range,
      interpretation: row.interpretation,
      collectionDate: row.collection_date,
      verificationStatus: row.verification_status,
      source: row.source,
      notes: row.notes,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  findByPatientId(patientId: string): LabMeasurement[] {
    const rows = this.db
      .prepare('SELECT * FROM lab_measurements WHERE patient_id = ? ORDER BY collection_date DESC, test_name ASC')
      .all(patientId);
    return rows.map((r) => this.mapRow(r));
  }

  findById(id: string): LabMeasurement | null {
    const row = this.db.prepare('SELECT * FROM lab_measurements WHERE id = ?').get(id);
    return row ? this.mapRow(row) : null;
  }

  create(data: z.infer<typeof CreateLabMeasurementSchema>): LabMeasurement {
    const id = randomUUID();
    const now = new Date().toISOString();

    this.db
      .prepare(`
        INSERT INTO lab_measurements (
          id, patient_id, test_name, category, value, unit,
          reference_range, interpretation, collection_date,
          verification_status, source, notes, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        id,
        data.patientId,
        data.testName,
        data.category || 'renal',
        data.value,
        data.unit,
        data.referenceRange,
        data.interpretation || 'normal',
        data.collectionDate,
        data.verificationStatus || 'unverified',
        data.source,
        data.notes ?? null,
        now,
        now
      );

    return this.findById(id)!;
  }

  update(id: string, data: z.infer<typeof UpdateLabMeasurementSchema>): LabMeasurement | null {
    const existing = this.findById(id);
    if (!existing) return null;

    const updated = {
      testName: data.testName !== undefined ? data.testName : existing.testName,
      category: data.category !== undefined ? data.category : existing.category,
      value: data.value !== undefined ? data.value : existing.value,
      unit: data.unit !== undefined ? data.unit : existing.unit,
      referenceRange: data.referenceRange !== undefined ? data.referenceRange : existing.referenceRange,
      interpretation: data.interpretation !== undefined ? data.interpretation : existing.interpretation,
      collectionDate: data.collectionDate !== undefined ? data.collectionDate : existing.collectionDate,
      verificationStatus: data.verificationStatus !== undefined ? data.verificationStatus : existing.verificationStatus,
      source: data.source !== undefined ? data.source : existing.source,
      notes: data.notes !== undefined ? data.notes : existing.notes,
      updatedAt: new Date().toISOString(),
    };

    this.db
      .prepare(`
        UPDATE lab_measurements SET
          test_name = ?, category = ?, value = ?, unit = ?,
          reference_range = ?, interpretation = ?, collection_date = ?,
          verification_status = ?, source = ?, notes = ?, updated_at = ?
        WHERE id = ?
      `)
      .run(
        updated.testName,
        updated.category,
        updated.value,
        updated.unit,
        updated.referenceRange,
        updated.interpretation,
        updated.collectionDate,
        updated.verificationStatus,
        updated.source,
        updated.notes,
        updated.updatedAt,
        id
      );

    return this.findById(id);
  }

  updateVerificationStatus(id: string, status: VerificationStatus): LabMeasurement | null {
    const now = new Date().toISOString();
    this.db
      .prepare('UPDATE lab_measurements SET verification_status = ?, updated_at = ? WHERE id = ?')
      .run(status, now, id);
    return this.findById(id);
  }

  delete(id: string): boolean {
    const result = this.db.prepare('DELETE FROM lab_measurements WHERE id = ?').run(id);
    return result.changes > 0;
  }
}
