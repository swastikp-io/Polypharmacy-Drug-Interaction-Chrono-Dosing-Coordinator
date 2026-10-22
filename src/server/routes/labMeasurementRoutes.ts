import { Router } from 'express';
import {
  CreateLabMeasurementSchema,
  StatusUpdateSchema,
  UpdateLabMeasurementSchema,
} from '../../shared/schemas.js';
import { validateBody } from '../middleware/validate.js';
import type { LabMeasurementRepository } from '../repositories/labMeasurementRepository.js';
import type { AuditService } from '../services/auditService.js';
import { getActorFromRequest, getParam } from '../utils/requestUtils.js';

export function createLabMeasurementRouter(
  labRepo: LabMeasurementRepository,
  auditService: AuditService
): Router {
  const router = Router();

  router.get('/patient/:patientId', (req, res) => {
    const patientId = getParam(req, 'patientId');
    const labs = labRepo.findByPatientId(patientId);
    res.json({ success: true, data: labs });
  });

  router.get('/:id', (req, res) => {
    const id = getParam(req, 'id');
    const lab = labRepo.findById(id);
    if (!lab) {
      res.status(404).json({
        success: false,
        error: { code: 'LAB_NOT_FOUND', message: `Lab measurement with ID ${id} not found` },
      });
      return;
    }
    res.json({ success: true, data: lab });
  });

  router.post('/', validateBody(CreateLabMeasurementSchema), (req, res) => {
    const lab = labRepo.create(req.body);
    auditService.logCreate(
      lab.patientId,
      'lab_measurement',
      lab.id,
      getActorFromRequest(req),
      `Recorded lab: ${lab.testName} = ${lab.value} ${lab.unit}`,
      lab
    );

    res.status(201).json({ success: true, data: lab });
  });

  router.put('/:id', validateBody(UpdateLabMeasurementSchema), (req, res) => {
    const id = getParam(req, 'id');
    const existing = labRepo.findById(id);
    if (!existing) {
      res.status(404).json({
        success: false,
        error: { code: 'LAB_NOT_FOUND', message: `Lab measurement with ID ${id} not found` },
      });
      return;
    }

    const updated = labRepo.update(id, req.body);
    if (updated) {
      auditService.logUpdate(
        updated.patientId,
        'lab_measurement',
        updated.id,
        getActorFromRequest(req),
        `Updated lab result for ${updated.testName}`,
        existing,
        updated
      );
    }

    res.json({ success: true, data: updated });
  });

  router.patch('/:id/verification', validateBody(StatusUpdateSchema), (req, res) => {
    const id = getParam(req, 'id');
    const existing = labRepo.findById(id);
    if (!existing) {
      res.status(404).json({
        success: false,
        error: { code: 'LAB_NOT_FOUND', message: `Lab measurement with ID ${id} not found` },
      });
      return;
    }

    const updated = labRepo.updateVerificationStatus(id, req.body.verificationStatus);
    if (updated) {
      auditService.logStatusChange(
        updated.patientId,
        'lab_measurement',
        updated.id,
        req.body.actor,
        `Updated lab verification for ${updated.testName} to "${req.body.verificationStatus}"`,
        existing.verificationStatus,
        req.body.verificationStatus
      );
    }

    res.json({ success: true, data: updated });
  });

  router.delete('/:id', (req, res) => {
    const id = getParam(req, 'id');
    const existing = labRepo.findById(id);
    if (!existing) {
      res.status(404).json({
        success: false,
        error: { code: 'LAB_NOT_FOUND', message: `Lab measurement with ID ${id} not found` },
      });
      return;
    }

    labRepo.delete(id);
    auditService.logDelete(
      existing.patientId,
      'lab_measurement',
      existing.id,
      getActorFromRequest(req),
      `Deleted lab measurement ${existing.testName}`,
      existing
    );

    res.json({ success: true, message: `Lab ${existing.testName} deleted` });
  });

  return router;
}
