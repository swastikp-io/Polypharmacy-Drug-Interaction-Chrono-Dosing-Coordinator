import cors from 'cors';
import express, { type Express } from 'express';
import type Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { getProjectRoot } from './utils/paths.js';
import { errorHandler } from './middleware/errorHandler.js';
import { AllergyRepository } from './repositories/allergyRepository.js';
import { AuditLogRepository } from './repositories/auditLogRepository.js';
import { ChronoRepository } from './repositories/chronoRepository.js';
import { DiagnosisRepository } from './repositories/diagnosisRepository.js';
import { LabMeasurementRepository } from './repositories/labMeasurementRepository.js';
import { MedicationRepository } from './repositories/medicationRepository.js';
import { PatientRepository } from './repositories/patientRepository.js';
import { createAgentRouter } from './routes/agentRoutes.js';
import { createAllergyRouter } from './routes/allergyRoutes.js';
import { createAuditRouter } from './routes/auditRoutes.js';
import { createChronoRouter } from './routes/chronoRoutes.js';
import { createDiagnosisRouter } from './routes/diagnosisRoutes.js';
import { createGovernanceRouter } from './routes/governanceRoutes.js';
import { createInteractionRouter } from './routes/interactionRoutes.js';
import { createLabMeasurementRouter } from './routes/labMeasurementRoutes.js';
import { createMedicationRouter } from './routes/medicationRoutes.js';
import { createOCRRouter } from './routes/ocrRoutes.js';
import { createOrchestrationRouter } from './routes/orchestrationRoutes.js';
import { createPatientRouter } from './routes/patientRoutes.js';
import { ChronoDosingAgentService } from './services/agents/chronoDosingAgent.js';
import { DrugInteractionAgentService } from './services/agents/drugInteractionAgent.js';
import { RenalHepaticDosingAgentService } from './services/agents/renalHepaticDosingAgent.js';
import { AuditService } from './services/auditService.js';
import { PharmacokineticConflictEngine } from './services/interactions/conflictEngine.js';
import { InteractionExplanationService } from './services/interactions/explanationService.js';
import { LocalInteractionEvidenceProvider } from './services/interactions/interactionEvidenceProvider.js';
import { LocalDrugReferenceProvider } from './services/interactions/referenceDataProvider.js';
import { FileStorageService } from './services/ocr/fileStorageService.js';
import { DrugNormalizationService } from './services/ocr/normalizationService.js';
import { LocalOCREngine } from './services/ocr/ocrEngine.js';
import { OCRExtractionService } from './services/ocr/ocrExtractionService.js';
import { LocalRxNormTerminologyProvider } from './services/ocr/terminologyProvider.js';
import { PatientService } from './services/patientService.js';
import { ChronoService } from './services/chrono/chronoService.js';
import { CircadianScheduleCoordinator } from './services/chrono/scheduleCoordinator.js';
import { WorkflowCoordinator } from './services/orchestration/workflowCoordinator.js';
import { SecurityService } from './services/security/securityService.js';
import { McpToolService } from './services/mcp/mcpToolService.js';

