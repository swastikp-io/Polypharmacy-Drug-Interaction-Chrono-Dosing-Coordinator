import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { getDatabasePath } from '../utils/paths.js';

export const DB_PATH = getDatabasePath();

export function createDatabaseConnection(customPath?: string): Database.Database {
  const targetPath = customPath || getDatabasePath();

  if (targetPath !== ':memory:') {
    const dbDir = path.dirname(targetPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
  }

  const dbInstance = new Database(targetPath);
  dbInstance.pragma('journal_mode = WAL');
  dbInstance.pragma('foreign_keys = ON');

  // Initialize schema
  initializeSchema(dbInstance);

  return dbInstance;
}

export function initializeSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS patients (
      id TEXT PRIMARY KEY,
      mrn TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      date_of_birth TEXT NOT NULL,
      gender TEXT NOT NULL,
      weight_kg REAL,
      height_cm REAL,
      primary_physician TEXT NOT NULL,
      care_setting TEXT NOT NULL,
      emergency_contact TEXT NOT NULL,
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS medications (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL,
      brand TEXT NOT NULL,
      generic_name TEXT NOT NULL,
      active_ingredients_json TEXT NOT NULL,
      salt TEXT NOT NULL,
      strength TEXT NOT NULL,
      formulation TEXT NOT NULL,
      route TEXT NOT NULL,
      prescribed_dose TEXT NOT NULL,
      frequency TEXT NOT NULL,
      administration_instructions TEXT NOT NULL,
      prescriber TEXT NOT NULL,
      source TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      verification_status TEXT NOT NULL DEFAULT 'unverified',
      start_date TEXT,
      end_date TEXT,
      indication TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS allergies (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL,
      allergen TEXT NOT NULL,
      allergen_type TEXT NOT NULL DEFAULT 'drug',
      reaction TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'moderate',
      verification_status TEXT NOT NULL DEFAULT 'unverified',
      date_recorded TEXT NOT NULL,
      source TEXT NOT NULL,
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS diagnoses (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL,
      condition TEXT NOT NULL,
      code TEXT NOT NULL,
      clinical_status TEXT NOT NULL DEFAULT 'active',
      verification_status TEXT NOT NULL DEFAULT 'unverified',
      onset_date TEXT,
      date_recorded TEXT NOT NULL,
      source TEXT NOT NULL,
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS lab_measurements (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL,
      test_name TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'renal',
      value REAL NOT NULL,
      unit TEXT NOT NULL,
      reference_range TEXT NOT NULL,
      interpretation TEXT NOT NULL DEFAULT 'normal',
      collection_date TEXT NOT NULL,
      verification_status TEXT NOT NULL DEFAULT 'unverified',
      source TEXT NOT NULL,
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      action TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      actor TEXT NOT NULL,
      summary TEXT NOT NULL,
      previous_state TEXT,
      new_state TEXT,
      changed_fields_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS patient_routines (
      patient_id TEXT PRIMARY KEY,
      wake_time TEXT NOT NULL DEFAULT '07:00',
      breakfast_time TEXT NOT NULL DEFAULT '08:00',
      lunch_time TEXT NOT NULL DEFAULT '12:30',
      dinner_time TEXT NOT NULL DEFAULT '18:30',
      bed_time TEXT NOT NULL DEFAULT '21:30',
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS chrono_schedules (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      schedule_json TEXT NOT NULL,
      comparison_json TEXT NOT NULL,
      routine_json TEXT NOT NULL,
      reviewed_by TEXT,
      reviewed_at TEXT,
      decision_rationale TEXT,
      clinician_notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_meds_patient ON medications(patient_id);
    CREATE INDEX IF NOT EXISTS idx_allergies_patient ON allergies(patient_id);
    CREATE INDEX IF NOT EXISTS idx_diagnoses_patient ON diagnoses(patient_id);
    CREATE INDEX IF NOT EXISTS idx_labs_patient ON lab_measurements(patient_id);
    CREATE INDEX IF NOT EXISTS idx_audit_patient ON audit_logs(patient_id);
    CREATE INDEX IF NOT EXISTS idx_chrono_patient ON chrono_schedules(patient_id);
  `);
}

// Lazy singleton database instance for backward-compatibility with `import { db } from './db/database.js'`
let _lazyDb: Database.Database | null = null;
export function getDefaultDatabase(): Database.Database {
  if (!_lazyDb) {
    _lazyDb = createDatabaseConnection();
  }
  return _lazyDb;
}

export const db: Database.Database = new Proxy({} as Database.Database, {
  get(_target, prop, receiver) {
    const instance = getDefaultDatabase();
    const value = Reflect.get(instance, prop, receiver);
    if (typeof value === 'function') {
      return value.bind(instance);
    }
    return value;
  },
});
