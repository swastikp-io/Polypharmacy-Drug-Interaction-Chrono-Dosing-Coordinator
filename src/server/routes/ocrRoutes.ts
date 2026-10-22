import { Router } from 'express';
import multer from 'multer';
import { ReconcileCandidateMedicationSchema } from '../../shared/ocrSchemas.js';
import { validateBody } from '../middleware/validate.js';
import type { MedicationRepository } from '../repositories/medicationRepository.js';
import type { AuditService } from '../services/auditService.js';
import type { FileStorageService } from '../services/ocr/fileStorageService.js';
import type { DrugNormalizationService } from '../services/ocr/normalizationService.js';
import type { LocalOCREngine } from '../services/ocr/ocrEngine.js';
import type { IDrugTerminologyProvider } from '../../shared/ocrTypes.js';
import { getActorFromRequest, getParam } from '../utils/requestUtils.js';

// Configure safe local multer memory storage with strict 10MB limit
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'application/pdf'];
    if (allowed.includes(file.mimetype.toLowerCase())) {
      cb(null, true);
    } else {
      const err = new Error(
        `Unsupported file type "${file.mimetype}". Only PNG, JPEG, WEBP, and PDF documents are allowed.`
      ) as any;
      err.code = 'UNSUPPORTED_FILE_TYPE';
      err.status = 400;
      cb(err);
    }
  },
});

export function createOCRRouter(
  ocrEngine: LocalOCREngine,
  normalizationService: DrugNormalizationService,
  fileStorageService: FileStorageService,
  medRepo: MedicationRepository,
  auditService: AuditService,
  terminologyProvider: IDrugTerminologyProvider
): Router {
  const router = Router();

  // 1. Upload & Process Document Locally
  router.post('/upload', upload.single('file'), async (req, res, next) => {
    try {
      if (!req.file) {
        res.status(400).json({
          success: false,
          error: {
            code: 'NO_FILE_UPLOADED',
            message: 'A prescription document (image or PDF) must be provided in the "file" form field.',
          },
        });
        return;
      }

      const patientId = req.body.patientId as string | undefined;

      // Safe temporary storage
      const storedDoc = fileStorageService.saveTempFile(
        req.file.buffer,
        req.file.originalname,
        req.file.mimetype
      );

      // Execute Local OCR Extraction
      const ocrResult = await ocrEngine.processDocument(
        req.file.buffer,
        req.file.originalname,
        req.file.mimetype
      );

      // Bind stored document ID for preview retrieval
      ocrResult.documentId = storedDoc.id;

      // Execute Normalization & Clinical Resolution Layer
      const processed = await normalizationService.processAndNormalize(ocrResult, patientId);

      res.status(200).json({
        success: true,
        data: processed,
      });
    } catch (err: any) {
      next(err);
    }
  });

  // 2. Stream / Serve Source Document for Side-by-Side Viewing
  router.get('/documents/:id/preview', (req, res) => {
    const id = getParam(req, 'id');
    const doc = fileStorageService.getDocument(id);

    if (!doc) {
      res.status(404).json({
        success: false,
        error: { code: 'DOCUMENT_NOT_FOUND', message: `Document with ID "${id}" not found or expired.` },
      });
      return;
    }

    res.setHeader('Content-Type', doc.mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${doc.originalName}"`);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.sendFile(doc.filePath);
  });

  // 3. Delete Document & Cleanup Temp Storage
  router.delete('/documents/:id', (req, res) => {
    const id = getParam(req, 'id');
    const deleted = fileStorageService.deleteTempFile(id);

    res.json({
      success: true,
      message: deleted ? 'Document temporary file deleted.' : 'Document not found or already deleted.',
    });
  });

  // 4. Terminology Concept Search
  router.get('/terminology/search', async (req, res, next) => {
    try {
      const query = (req.query.q as string) || '';
      const matches = await terminologyProvider.search(query);
      res.json({ success: true, data: matches });
    } catch (err) {
      next(err);
    }
  });

  // 5. Reconcile & Persist Candidate Order with Explicit User Confirmation
  router.post('/reconcile', validateBody(ReconcileCandidateMedicationSchema), (req, res, next) => {
    try {
      const data = req.body;
      const actor = data.actor || getActorFromRequest(req);

      // Create permanent medication in SQLite
      const createdMed = medRepo.create({
        patientId: data.patientId,
        brand: data.brand,
        genericName: data.genericName,
        activeIngredients: data.activeIngredients,
        salt: data.salt,
        strength: data.strength,
        formulation: data.formulation,
        route: data.route,
        prescribedDose: data.prescribedDose,
        frequency: data.frequency,
        administrationInstructions: data.administrationInstructions,
        prescriber: data.prescriber,
        source: data.source || `Prescription OCR Intake (${data.documentId || 'Document'})`,
        status: data.status || 'active',
        verificationStatus: data.verificationStatus || 'unverified',
        startDate: data.startDate || null,
        endDate: data.endDate || null,
        indication: data.indication || null,
      });

      // Audit trail entry with provenance
      auditService.logCreate(
        createdMed.patientId,
        'medication',
        createdMed.id,
        actor,
        `Reconciled and accepted OCR prescription order: ${createdMed.brand} (${createdMed.genericName}) [${createdMed.prescribedDose}]. Verified state: ${createdMed.verificationStatus}.`,
        createdMed
      );

      res.status(201).json({
        success: true,
        data: createdMed,
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
