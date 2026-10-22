import { Router } from 'express';
import {
  CreateMedicationSchema,
  StatusUpdateSchema,
  UpdateMedicationSchema,
} from '../../shared/schemas.js';
import { validateBody } from '../middleware/validate.js';
import type { MedicationRepository } from '../repositories/medicationRepository.js';
import type { AuditService } from '../services/auditService.js';
import { getActorFromRequest, getParam } from '../utils/requestUtils.js';

export function createMedicationRouter(
  medRepo: MedicationRepository,
  auditService: AuditService
): Router {
  const router = Router();

  // Get medications for patient
  router.get('/patient/:patientId', (req, res) => {
    const patientId = getParam(req, 'patientId');
    const meds = medRepo.findByPatientId(patientId);
    res.json({ success: true, data: meds });
  });

  // Get single medication
  router.get('/:id', (req, res) => {
    const id = getParam(req, 'id');
    const med = medRepo.findById(id);
    if (!med) {
      res.status(404).json({
        success: false,
        error: { code: 'MEDICATION_NOT_FOUND', message: `Medication with ID ${id} not found` },
      });
      return;
    }
    res.json({ success: true, data: med });
  });

  // Create medication
  router.post('/', validateBody(CreateMedicationSchema), (req, res) => {
    const med = medRepo.create(req.body);
    auditService.logCreate(
      med.patientId,
      'medication',
      med.id,
      getActorFromRequest(req),
      `Added medication: ${med.brand} (${med.genericName}) [${med.prescribedDose}]`,
      med
    );

    res.status(201).json({ success: true, data: med });
  });

  // Update medication
  router.put('/:id', validateBody(UpdateMedicationSchema), (req, res) => {
    const id = getParam(req, 'id');
    const existing = medRepo.findById(id);
    if (!existing) {
      res.status(404).json({
        success: false,
        error: { code: 'MEDICATION_NOT_FOUND', message: `Medication with ID ${id} not found` },
      });
      return;
    }

    const updated = medRepo.update(id, req.body);
    if (updated) {
      auditService.logUpdate(
        updated.patientId,
        'medication',
        updated.id,
        getActorFromRequest(req),
        `Updated medication ${updated.brand} (${updated.genericName})`,
        existing,
        updated
      );
    }

    res.json({ success: true, data: updated });
  });

  // Patch verification status
  router.patch('/:id/verification', validateBody(StatusUpdateSchema), (req, res) => {
    const id = getParam(req, 'id');
    const existing = medRepo.findById(id);
    if (!existing) {
      res.status(404).json({
        success: false,
        error: { code: 'MEDICATION_NOT_FOUND', message: `Medication with ID ${id} not found` },
      });
      return;
    }

    const updated = medRepo.updateVerificationStatus(id, req.body.verificationStatus);
    if (updated) {
      auditService.logStatusChange(
        updated.patientId,
        'medication',
        updated.id,
        req.body.actor,
        `Changed verification status of ${updated.brand} to "${req.body.verificationStatus}"${req.body.reason ? `: ${req.body.reason}` : ''}`,
        existing.verificationStatus,
        req.body.verificationStatus
      );
    }

    res.json({ success: true, data: updated });
  });

  // Delete medication
  router.delete('/:id', (req, res) => {
    const id = getParam(req, 'id');
    const existing = medRepo.findById(id);
    if (!existing) {
      res.status(404).json({
        success: false,
        error: { code: 'MEDICATION_NOT_FOUND', message: `Medication with ID ${id} not found` },
      });
      return;
    }

    medRepo.delete(id);
    auditService.logDelete(
      existing.patientId,
      'medication',
      existing.id,
      getActorFromRequest(req),
      `Removed medication ${existing.brand} (${existing.genericName})`,
      existing
    );

    res.json({ success: true, message: `Medication ${existing.brand} removed` });
  });

  return router;
}
