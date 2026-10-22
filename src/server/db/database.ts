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

    CREATE TABLE IF NOT EXISTS workflow_contexts (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL,
      state TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      context_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS review_requests (
      id TEXT PRIMARY KEY,
      workflow_id TEXT NOT NULL,
      category TEXT NOT NULL,
      reason TEXT NOT NULL,
      supporting_evidence_json TEXT NOT NULL,
      missing_or_conflicting_info TEXT,
      requested_action TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      item_version INTEGER NOT NULL DEFAULT 1,
      target_entity_type TEXT NOT NULL,
      target_entity_id TEXT NOT NULL,
      target_artifact_type TEXT,
      target_artifact_version INTEGER,
      reviewer_identity TEXT,
      reviewer_role TEXT,
      reviewer_notes TEXT,
      created_at TEXT NOT NULL,
      resolved_at TEXT,
      FOREIGN KEY (workflow_id) REFERENCES workflow_contexts(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS approval_records (
      id TEXT PRIMARY KEY,
      workflow_id TEXT NOT NULL,
      review_request_id TEXT NOT NULL,
      category TEXT NOT NULL,
      target_entity_type TEXT NOT NULL,
      target_entity_id TEXT NOT NULL,
      target_artifact_type TEXT NOT NULL,
      target_artifact_version INTEGER NOT NULL,
      reviewer_identity TEXT NOT NULL,
      reviewer_role TEXT NOT NULL,
      decision TEXT NOT NULL,
      rationale TEXT NOT NULL,
      decided_at TEXT NOT NULL,
      valid_until_stale INTEGER NOT NULL DEFAULT 1,
      superseded_by TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (workflow_id) REFERENCES workflow_contexts(id) ON DELETE CASCADE,
      FOREIGN KEY (review_request_id) REFERENCES review_requests(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS tool_executions (
      id TEXT PRIMARY KEY,
      workflow_id TEXT,
      agent_id TEXT,
      tool_name TEXT NOT NULL,
      input_hash TEXT NOT NULL,
      dependency_versions_json TEXT NOT NULL,
      status TEXT NOT NULL,
      started_at TEXT NOT NULL,
      completed_at TEXT NOT NULL,
      duration_ms INTEGER NOT NULL,
      error_json TEXT,
      result_summary TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (workflow_id) REFERENCES workflow_contexts(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS workflow_artifact_history (
      id TEXT PRIMARY KEY,
      workflow_id TEXT NOT NULL,
      artifact_id TEXT NOT NULL,
      artifact_type TEXT NOT NULL,
      version INTEGER NOT NULL,
      content_hash TEXT NOT NULL,
      dependency_fingerprint TEXT NOT NULL,
      reason_archived TEXT NOT NULL,
      data_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (workflow_id) REFERENCES workflow_contexts(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_meds_patient ON medications(patient_id);
    CREATE INDEX IF NOT EXISTS idx_allergies_patient ON allergies(patient_id);
    CREATE INDEX IF NOT EXISTS idx_diagnoses_patient ON diagnoses(patient_id);
    CREATE INDEX IF NOT EXISTS idx_labs_patient ON lab_measurements(patient_id);
    CREATE INDEX IF NOT EXISTS idx_audit_patient ON audit_logs(patient_id);
    CREATE INDEX IF NOT EXISTS idx_chrono_patient ON chrono_schedules(patient_id);
    CREATE INDEX IF NOT EXISTS idx_workflow_contexts_patient ON workflow_contexts(patient_id);
    CREATE INDEX IF NOT EXISTS idx_review_requests_workflow ON review_requests(workflow_id);
    CREATE INDEX IF NOT EXISTS idx_review_requests_status ON review_requests(status);
    CREATE INDEX IF NOT EXISTS idx_tool_executions_workflow ON tool_executions(workflow_id);
    CREATE INDEX IF NOT EXISTS idx_tool_executions_tool ON tool_executions(tool_name);
    CREATE INDEX IF NOT EXISTS idx_artifact_history_workflow ON workflow_artifact_history(workflow_id);
    CREATE INDEX IF NOT EXISTS idx_artifact_history_type ON workflow_artifact_history(artifact_type);
    CREATE INDEX IF NOT EXISTS idx_approval_records_workflow ON approval_records(workflow_id);
    CREATE INDEX IF NOT EXISTS idx_approval_records_review ON approval_records(review_request_id);
    CREATE INDEX IF NOT EXISTS idx_approval_records_category ON approval_records(category);
  `);

  // Migrate review_requests columns if needed for existing persistent databases
  try {
    const reviewColumns = db.prepare('PRAGMA table_info(review_requests)').all() as Array<{ name: string }>;
    const colNames = new Set(reviewColumns.map((c) => c.name));
    if (!colNames.has('reviewer_role')) {
      db.prepare('ALTER TABLE review_requests ADD COLUMN reviewer_role TEXT').run();
    }
    if (!colNames.has('target_artifact_type')) {
      db.prepare('ALTER TABLE review_requests ADD COLUMN target_artifact_type TEXT').run();
    }
    if (!colNames.has('target_artifact_version')) {
      db.prepare('ALTER TABLE review_requests ADD COLUMN target_artifact_version INTEGER').run();
    }
  } catch {
    // Ignore migration check if table does not exist yet
  }
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
