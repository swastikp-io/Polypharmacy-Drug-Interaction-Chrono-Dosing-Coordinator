import type Database from 'better-sqlite3';
import type {
  DailyScheduleTimeline,
  PatientRoutine,
  ScheduleReviewMetadata,
  ScheduleStatus,
} from '../../shared/chronoTypes.js';

export class ChronoRepository {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  // ==========================================
  // PATIENT ROUTINES
  // ==========================================

  getPatientRoutine(patientId: string): PatientRoutine | null {
    const row = this.db
      .prepare(
        `SELECT patient_id, wake_time, breakfast_time, lunch_time, dinner_time, bed_time, notes, updated_at
         FROM patient_routines
         WHERE patient_id = ?`
      )
      .get(patientId) as any;

    if (!row) {
      return null;
    }

    return {
      patientId: row.patient_id,
      wakeTime: row.wake_time,
      breakfastTime: row.breakfast_time,
      lunchTime: row.lunch_time,
      dinnerTime: row.dinner_time,
      bedTime: row.bed_time,
      notes: row.notes || undefined,
      updatedAt: row.updated_at,
    };
  }

  upsertPatientRoutine(routine: PatientRoutine): PatientRoutine {
    const now = new Date().toISOString();
    const updatedAt = routine.updatedAt || now;

    this.db
      .prepare(
        `INSERT INTO patient_routines (
           patient_id, wake_time, breakfast_time, lunch_time, dinner_time, bed_time, notes, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(patient_id) DO UPDATE SET
           wake_time = excluded.wake_time,
           breakfast_time = excluded.breakfast_time,
           lunch_time = excluded.lunch_time,
           dinner_time = excluded.dinner_time,
           bed_time = excluded.bed_time,
           notes = excluded.notes,
           updated_at = excluded.updated_at`
      )
      .run(
        routine.patientId,
        routine.wakeTime,
        routine.breakfastTime,
        routine.lunchTime,
        routine.dinnerTime,
        routine.bedTime,
        routine.notes || null,
        now,
        updatedAt
      );

    return {
      ...routine,
      updatedAt,
    };
  }

  // ==========================================
  // CHRONO SCHEDULE TIMELINES
  // ==========================================

  saveSchedule(schedule: DailyScheduleTimeline): void {
    const now = new Date().toISOString();
    const existing = this.db
      .prepare('SELECT id FROM chrono_schedules WHERE id = ?')
      .get(schedule.scheduleId);

    if (existing) {
      this.db
        .prepare(
          `UPDATE chrono_schedules
           SET status = ?,
               schedule_json = ?,
               comparison_json = ?,
               routine_json = ?,
               reviewed_by = ?,
               reviewed_at = ?,
               decision_rationale = ?,
               clinician_notes = ?,
               updated_at = ?
           WHERE id = ?`
        )
        .run(
          schedule.status,
          JSON.stringify(schedule),
          JSON.stringify(schedule.comparison),
          JSON.stringify(schedule.patientRoutine),
          schedule.reviewMetadata?.reviewedBy || null,
          schedule.reviewMetadata?.reviewedAt || null,
          schedule.reviewMetadata?.decisionRationale || null,
          schedule.reviewMetadata?.clinicianNotes || null,
          now,
          schedule.scheduleId
        );
    } else {
      this.db
        .prepare(
          `INSERT INTO chrono_schedules (
             id, patient_id, status, schedule_json, comparison_json, routine_json,
             reviewed_by, reviewed_at, decision_rationale, clinician_notes, created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          schedule.scheduleId,
          schedule.patientId,
          schedule.status,
          JSON.stringify(schedule),
          JSON.stringify(schedule.comparison),
          JSON.stringify(schedule.patientRoutine),
          schedule.reviewMetadata?.reviewedBy || null,
          schedule.reviewMetadata?.reviewedAt || null,
          schedule.reviewMetadata?.decisionRationale || null,
          schedule.reviewMetadata?.clinicianNotes || null,
          schedule.generatedAt || now,
          now
        );
    }
  }

  getLatestSchedule(patientId: string): DailyScheduleTimeline | null {
    const row = this.db
      .prepare(
        `SELECT schedule_json
         FROM chrono_schedules
         WHERE patient_id = ?
         ORDER BY created_at DESC
         LIMIT 1`
      )
      .get(patientId) as any;

    if (!row) {
      return null;
    }

    try {
      return JSON.parse(row.schedule_json);
    } catch {
      return null;
    }
  }

  getScheduleById(scheduleId: string): DailyScheduleTimeline | null {
    const row = this.db
      .prepare('SELECT schedule_json FROM chrono_schedules WHERE id = ?')
      .get(scheduleId) as any;

    if (!row) {
      return null;
    }

    try {
      return JSON.parse(row.schedule_json);
    } catch {
      return null;
    }
  }

  getScheduleHistory(patientId: string): DailyScheduleTimeline[] {
    const rows = this.db
      .prepare(
        `SELECT schedule_json
         FROM chrono_schedules
         WHERE patient_id = ?
         ORDER BY created_at DESC`
      )
      .all(patientId) as any[];

    const result: DailyScheduleTimeline[] = [];
    for (const r of rows) {
      try {
        result.push(JSON.parse(r.schedule_json));
      } catch {
        // Skip corrupted rows
      }
    }
    return result;
  }

  updateScheduleReview(
    scheduleId: string,
    review: ScheduleReviewMetadata,
    newStatus: ScheduleStatus,
    updatedSchedule?: DailyScheduleTimeline
  ): DailyScheduleTimeline | null {
    const existing = this.getScheduleById(scheduleId);
    if (!existing) {
      return null;
    }

    const modified = updatedSchedule || {
      ...existing,
      status: newStatus,
      reviewMetadata: review,
    };

    modified.status = newStatus;
    modified.reviewMetadata = review;

    this.saveSchedule(modified);
    return modified;
  }
}
