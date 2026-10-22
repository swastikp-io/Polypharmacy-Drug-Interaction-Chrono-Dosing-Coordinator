import { Router } from 'express';
import {
  CreateAllergySchema,
  StatusUpdateSchema,
  UpdateAllergySchema,
} from '../../shared/schemas.js';
import { validateBody } from '../middleware/validate.js';
import type { AllergyRepository } from '../repositories/allergyRepository.js';
import type { AuditService } from '../services/auditService.js';
import { getActorFromRequest, getParam } from '../utils/requestUtils.js';

export function createAllergyRouter(
  allergyRepo: AllergyRepository,
  auditService: AuditService
): Router {
  const router = Router();

  router.get('/patient/:patientId', (req, res) => {
    const patientId = getParam(req, 'patientId');
    const allergies = allergyRepo.findByPatientId(patientId);
    res.json({ success: true, data: allergies });
  });

  router.get('/:id', (req, res) => {
    const id = getParam(req, 'id');
    const allergy = allergyRepo.findById(id);
    if (!allergy) {
      res.status(404).json({
        success: false,
        error: { code: 'ALLERGY_NOT_FOUND', message: `Allergy with ID ${id} not found` },
      });
      return;
    }
    res.json({ success: true, data: allergy });
  });

  router.post('/', validateBody(CreateAllergySchema), (req, res) => {
    const allergy = allergyRepo.create(req.body);
    auditService.logCreate(
      allergy.patientId,
      'allergy',
      allergy.id,
      getActorFromRequest(req),
      `Documented allergy: ${allergy.allergen} (${allergy.reaction})`,
      allergy
    );

    res.status(201).json({ success: true, data: allergy });
  });

  router.put('/:id', validateBody(UpdateAllergySchema), (req, res) => {
    const id = getParam(req, 'id');
    const existing = allergyRepo.findById(id);
    if (!existing) {
      res.status(404).json({
        success: false,
        error: { code: 'ALLERGY_NOT_FOUND', message: `Allergy with ID ${id} not found` },
      });
      return;
    }

    const updated = allergyRepo.update(id, req.body);
    if (updated) {
      auditService.logUpdate(
        updated.patientId,
        'allergy',
        updated.id,
        getActorFromRequest(req),
        `Updated allergy record for ${updated.allergen}`,
        existing,
        updated
      );
    }

    res.json({ success: true, data: updated });
  });

  router.patch('/:id/verification', validateBody(StatusUpdateSchema), (req, res) => {
    const id = getParam(req, 'id');
    const existing = allergyRepo.findById(id);
    if (!existing) {
      res.status(404).json({
        success: false,
        error: { code: 'ALLERGY_NOT_FOUND', message: `Allergy with ID ${id} not found` },
      });
      return;
    }

    const updated = allergyRepo.updateVerificationStatus(id, req.body.verificationStatus);
    if (updated) {
      auditService.logStatusChange(
        updated.patientId,
        'allergy',
        updated.id,
        req.body.actor,
        `Updated allergy verification for ${updated.allergen} to "${req.body.verificationStatus}"`,
        existing.verificationStatus,
        req.body.verificationStatus
      );
    }

    res.json({ success: true, data: updated });
  });

  router.delete('/:id', (req, res) => {
    const id = getParam(req, 'id');
    const existing = allergyRepo.findById(id);
    if (!existing) {
      res.status(404).json({
        success: false,
        error: { code: 'ALLERGY_NOT_FOUND', message: `Allergy with ID ${id} not found` },
      });
      return;
    }

    allergyRepo.delete(id);
    auditService.logDelete(
      existing.patientId,
      'allergy',
      existing.id,
      getActorFromRequest(req),
      `Deleted allergy record for ${existing.allergen}`,
      existing
    );

    res.json({ success: true, message: `Allergy ${existing.allergen} deleted` });
  });

  return router;
}
