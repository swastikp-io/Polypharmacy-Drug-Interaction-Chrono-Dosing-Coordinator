import type Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import type { Allergy, VerificationStatus } from '../../shared/types.js';
import type { z } from 'zod';
import type { CreateAllergySchema, UpdateAllergySchema } from '../../shared/schemas.js';

export class AllergyRepository {
  constructor(private db: Database.Database) {}

  private mapRow(row: any): Allergy {
    return {
      id: row.id,
      patientId: row.patient_id,
      allergen: row.allergen,
      allergenType: row.allergen_type,
      reaction: row.reaction,
      severity: row.severity,
      verificationStatus: row.verification_status,
      dateRecorded: row.date_recorded,
      source: row.source,
      notes: row.notes,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  findByPatientId(patientId: string): Allergy[] {
    const rows = this.db
      .prepare('SELECT * FROM allergies WHERE patient_id = ? ORDER BY allergen ASC')
      .all(patientId);
    return rows.map((r) => this.mapRow(r));
  }

  findById(id: string): Allergy | null {
    const row = this.db.prepare('SELECT * FROM allergies WHERE id = ?').get(id);
    return row ? this.mapRow(row) : null;
  }

  create(data: z.infer<typeof CreateAllergySchema>): Allergy {
    const id = randomUUID();
    const now = new Date().toISOString();

    this.db
      .prepare(`
        INSERT INTO allergies (
          id, patient_id, allergen, allergen_type, reaction, severity,
          verification_status, date_recorded, source, notes, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        id,
        data.patientId,
        data.allergen,
        data.allergenType || 'drug',
        data.reaction,
        data.severity || 'moderate',
        data.verificationStatus || 'unverified',
        data.dateRecorded,
        data.source,
        data.notes ?? null,
        now,
        now
      );

    return this.findById(id)!;
  }

  update(id: string, data: z.infer<typeof UpdateAllergySchema>): Allergy | null {
    const existing = this.findById(id);
    if (!existing) return null;

    const updated = {
      allergen: data.allergen !== undefined ? data.allergen : existing.allergen,
      allergenType: data.allergenType !== undefined ? data.allergenType : existing.allergenType,
      reaction: data.reaction !== undefined ? data.reaction : existing.reaction,
      severity: data.severity !== undefined ? data.severity : existing.severity,
      verificationStatus: data.verificationStatus !== undefined ? data.verificationStatus : existing.verificationStatus,
      dateRecorded: data.dateRecorded !== undefined ? data.dateRecorded : existing.dateRecorded,
      source: data.source !== undefined ? data.source : existing.source,
      notes: data.notes !== undefined ? data.notes : existing.notes,
      updatedAt: new Date().toISOString(),
    };

    this.db
      .prepare(`
        UPDATE allergies SET
          allergen = ?, allergen_type = ?, reaction = ?, severity = ?,
          verification_status = ?, date_recorded = ?, source = ?,
          notes = ?, updated_at = ?
        WHERE id = ?
      `)
      .run(
        updated.allergen,
        updated.allergenType,
        updated.reaction,
        updated.severity,
        updated.verificationStatus,
        updated.dateRecorded,
        updated.source,
        updated.notes,
        updated.updatedAt,
        id
      );

    return this.findById(id);
  }

  updateVerificationStatus(id: string, status: VerificationStatus): Allergy | null {
    const now = new Date().toISOString();
    this.db
      .prepare('UPDATE allergies SET verification_status = ?, updated_at = ? WHERE id = ?')
      .run(status, now, id);
    return this.findById(id);
  }

  delete(id: string): boolean {
    const result = this.db.prepare('DELETE FROM allergies WHERE id = ?').run(id);
    return result.changes > 0;
  }
}
