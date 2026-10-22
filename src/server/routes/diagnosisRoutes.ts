import { Router } from 'express';
import {
  CreateDiagnosisSchema,
  StatusUpdateSchema,
  UpdateDiagnosisSchema,
} from '../../shared/schemas.js';
import { validateBody } from '../middleware/validate.js';
import type { DiagnosisRepository } from '../repositories/diagnosisRepository.js';
import type { AuditService } from '../services/auditService.js';
import { getActorFromRequest, getParam } from '../utils/requestUtils.js';

export function createDiagnosisRouter(
  diagRepo: DiagnosisRepository,
  auditService: AuditService
): Router {
  const router = Router();

  router.get('/patient/:patientId', (req, res) => {
    const patientId = getParam(req, 'patientId');
    const diagnoses = diagRepo.findByPatientId(patientId);
    res.json({ success: true, data: diagnoses });
  });

  router.get('/:id', (req, res) => {
    const id = getParam(req, 'id');
    const diag = diagRepo.findById(id);
    if (!diag) {
      res.status(404).json({
        success: false,
        error: { code: 'DIAGNOSIS_NOT_FOUND', message: `Diagnosis with ID ${id} not found` },
      });
      return;
    }
    res.json({ success: true, data: diag });
  });

  router.post('/', validateBody(CreateDiagnosisSchema), (req, res) => {
    const diag = diagRepo.create(req.body);
    auditService.logCreate(
      diag.patientId,
      'diagnosis',
      diag.id,
      getActorFromRequest(req),
      `Documented diagnosis: ${diag.condition} (${diag.code})`,
      diag
    );

    res.status(201).json({ success: true, data: diag });
  });

  router.put('/:id', validateBody(UpdateDiagnosisSchema), (req, res) => {
    const id = getParam(req, 'id');
    const existing = diagRepo.findById(id);
    if (!existing) {
      res.status(404).json({
        success: false,
        error: { code: 'DIAGNOSIS_NOT_FOUND', message: `Diagnosis with ID ${id} not found` },
      });
      return;
    }

    const updated = diagRepo.update(id, req.body);
    if (updated) {
      auditService.logUpdate(
        updated.patientId,
        'diagnosis',
        updated.id,
        getActorFromRequest(req),
        `Updated diagnosis: ${updated.condition}`,
        existing,
        updated
      );
    }

    res.json({ success: true, data: updated });
  });

  router.patch('/:id/verification', validateBody(StatusUpdateSchema), (req, res) => {
    const id = getParam(req, 'id');
    const existing = diagRepo.findById(id);
    if (!existing) {
      res.status(404).json({
        success: false,
        error: { code: 'DIAGNOSIS_NOT_FOUND', message: `Diagnosis with ID ${id} not found` },
      });
      return;
    }

    const updated = diagRepo.updateVerificationStatus(id, req.body.verificationStatus);
    if (updated) {
      auditService.logStatusChange(
        updated.patientId,
        'diagnosis',
        updated.id,
        req.body.actor,
        `Updated diagnosis verification for ${updated.condition} to "${req.body.verificationStatus}"`,
        existing.verificationStatus,
        req.body.verificationStatus
      );
    }

    res.json({ success: true, data: updated });
  });

  router.delete('/:id', (req, res) => {
    const id = getParam(req, 'id');
    const existing = diagRepo.findById(id);
    if (!existing) {
      res.status(404).json({
        success: false,
        error: { code: 'DIAGNOSIS_NOT_FOUND', message: `Diagnosis with ID ${id} not found` },
      });
      return;
    }

    diagRepo.delete(id);
    auditService.logDelete(
      existing.patientId,
      'diagnosis',
      existing.id,
      getActorFromRequest(req),
      `Deleted diagnosis ${existing.condition}`,
      existing
    );

    res.json({ success: true, message: `Diagnosis ${existing.condition} deleted` });
  });

  return router;
}
