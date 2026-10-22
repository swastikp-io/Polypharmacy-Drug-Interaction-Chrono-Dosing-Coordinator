import { Router } from 'express';
import type { SecurityService } from '../services/security/securityService.js';
import type { PatientRepository } from '../repositories/patientRepository.js';
import { getActorFromRequest, getParam } from '../utils/requestUtils.js';

export function createGovernanceRouter(
  securityService: SecurityService,
  patientRepo: PatientRepository
): Router {
  const router = Router();

  // 1. Export Full Patient Dossier (JSON / Clinical Portability)
  router.get('/patient/:patientId/export', async (req, res, next) => {
    try {
      const patientId = getParam(req, 'patientId');
      const actor = getActorFromRequest(req);

      const patient = patientRepo.findById(patientId);
      if (!patient) {
        res.status(404).json({
          success: false,
          error: { code: 'PATIENT_NOT_FOUND', message: `Patient "${patientId}" not found.` },
        });
        return;
      }

      const dossier = securityService.exportPatientDossier(patientId, actor);

      res.setHeader('Content-Type', 'application/json');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="patient_dossier_${patientId}.json"`
      );
      res.status(200).send(JSON.stringify(dossier, null, 2));
    } catch (err) {
      next(err);
    }
  });

  // 2. Safe Patient Data Purge (Guarded by confirmationToken)
  router.post('/patient/:patientId/purge', async (req, res, next) => {
    try {
      const patientId = getParam(req, 'patientId');
      const actor = req.body.actor || getActorFromRequest(req);
      const { confirmationToken, reason } = req.body;

      if (!confirmationToken) {
        res.status(400).json({
          success: false,
          error: `Validation failed: Confirmation token "PURGE_${patientId}" is required.`,
        });
        return;
      }

      if (!reason || reason.trim().length < 5) {
        res.status(400).json({
          success: false,
          error: 'Validation failed: A clinical or administrative reason of at least 5 characters is required.',
        });
        return;
      }

      const result = securityService.purgePatientData(patientId, confirmationToken, actor, reason);

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err: any) {
      if (err.message.includes('not found')) {
        res.status(404).json({
          success: false,
          error: { code: 'PATIENT_NOT_FOUND', message: err.message },
        });
        return;
      }
      if (err.message.includes('Validation failed') || err.message.includes('Invalid confirmation token')) {
        res.status(400).json({
          success: false,
          error: err.message,
        });
        return;
      }
      next(err);
    }
  });

  // 3. Clean temporary uploads
  router.post('/maintenance/cleanup-temp', async (req, res, next) => {
    try {
      const result = securityService.cleanupTempFiles();
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
