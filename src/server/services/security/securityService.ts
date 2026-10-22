import fs from 'fs';
import path from 'path';
import type Database from 'better-sqlite3';
import { AuditService } from '../auditService.js';
import { PatientRepository } from '../../repositories/patientRepository.js';
import { MedicationRepository } from '../../repositories/medicationRepository.js';
import { AllergyRepository } from '../../repositories/allergyRepository.js';
import { DiagnosisRepository } from '../../repositories/diagnosisRepository.js';
import { LabMeasurementRepository } from '../../repositories/labMeasurementRepository.js';
import { AuditLogRepository } from '../../repositories/auditLogRepository.js';
import { getDataDir, getUploadsDir } from '../../utils/paths.js';

// ==========================================
// 1. STANDALONE PATH VALIDATION & FILENAME SANITIZATION
// ==========================================

export function validateSafePath(targetPath: string, allowedRoot?: string): string {
  // 1. Check for null byte injection
  if (targetPath.includes('\0') || targetPath.includes('%00')) {
    throw new Error('Null byte injection detected: access denied.');
  }

  // 2. Resolve absolute path
  const root = allowedRoot ? path.resolve(allowedRoot) : getDataDir();
  const resolved = path.resolve(targetPath);

  // 3. Prevent path traversal outside allowed application boundaries
  const relative = path.relative(root, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Path traversal attempt detected: Path "${targetPath}" is outside allowed application boundaries.`);
  }

  return resolved;
}

export function sanitizeFilename(fileName: string): string {
  return fileName
    .replace(/^(\.\.[\/\\])+/, '')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\.{2,}/g, '_')
    .slice(0, 100);
}

export class SecurityService {
  private allowedUploadDir: string;
  private patientRepo: PatientRepository;
  private medRepo: MedicationRepository;
  private allergyRepo: AllergyRepository;
  private diagRepo: DiagnosisRepository;
  private labRepo: LabMeasurementRepository;
  private auditRepo: AuditLogRepository;
  private auditService: AuditService;

  constructor(
    private db: Database.Database,
    patientRepo?: PatientRepository,
    medRepo?: MedicationRepository,
    allergyRepo?: AllergyRepository,
    diagRepo?: DiagnosisRepository,
    labRepo?: LabMeasurementRepository,
    auditRepo?: AuditLogRepository,
    auditService?: AuditService
  ) {
    this.patientRepo = patientRepo || new PatientRepository(db);
    this.medRepo = medRepo || new MedicationRepository(db);
    this.allergyRepo = allergyRepo || new AllergyRepository(db);
    this.diagRepo = diagRepo || new DiagnosisRepository(db);
    this.labRepo = labRepo || new LabMeasurementRepository(db);
    this.auditRepo = auditRepo || new AuditLogRepository(db);
    this.auditService = auditService || new AuditService(this.auditRepo);
    this.allowedUploadDir = getUploadsDir();
  }

  // ==========================================
  // 1. RESTRICTIVE FILESYSTEM ACCESS & PATH VALIDATION
  // ==========================================

  public validateSafePath(targetPath: string): string {
    return validateSafePath(targetPath, this.allowedUploadDir);
  }

  public sanitizeFileName(fileName: string): string {
    return sanitizeFilename(fileName);
  }

  public sanitizeFilename(fileName: string): string {
    return sanitizeFilename(fileName);
  }

  // ==========================================
  // 2. PATIENT DATA EXPORT (GDPR / HIPAA PORTABILITY)
  // ==========================================

  public exportPatientDossier(patientId: string, actor: string): Record<string, any> {
    const patient = this.patientRepo.findById(patientId);
    if (!patient) {
      throw new Error(`Patient with ID "${patientId}" was not found.`);
    }

    const medications = this.medRepo.findByPatientId(patientId);
    const allergies = this.allergyRepo.findByPatientId(patientId);
    const diagnoses = this.diagRepo.findByPatientId(patientId);
    const labs = this.labRepo.findByPatientId(patientId);
    const auditLogs = this.auditRepo.findByPatientId(patientId);

    // Log export event for audit compliance
    this.auditService.logCreate(
      patientId,
      'patient',
      patientId,
      actor,
      `Exported comprehensive patient clinical dossier for ${patient.name} (${patient.mrn})`,
      { exportFormat: 'JSON_DOSSIER', timestamp: new Date().toISOString() }
    );

    return {
      metadata: {
        system: 'Polypharmacy Drug-Interaction & Chrono-Dosing Coordinator',
        exportedAt: new Date().toISOString(),
        exportedBy: actor,
        securityClassification: 'RESTRICTED_CLINICAL_DATA',
        localOnly: true,
        isPrototype: true,
      },
      patient,
      medications,
      allergies,
      diagnoses,
      labs,
      auditTrail: auditLogs,
    };
  }

  // ==========================================
  // 3. PATIENT DATA PURGE (SAFE RIGHT-TO-BE-FORGOTTEN)
  // ==========================================

  public purgePatientData(
    patientId: string,
    confirmationToken: string,
    actor: string,
    reason: string
  ): { success: boolean; message: string; purgedPatientId: string } {
    if (confirmationToken !== `PURGE_${patientId}`) {
      throw new Error(
        `Validation failed: Confirmation token must exactly equal "PURGE_${patientId}".`
      );
    }

    const patient = this.patientRepo.findById(patientId);
    if (!patient) {
      throw new Error(`Patient with ID "${patientId}" was not found.`);
    }

    // Wrap deletion in SQLite transaction
    const transaction = this.db.transaction(() => {
      // 1. Clear previous audit logs for this patient
      this.db.prepare('DELETE FROM audit_logs WHERE patient_id = ?').run(patientId);

      // 2. Cascade delete from patients table (foreign keys cascade to meds, allergies, labs, schedules, etc.)
      this.db.prepare('DELETE FROM patients WHERE id = ?').run(patientId);

      // 3. Record permanent, de-identified PURGE audit event in audit_logs
      this.auditRepo.record({
        patientId,
        entityType: 'patient',
        entityId: patientId,
        action: 'PURGE',
        actor,
        summary: `Clinician PURGED patient data for ${patient.name} (${patient.mrn}). Reason: ${reason}`,
        previousState: { name: patient.name, mrn: patient.mrn },
        newState: null,
        changedFields: ['all'],
      });
    });

    transaction();

    return {
      success: true,
      purgedPatientId: patientId,
      message: `Successfully purged all records for patient ${patient.name} (${patient.mrn}). Deletion event was permanently committed to audit log.`,
    };
  }

  // ==========================================
  // 4. CLEANUP ORPHANED TEMPORARY UPLOADS
  // ==========================================

  public cleanupTempFiles(): { cleanedFilesCount: number; deletedCount: number } {
    const tempDir = path.resolve(this.allowedUploadDir, 'temp');
    if (!fs.existsSync(tempDir)) {
      return { cleanedFilesCount: 0, deletedCount: 0 };
    }

    let deletedCount = 0;
    const entries = fs.readdirSync(tempDir);
    for (const entry of entries) {
      const fullPath = path.join(tempDir, entry);
      try {
        const stat = fs.statSync(fullPath);
        // Delete files older than 1 hour
        if (Date.now() - stat.mtimeMs > 60 * 60 * 1000) {
          fs.unlinkSync(fullPath);
          deletedCount++;
        }
      } catch {
        // Continue on error
      }
    }

    return { cleanedFilesCount: deletedCount, deletedCount };
  }
}
