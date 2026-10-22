import type Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import type { Patient } from '../../shared/types.js';
import type { z } from 'zod';
import type { CreatePatientSchema, UpdatePatientSchema } from '../../shared/schemas.js';

export class PatientRepository {
  constructor(private db: Database.Database) {}

  private mapRow(row: any): Patient {
    return {
      id: row.id,
      mrn: row.mrn,
      name: row.name,
      dateOfBirth: row.date_of_birth,
      gender: row.gender,
      weightKg: row.weight_kg !== null ? Number(row.weight_kg) : null,
      heightCm: row.height_cm !== null ? Number(row.height_cm) : null,
      primaryPhysician: row.primary_physician,
      careSetting: row.care_setting,
      emergencyContact: row.emergency_contact,
      notes: row.notes,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  findAll(): Patient[] {
    const rows = this.db.prepare('SELECT * FROM patients ORDER BY name ASC').all();
    return rows.map((r) => this.mapRow(r));
  }

  findById(id: string): Patient | null {
    const row = this.db.prepare('SELECT * FROM patients WHERE id = ?').get(id);
    return row ? this.mapRow(row) : null;
  }

  findByMrn(mrn: string): Patient | null {
    const row = this.db.prepare('SELECT * FROM patients WHERE mrn = ?').get(mrn);
    return row ? this.mapRow(row) : null;
  }

  create(data: z.infer<typeof CreatePatientSchema>): Patient {
    const id = randomUUID();
    const now = new Date().toISOString();

    this.db
      .prepare(`
        INSERT INTO patients (
          id, mrn, name, date_of_birth, gender, weight_kg, height_cm,
          primary_physician, care_setting, emergency_contact, notes, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        id,
        data.mrn,
        data.name,
        data.dateOfBirth,
        data.gender,
        data.weightKg ?? null,
        data.heightCm ?? null,
        data.primaryPhysician,
        data.careSetting,
        data.emergencyContact,
        data.notes ?? null,
        now,
        now
      );

    return this.findById(id)!;
  }

  update(id: string, data: z.infer<typeof UpdatePatientSchema>): Patient | null {
    const existing = this.findById(id);
    if (!existing) return null;

    const updated = {
      mrn: data.mrn !== undefined ? data.mrn : existing.mrn,
      name: data.name !== undefined ? data.name : existing.name,
      dateOfBirth: data.dateOfBirth !== undefined ? data.dateOfBirth : existing.dateOfBirth,
      gender: data.gender !== undefined ? data.gender : existing.gender,
      weightKg: data.weightKg !== undefined ? data.weightKg : existing.weightKg,
      heightCm: data.heightCm !== undefined ? data.heightCm : existing.heightCm,
      primaryPhysician: data.primaryPhysician !== undefined ? data.primaryPhysician : existing.primaryPhysician,
      careSetting: data.careSetting !== undefined ? data.careSetting : existing.careSetting,
      emergencyContact: data.emergencyContact !== undefined ? data.emergencyContact : existing.emergencyContact,
      notes: data.notes !== undefined ? data.notes : existing.notes,
      updatedAt: new Date().toISOString(),
    };

    this.db
      .prepare(`
        UPDATE patients SET
          mrn = ?, name = ?, date_of_birth = ?, gender = ?,
          weight_kg = ?, height_cm = ?, primary_physician = ?,
          care_setting = ?, emergency_contact = ?, notes = ?, updated_at = ?
        WHERE id = ?
      `)
      .run(
        updated.mrn,
        updated.name,
        updated.dateOfBirth,
        updated.gender,
        updated.weightKg,
        updated.heightCm,
        updated.primaryPhysician,
        updated.careSetting,
        updated.emergencyContact,
        updated.notes,
        updated.updatedAt,
        id
      );

    return this.findById(id);
  }

  delete(id: string): boolean {
    const result = this.db.prepare('DELETE FROM patients WHERE id = ?').run(id);
    return result.changes > 0;
  }
}
