import type Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import type { Medication, VerificationStatus } from '../../shared/types.js';
import type { z } from 'zod';
import type { CreateMedicationSchema, UpdateMedicationSchema } from '../../shared/schemas.js';

export class MedicationRepository {
  constructor(private db: Database.Database) {}

  private mapRow(row: any): Medication {
    let activeIngredients = [];
    try {
      activeIngredients = JSON.parse(row.active_ingredients_json || '[]');
    } catch {
      activeIngredients = [];
    }

    return {
      id: row.id,
      patientId: row.patient_id,
      brand: row.brand,
      genericName: row.generic_name,
      activeIngredients,
      salt: row.salt,
      strength: row.strength,
      formulation: row.formulation,
      route: row.route,
      prescribedDose: row.prescribed_dose,
      frequency: row.frequency,
      administrationInstructions: row.administration_instructions,
      prescriber: row.prescriber,
      source: row.source,
      status: row.status,
      verificationStatus: row.verification_status,
      startDate: row.start_date,
      endDate: row.end_date,
      indication: row.indication,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  findByPatientId(patientId: string): Medication[] {
    const rows = this.db
      .prepare('SELECT * FROM medications WHERE patient_id = ? ORDER BY brand ASC')
      .all(patientId);
    return rows.map((r) => this.mapRow(r));
  }

  findById(id: string): Medication | null {
    const row = this.db.prepare('SELECT * FROM medications WHERE id = ?').get(id);
    return row ? this.mapRow(row) : null;
  }

  create(data: z.infer<typeof CreateMedicationSchema>): Medication {
    const id = randomUUID();
    const now = new Date().toISOString();

    this.db
      .prepare(`
        INSERT INTO medications (
          id, patient_id, brand, generic_name, active_ingredients_json,
          salt, strength, formulation, route, prescribed_dose,
          frequency, administration_instructions, prescriber, source,
          status, verification_status, start_date, end_date, indication,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        id,
        data.patientId,
        data.brand,
        data.genericName,
        JSON.stringify(data.activeIngredients || []),
        data.salt,
        data.strength,
        data.formulation,
        data.route,
        data.prescribedDose,
        data.frequency,
        data.administrationInstructions,
        data.prescriber,
        data.source,
        data.status || 'active',
        data.verificationStatus || 'unverified',
        data.startDate ?? null,
        data.endDate ?? null,
        data.indication ?? null,
        now,
        now
      );

    return this.findById(id)!;
  }

  update(id: string, data: z.infer<typeof UpdateMedicationSchema>): Medication | null {
    const existing = this.findById(id);
    if (!existing) return null;

    const updated = {
      brand: data.brand !== undefined ? data.brand : existing.brand,
      genericName: data.genericName !== undefined ? data.genericName : existing.genericName,
      activeIngredients: data.activeIngredients !== undefined ? data.activeIngredients : existing.activeIngredients,
      salt: data.salt !== undefined ? data.salt : existing.salt,
      strength: data.strength !== undefined ? data.strength : existing.strength,
      formulation: data.formulation !== undefined ? data.formulation : existing.formulation,
      route: data.route !== undefined ? data.route : existing.route,
      prescribedDose: data.prescribedDose !== undefined ? data.prescribedDose : existing.prescribedDose,
      frequency: data.frequency !== undefined ? data.frequency : existing.frequency,
      administrationInstructions: data.administrationInstructions !== undefined ? data.administrationInstructions : existing.administrationInstructions,
      prescriber: data.prescriber !== undefined ? data.prescriber : existing.prescriber,
      source: data.source !== undefined ? data.source : existing.source,
      status: data.status !== undefined ? data.status : existing.status,
      verificationStatus: data.verificationStatus !== undefined ? data.verificationStatus : existing.verificationStatus,
      startDate: data.startDate !== undefined ? data.startDate : existing.startDate,
      endDate: data.endDate !== undefined ? data.endDate : existing.endDate,
      indication: data.indication !== undefined ? data.indication : existing.indication,
      updatedAt: new Date().toISOString(),
    };

    this.db
      .prepare(`
        UPDATE medications SET
          brand = ?, generic_name = ?, active_ingredients_json = ?,
          salt = ?, strength = ?, formulation = ?, route = ?,
          prescribed_dose = ?, frequency = ?, administration_instructions = ?,
          prescriber = ?, source = ?, status = ?, verification_status = ?,
          start_date = ?, end_date = ?, indication = ?, updated_at = ?
        WHERE id = ?
      `)
      .run(
        updated.brand,
        updated.genericName,
        JSON.stringify(updated.activeIngredients),
        updated.salt,
        updated.strength,
        updated.formulation,
        updated.route,
        updated.prescribedDose,
        updated.frequency,
        updated.administrationInstructions,
        updated.prescriber,
        updated.source,
        updated.status,
        updated.verificationStatus,
        updated.startDate,
        updated.endDate,
        updated.indication,
        updated.updatedAt,
        id
      );

    return this.findById(id);
  }

  updateVerificationStatus(id: string, status: VerificationStatus): Medication | null {
    const now = new Date().toISOString();
    this.db
      .prepare('UPDATE medications SET verification_status = ?, updated_at = ? WHERE id = ?')
      .run(status, now, id);
    return this.findById(id);
  }

  delete(id: string): boolean {
    const result = this.db.prepare('DELETE FROM medications WHERE id = ?').run(id);
    return result.changes > 0;
  }
}
