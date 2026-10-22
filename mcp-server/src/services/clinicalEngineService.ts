import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';
import { initializeSchema } from '../../../src/server/db/database.js';
import { seedSyntheticData } from '../../../src/server/db/seeds.js';
import {
  getProjectRoot,
  getDataDir,
  getDatabasePath,
  ensureDirectory,
} from '../../../src/server/utils/paths.js';
import { PatientRepository } from '../../../src/server/repositories/patientRepository.js';
import { MedicationRepository } from '../../../src/server/repositories/medicationRepository.js';
import { AllergyRepository } from '../../../src/server/repositories/allergyRepository.js';
import { DiagnosisRepository } from '../../../src/server/repositories/diagnosisRepository.js';
import { LabMeasurementRepository } from '../../../src/server/repositories/labMeasurementRepository.js';
import { AuditLogRepository } from '../../../src/server/repositories/auditLogRepository.js';
import { ChronoRepository } from '../../../src/server/repositories/chronoRepository.js';
import { AuditService } from '../../../src/server/services/auditService.js';
import { ChronoService } from '../../../src/server/services/chrono/chronoService.js';
import { CircadianScheduleCoordinator } from '../../../src/server/services/chrono/scheduleCoordinator.js';
import { PharmacokineticConflictEngine } from '../../../src/server/services/interactions/conflictEngine.js';
import { LocalDrugReferenceProvider } from '../../../src/server/services/interactions/referenceDataProvider.js';
import { LocalInteractionEvidenceProvider } from '../../../src/server/services/interactions/interactionEvidenceProvider.js';
import { LocalOCREngine } from '../../../src/server/services/ocr/ocrEngine.js';
import { OCRExtractionService } from '../../../src/server/services/ocr/ocrExtractionService.js';
import { LocalRxNormTerminologyProvider } from '../../../src/server/services/ocr/terminologyProvider.js';
import { DrugNormalizationService } from '../../../src/server/services/ocr/normalizationService.js';
import { WorkflowCoordinator } from '../../../src/server/services/orchestration/workflowCoordinator.js';
import {
  SecurityService,
  validateSafePath,
  sanitizeFilename,
} from '../../../src/server/services/security/securityService.js';

export class ClinicalEngineService {
  private static instance: ClinicalEngineService | null = null;

  public readonly db: Database.Database;
  public readonly patientRepo: PatientRepository;
  public readonly medRepo: MedicationRepository;
  public readonly allergyRepo: AllergyRepository;
  public readonly diagRepo: DiagnosisRepository;
  public readonly labRepo: LabMeasurementRepository;
  public readonly auditRepo: AuditLogRepository;
  public readonly chronoRepo: ChronoRepository;

  public readonly auditService: AuditService;
  public readonly chronoService: ChronoService;
  public readonly chronoCoordinator: CircadianScheduleCoordinator;
  public readonly drugReferenceProvider: LocalDrugReferenceProvider;
  public readonly interactionEvidenceProvider: LocalInteractionEvidenceProvider;
  public readonly conflictEngine: PharmacokineticConflictEngine;
  public readonly ocrEngine: LocalOCREngine;
  public readonly ocrExtractionService: OCRExtractionService;
  public readonly terminologyProvider: LocalRxNormTerminologyProvider;
  public readonly ocrNormalizationService: DrugNormalizationService;
  public readonly workflowCoordinator: WorkflowCoordinator;
  public readonly securityService: SecurityService;

  public readonly repositoryRoot: string;
  public readonly allowedUploadDir: string;

  constructor(customDb?: Database.Database) {
    this.repositoryRoot = getProjectRoot();
    this.allowedUploadDir = getDataDir();

    if (customDb) {
      this.db = customDb;
    } else {
      const dbPath = getDatabasePath();
      if (dbPath !== ':memory:') {
        ensureDirectory(path.dirname(dbPath));
      }

      this.db = new Database(dbPath);
      this.db.pragma('journal_mode = WAL');
      this.db.pragma('foreign_keys = ON');
    }

    // Ensure schema and seeds are loaded
    initializeSchema(this.db);
    const countCheck = this.db.prepare('SELECT count(*) as c FROM patients').get() as { c: number };
    if (!countCheck || countCheck.c === 0) {
      seedSyntheticData(this.db);
    }

    // Repositories
    this.patientRepo = new PatientRepository(this.db);
    this.medRepo = new MedicationRepository(this.db);
    this.allergyRepo = new AllergyRepository(this.db);
    this.diagRepo = new DiagnosisRepository(this.db);
    this.labRepo = new LabMeasurementRepository(this.db);
    this.auditRepo = new AuditLogRepository(this.db);
    this.chronoRepo = new ChronoRepository(this.db);

    // Services
    this.auditService = new AuditService(this.auditRepo);
    this.chronoService = new ChronoService(
      this.patientRepo,
      this.medRepo,
      this.chronoRepo,
      this.auditService
    );
    this.chronoCoordinator = new CircadianScheduleCoordinator();

    this.drugReferenceProvider = new LocalDrugReferenceProvider();
    this.interactionEvidenceProvider = new LocalInteractionEvidenceProvider();
    this.conflictEngine = new PharmacokineticConflictEngine(
      this.drugReferenceProvider,
      this.interactionEvidenceProvider
    );

    this.ocrEngine = new LocalOCREngine();
    this.ocrExtractionService = new OCRExtractionService();
    this.terminologyProvider = new LocalRxNormTerminologyProvider();
    this.ocrNormalizationService = new DrugNormalizationService(
      this.ocrExtractionService,
      this.terminologyProvider,
      this.medRepo
    );

    this.workflowCoordinator = new WorkflowCoordinator(
      this.patientRepo,
      this.medRepo,
      this.labRepo,
      this.auditService,
      this.conflictEngine,
      this.chronoCoordinator,
      this.chronoService,
      this.ocrNormalizationService
    );

    this.securityService = new SecurityService(
      this.db,
      this.patientRepo,
      this.medRepo,
      this.allergyRepo,
      this.diagRepo,
      this.labRepo,
      this.auditRepo,
      this.auditService
    );
  }

  public static getInstance(): ClinicalEngineService {
    if (!ClinicalEngineService.instance) {
      ClinicalEngineService.instance = new ClinicalEngineService();
    }
    return ClinicalEngineService.instance;
  }

  public static createWithDb(db: Database.Database): ClinicalEngineService {
    return new ClinicalEngineService(db);
  }

  public validateSafePath(targetPath: string): string {
    return validateSafePath(targetPath, this.allowedUploadDir);
  }

  public sanitizeFilename(fileName: string): string {
    return sanitizeFilename(fileName);
  }
}