export function createApp(database: Database.Database): Express {
  const app = express();

  app.use(cors());
  app.use(express.json());

  // Repositories
  const patientRepo = new PatientRepository(database);
  const medRepo = new MedicationRepository(database);
  const allergyRepo = new AllergyRepository(database);
  const diagRepo = new DiagnosisRepository(database);
  const labRepo = new LabMeasurementRepository(database);
  const auditRepo = new AuditLogRepository(database);
  const chronoRepo = new ChronoRepository(database);

  // Services
  const auditService = new AuditService(auditRepo);
  const patientService = new PatientService(
    patientRepo,
    medRepo,
    allergyRepo,
    diagRepo,
    labRepo,
    auditRepo
  );
  const chronoService = new ChronoService(
    patientRepo,
    medRepo,
    chronoRepo,
    auditService
  );

  // Agent Services
  const drugInteractionAgent = new DrugInteractionAgentService();
  const chronoDosingAgent = new ChronoDosingAgentService();
  const renalHepaticAgent = new RenalHepaticDosingAgentService();

  // OCR & Normalization Services
  const ocrEngine = new LocalOCREngine();
  const terminologyProvider = new LocalRxNormTerminologyProvider();
  const ocrExtractionService = new OCRExtractionService();
  const normalizationService = new DrugNormalizationService(
    ocrExtractionService,
    terminologyProvider,
    medRepo
  );
  const fileStorageService = new FileStorageService();

  // Phase 3: Pharmacokinetic Conflict Engine & Evidence Providers
  const drugRefProvider = new LocalDrugReferenceProvider();
  const interactionEvidenceProvider = new LocalInteractionEvidenceProvider();
  const conflictEngine = new PharmacokineticConflictEngine(
    drugRefProvider,
    interactionEvidenceProvider
  );
  const interactionExplanationService = new InteractionExplanationService();

  // Phase 4: Circadian Schedule Coordinator Service
  const chronoCoordinator = new CircadianScheduleCoordinator();

  // Phase 5: Agent Workflow Coordinator
  const workflowCoordinator = new WorkflowCoordinator(
    patientRepo,
    medRepo,
    labRepo,
    auditService,
    conflictEngine,
    chronoCoordinator,
    chronoService,
    normalizationService,
    fileStorageService,
    ocrEngine
  );

  // Phase 6: Safety, Security & MCP Tools Services
  const securityService = new SecurityService(
    database,
    patientRepo,
    medRepo,
    allergyRepo,
    diagRepo,
    labRepo,
    auditRepo,
    auditService
  );

  const mcpToolService = new McpToolService(
    patientRepo,
    medRepo,
    labRepo,
    diagRepo,
    auditService,
    conflictEngine,
    chronoCoordinator,
    chronoService,
    workflowCoordinator
  );

  // Healthcheck
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'healthy',
      service: 'Polypharmacy Drug-Interaction & Chrono-Dosing Coordinator API',
      timestamp: new Date().toISOString(),
    });
  });

  // Mount API routers
  app.use('/api/patients', createPatientRouter(patientRepo, patientService, auditService));
  app.use('/api/medications', createMedicationRouter(medRepo, auditService));
  app.use('/api/allergies', createAllergyRouter(allergyRepo, auditService));
  app.use('/api/diagnoses', createDiagnosisRouter(diagRepo, auditService));
  app.use('/api/labs', createLabMeasurementRouter(labRepo, auditService));
  app.use('/api/audit', createAuditRouter(auditRepo));
  app.use(
    '/api/ocr',
    createOCRRouter(
      ocrEngine,
      normalizationService,
      fileStorageService,
      medRepo,
      auditService,
      terminologyProvider
    )
  );
  app.use(
    '/api/interactions',
    createInteractionRouter(
      conflictEngine,
      interactionExplanationService,
      drugRefProvider,
      interactionEvidenceProvider,
      patientRepo,
      medRepo,
      labRepo
    )
  );
  app.use('/api/chrono', createChronoRouter(chronoService, patientRepo));
  app.use(
    '/api/orchestration',
    createOrchestrationRouter(workflowCoordinator, mcpToolService, patientRepo)
  );
  app.use('/api/governance', createGovernanceRouter(securityService, patientRepo));
  app.use(
    '/api/agents',
    createAgentRouter(
      patientRepo,
      medRepo,
      allergyRepo,
      labRepo,
      drugInteractionAgent,
      chronoDosingAgent,
      renalHepaticAgent
    )
  );

  // 404 handler for unknown API routes
  app.use('/api/*', (req, res) => {
    res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: `Route ${req.originalUrl} not found` },
    });
  });

  // Serve production client build if available
  const distDir = path.resolve(getProjectRoot(), 'dist');
  if (fs.existsSync(path.join(distDir, 'index.html'))) {
    app.use(express.static(distDir));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api')) {
        return next();
      }
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  // Global Error Handler
  app.use(errorHandler);

  return app;
}
