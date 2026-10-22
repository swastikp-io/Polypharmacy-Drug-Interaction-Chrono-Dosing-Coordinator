import { Router } from 'express';
import type { AuditLogRepository } from '../repositories/auditLogRepository.js';
import { getParam } from '../utils/requestUtils.js';

export function createAuditRouter(auditRepo: AuditLogRepository): Router {
  const router = Router();

  router.get('/patient/:patientId', (req, res) => {
    const patientId = getParam(req, 'patientId');
    const logs = auditRepo.findByPatientId(patientId);
    res.json({ success: true, data: logs });
  });

  return router;
}
