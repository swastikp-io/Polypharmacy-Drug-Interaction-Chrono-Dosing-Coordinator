import { Router } from 'express';
import { CreatePatientSchema, UpdatePatientSchema } from '../../shared/schemas.js';
import { validateBody } from '../middleware/validate.js';
import type { PatientRepository } from '../repositories/patientRepository.js';
import type { AuditService } from '../services/auditService.js';
import type { PatientService } from '../services/patientService.js';
import { getActorFromRequest, getParam } from '../utils/requestUtils.js';

export function createPatientRouter(
  patientRepo: PatientRepository,
  patientService: PatientService,
  auditService: AuditService
): Router {
  const router = Router();

  // List all patients
  router.get('/', (_req, res) => {
    const patients = patientRepo.findAll();
    res.json({ success: true, data: patients });
  });

  // Get single patient
  router.get('/:id', (req, res) => {
    const id = getParam(req, 'id');
    const patient = patientRepo.findById(id);
    if (!patient) {
      res.status(404).json({
        success: false,
        error: { code: 'PATIENT_NOT_FOUND', message: `Patient with ID ${id} not found` },
      });
      return;
    }
    res.json({ success: true, data: patient });
  });

  // Get comprehensive patient profile
  router.get('/:id/comprehensive', (req, res) => {
    const id = getParam(req, 'id');
    const profile = patientService.getComprehensiveProfile(id);
    if (!profile) {
      res.status(404).json({
        success: false,
        error: { code: 'PATIENT_NOT_FOUND', message: `Patient with ID ${id} not found` },
      });
      return;
    }
    res.json({ success: true, data: profile });
  });

  // Create patient
  router.post('/', validateBody(CreatePatientSchema), (req, res) => {
    const existing = patientRepo.findByMrn(req.body.mrn);
    if (existing) {
      res.status(409).json({
        success: false,
        error: { code: 'MRN_CONFLICT', message: `Patient with MRN "${req.body.mrn}" already exists` },
      });
      return;
    }

    const patient = patientRepo.create(req.body);
    auditService.logCreate(
      patient.id,
      'patient',
      patient.id,
      getActorFromRequest(req),
      `Registered new patient ${patient.name} (${patient.mrn})`,
      patient
    );

    res.status(201).json({ success: true, data: patient });
  });

  // Update patient
  router.put('/:id', validateBody(UpdatePatientSchema), (req, res) => {
    const id = getParam(req, 'id');
    const existing = patientRepo.findById(id);
    if (!existing) {
      res.status(404).json({
        success: false,
        error: { code: 'PATIENT_NOT_FOUND', message: `Patient with ID ${id} not found` },
      });
      return;
    }

    const updated = patientRepo.update(id, req.body);
    if (updated) {
      auditService.logUpdate(
        updated.id,
        'patient',
        updated.id,
        getActorFromRequest(req),
        `Updated demographic record for ${updated.name}`,
        existing,
        updated
      );
    }

    res.json({ success: true, data: updated });
  });

  // Delete patient
  router.delete('/:id', (req, res) => {
    const id = getParam(req, 'id');
    const existing = patientRepo.findById(id);
    if (!existing) {
      res.status(404).json({
        success: false,
        error: { code: 'PATIENT_NOT_FOUND', message: `Patient with ID ${id} not found` },
      });
      return;
    }

    patientRepo.delete(id);
    auditService.logDelete(
      id,
      'patient',
      id,
      getActorFromRequest(req),
      `Deleted patient record for ${existing.name}`,
      existing
    );

    res.json({ success: true, message: `Patient ${existing.name} deleted` });
  });

  return router;
}
