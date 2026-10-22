import { Router } from 'express';
import type { ChronoService } from '../services/chrono/chronoService.js';
import type { PatientRepository } from '../repositories/patientRepository.js';
import {
  PatientRoutineSchema,
  ScheduleReviewSubmissionSchema,
} from '../../shared/chronoSchemas.js';
import { getActorFromRequest, getParam } from '../utils/requestUtils.js';

export function createChronoRouter(
  chronoService: ChronoService,
  patientRepo: PatientRepository
): Router {
  const router = Router();

  // 1. Get or Generate Draft Circadian Schedule
  router.get('/patient/:patientId/draft', async (req, res, next) => {
    try {
      const patientId = getParam(req, 'patientId');
      const patient = patientRepo.findById(patientId);
      if (!patient) {
        res.status(404).json({
          success: false,
          error: { code: 'PATIENT_NOT_FOUND', message: `Patient with ID "${patientId}" was not found.` },
        });
        return;
      }

      const forceNew = req.query.fresh === 'true';

      const schedule = forceNew
        ? chronoService.generateDraftSchedule(patientId)
        : chronoService.getLatestSchedule(patientId);

      res.json({
        success: true,
        data: schedule,
      });
    } catch (err) {
      next(err);
    }
  });

  // 2. Get Patient Routine
  router.get('/patient/:patientId/routine', async (req, res, next) => {
    try {
      const patientId = getParam(req, 'patientId');
      const patient = patientRepo.findById(patientId);
      if (!patient) {
        res.status(404).json({
          success: false,
          error: { code: 'PATIENT_NOT_FOUND', message: `Patient with ID "${patientId}" was not found.` },
        });
        return;
      }

      const routine = chronoService.getPatientRoutine(patientId);

      res.json({
        success: true,
        data: routine,
      });
    } catch (err) {
      next(err);
    }
  });

  // 3. Update Patient Routine (and Recalculate Draft Schedule)
  router.put('/patient/:patientId/routine', async (req, res, next) => {
    try {
      const patientId = getParam(req, 'patientId');
      const patient = patientRepo.findById(patientId);
      if (!patient) {
        res.status(404).json({
          success: false,
          error: { code: 'PATIENT_NOT_FOUND', message: `Patient with ID "${patientId}" was not found.` },
        });
        return;
      }

      const actor = getActorFromRequest(req);
      const parsed = PatientRoutineSchema.partial().parse(req.body);
      const result = chronoService.updatePatientRoutine(patientId, parsed, actor);

      res.json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  });

  // 4. Submit Clinician Review of Schedule (Accept / Reject / Modify)
  router.post('/patient/:patientId/review', async (req, res, next) => {
    try {
      const patientId = getParam(req, 'patientId');
      const patient = patientRepo.findById(patientId);
      if (!patient) {
        res.status(404).json({
          success: false,
          error: { code: 'PATIENT_NOT_FOUND', message: `Patient with ID "${patientId}" was not found.` },
        });
        return;
      }

      const actor = getActorFromRequest(req);
      const scheduleId = req.body.scheduleId;

      if (!scheduleId) {
        res.status(400).json({
          success: false,
          error: { code: 'MISSING_SCHEDULE_ID', message: 'scheduleId is required in request body' },
        });
        return;
      }

      const parsed = ScheduleReviewSubmissionSchema.parse({
        ...req.body,
        actor: req.body.actor || actor,
      });

      const updatedSchedule = chronoService.reviewSchedule(patientId, scheduleId, parsed);

      res.json({
        success: true,
        data: updatedSchedule,
      });
    } catch (err) {
      next(err);
    }
  });

  // 5. Get Schedule History & Audit Trail
  router.get('/patient/:patientId/history', async (req, res, next) => {
    try {
      const patientId = getParam(req, 'patientId');
      const patient = patientRepo.findById(patientId);
      if (!patient) {
        res.status(404).json({
          success: false,
          error: { code: 'PATIENT_NOT_FOUND', message: `Patient with ID "${patientId}" was not found.` },
        });
        return;
      }

      const history = chronoService.getScheduleHistory(patientId);

      res.json({
        success: true,
        data: history,
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
