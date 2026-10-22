import { Router } from 'express';
import type { AllergyRepository } from '../repositories/allergyRepository.js';
import type { LabMeasurementRepository } from '../repositories/labMeasurementRepository.js';
import type { MedicationRepository } from '../repositories/medicationRepository.js';
import type { PatientRepository } from '../repositories/patientRepository.js';
import type { ChronoDosingAgentService } from '../services/agents/chronoDosingAgent.js';
import type { DrugInteractionAgentService } from '../services/agents/drugInteractionAgent.js';
import type { RenalHepaticDosingAgentService } from '../services/agents/renalHepaticDosingAgent.js';
import { getParam } from '../utils/requestUtils.js';

export function createAgentRouter(
  patientRepo: PatientRepository,
  medRepo: MedicationRepository,
  allergyRepo: AllergyRepository,
  labRepo: LabMeasurementRepository,
  drugInteractionAgent: DrugInteractionAgentService,
  chronoDosingAgent: ChronoDosingAgentService,
  renalHepaticAgent: RenalHepaticDosingAgentService
): Router {
  const router = Router();

  // Agent 1: Drug Interaction & Duplicate Ingredient Analysis
  router.get('/interactions/:patientId', async (req, res, next) => {
    try {
      const patientId = getParam(req, 'patientId');
      const patient = patientRepo.findById(patientId);
      if (!patient) {
        res.status(404).json({
          success: false,
          error: { code: 'PATIENT_NOT_FOUND', message: `Patient ${patientId} not found` },
        });
        return;
      }

      const medications = medRepo.findByPatientId(patientId);
      const allergies = allergyRepo.findByPatientId(patientId);

      const result = await drugInteractionAgent.analyzeInteractions({
        patient,
        medications,
        allergies,
      });

      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  });

  // Agent 2: Chrono-Dosing & Schedule Coordination
  router.get('/chrono-dosing/:patientId', async (req, res, next) => {
    try {
      const patientId = getParam(req, 'patientId');
      const patient = patientRepo.findById(patientId);
      if (!patient) {
        res.status(404).json({
          success: false,
          error: { code: 'PATIENT_NOT_FOUND', message: `Patient ${patientId} not found` },
        });
        return;
      }

      const medications = medRepo.findByPatientId(patientId);

      const result = await chronoDosingAgent.generateSchedule({
        patient,
        medications,
      });

      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  });

  // Agent 3: Renal & Hepatic Organ Clearance / Deprescribing Coordinator
  router.get('/organ-clearance/:patientId', async (req, res, next) => {
    try {
      const patientId = getParam(req, 'patientId');
      const patient = patientRepo.findById(patientId);
      if (!patient) {
        res.status(404).json({
          success: false,
          error: { code: 'PATIENT_NOT_FOUND', message: `Patient ${patientId} not found` },
        });
        return;
      }

      const medications = medRepo.findByPatientId(patientId);
      const labMeasurements = labRepo.findByPatientId(patientId);

      const result = await renalHepaticAgent.evaluateClearanceAndDosing({
        patient,
        medications,
        labMeasurements,
      });

      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
