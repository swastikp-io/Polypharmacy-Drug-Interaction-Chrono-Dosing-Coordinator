import { Router } from 'express';
import type { LabMeasurementRepository } from '../repositories/labMeasurementRepository.js';
import type { MedicationRepository } from '../repositories/medicationRepository.js';
import type { PatientRepository } from '../repositories/patientRepository.js';
import type { PharmacokineticConflictEngine } from '../services/interactions/conflictEngine.js';
import type { InteractionExplanationService } from '../services/interactions/explanationService.js';
import { REAL_DATA_SOURCES_GOVERNANCE } from '../services/interactions/referenceDataImporter.js';
import type {
  IDrugReferenceProvider,
  IInteractionEvidenceProvider,
} from '../services/interactions/types.js';
import { getParam } from '../utils/requestUtils.js';

export function createInteractionRouter(
  conflictEngine: PharmacokineticConflictEngine,
  explanationService: InteractionExplanationService,
  drugRefProvider: IDrugReferenceProvider,
  evidenceProvider: IInteractionEvidenceProvider,
  patientRepo: PatientRepository,
  medRepo: MedicationRepository,
  labRepo: LabMeasurementRepository
): Router {
  const router = Router();

  // 1. Evaluate interactions for a stored patient profile
  router.get('/patient/:id', async (req, res, next) => {
    try {
      const patientId = getParam(req, 'id');
      const patient = patientRepo.findById(patientId);

      if (!patient) {
        res.status(404).json({
          success: false,
          error: { code: 'PATIENT_NOT_FOUND', message: `Patient with ID "${patientId}" was not found.` },
        });
        return;
      }

      const medications = medRepo.findByPatientId(patientId);
      const labs = labRepo.findByPatientId(patientId);

      const result = await conflictEngine.evaluateRegimen(patient, medications, labs);

      const explain = req.query.explain === 'true';
      const explanation = explain ? explanationService.generateExplanation(result) : undefined;

      res.status(200).json({
        success: true,
        data: result,
        explanation,
      });
    } catch (err) {
      next(err);
    }
  });

  // 2. Ad-hoc regimen evaluation (e.g. for testing candidate additions or hypothetical regimens)
  router.post('/analyze', async (req, res, next) => {
    try {
      const { patient, medications, labs, explain } = req.body;

      if (!patient || !medications || !Array.isArray(medications)) {
        res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_PAYLOAD',
            message: 'Both "patient" object and "medications" array are required for conflict evaluation.',
          },
        });
        return;
      }

      const result = await conflictEngine.evaluateRegimen(patient, medications, labs || []);
      const explanation = explain ? explanationService.generateExplanation(result) : undefined;

      res.status(200).json({
        success: true,
        data: result,
        explanation,
      });
    } catch (err) {
      next(err);
    }
  });

  // 3. Provider status and dataset metadata
  router.get('/providers/status', (_req, res) => {
    const refAvailable = drugRefProvider.isAvailable();
    const evidenceAvailable = evidenceProvider.isAvailable();

    res.status(200).json({
      success: true,
      data: {
        isAvailable: refAvailable && evidenceAvailable,
        referenceProvider: {
          name: drugRefProvider.name,
          isAvailable: refAvailable,
          metadata: drugRefProvider.getDatasetMetadata(),
        },
        evidenceProvider: {
          name: evidenceProvider.name,
          isAvailable: evidenceAvailable,
          metadata: evidenceProvider.getDatasetMetadata(),
        },
      },
    });
  });

  // 4. Toggle provider outage simulation (testing and clinical safety demo)
  router.post('/providers/toggle-outage', (req, res) => {
    const { active } = req.body;
    const isOutage = typeof active === 'boolean' ? active : true;

    drugRefProvider.setOutageSimulation(isOutage);
    evidenceProvider.setOutageSimulation(isOutage);

    res.status(200).json({
      success: true,
      data: {
        simulatedOutageActive: isOutage,
        message: isOutage
          ? 'Provider simulated outage ACTIVATED. Conflict engine will safely declare provider unavailable and refuse false safety certification.'
          : 'Provider simulated outage DEACTIVATED. Reference providers are operational.',
      },
    });
  });

  // 5. Governance documentation for production data sources
  router.get('/governance/data-sources', (_req, res) => {
    res.status(200).json({
      success: true,
      data: {
        governanceFramework: 'Clinical Decision Support Data Governance & Licensing Audit',
        sources: REAL_DATA_SOURCES_GOVERNANCE,
      },
    });
  });

  return router;
}
