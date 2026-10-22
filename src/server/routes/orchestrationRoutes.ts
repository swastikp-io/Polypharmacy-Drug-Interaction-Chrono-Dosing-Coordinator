import { Router } from 'express';
import type { WorkflowCoordinator } from '../services/orchestration/workflowCoordinator.js';
import type { McpToolService } from '../services/mcp/mcpToolService.js';
import type { PatientRepository } from '../repositories/patientRepository.js';
import type { AgenticWorkflowOrchestrator } from '../services/orchestration/agenticWorkflowOrchestrator.js';
import type { ToolRegistry } from '../services/orchestration/tools/toolRegistry.js';
import type { ReviewRequestService } from '../services/orchestration/reviewRequestService.js';
import {
  AgenticWorkflowCreateInputSchema,
  MedicationCorrectionInputSchema,
  ReviewResolutionSchema,
  ToolExecutionRequestSchema,
  WorkflowResumeRequestSchema,
  WorkflowRunOptionsSchema,
} from '../../shared/orchestrationSchemas.js';
import { getActorFromRequest, getParam } from '../utils/requestUtils.js';

export function createOrchestrationRouter(
  coordinator: WorkflowCoordinator,
  mcpToolService: McpToolService,
  patientRepo: PatientRepository,
  agenticOrchestrator?: AgenticWorkflowOrchestrator,
  toolRegistry?: ToolRegistry,
  reviewService?: ReviewRequestService
): Router {
  const router = Router();

  // ==========================================
  // 1. LEGACY REST WORKFLOW ENDPOINTS (Phase 5 compatibility)
  // ==========================================

  // Start Workflow Run
  router.post('/run', async (req, res, next) => {
    try {
      const actor = getActorFromRequest(req);
      const parsedOptions = WorkflowRunOptionsSchema.parse({
        ...req.body,
        actor: req.body.actor || actor,
      });

      const patient = patientRepo.findById(parsedOptions.patientId);
      if (!patient) {
        res.status(404).json({
          success: false,
          error: {
            code: 'PATIENT_NOT_FOUND',
            message: `Patient with ID "${parsedOptions.patientId}" was not found.`,
          },
        });
        return;
      }

      const run = await coordinator.startWorkflow(parsedOptions);

      res.status(200).json({
        success: true,
        data: run,
      });
    } catch (err: any) {
      if (err.name === 'ZodError' || err.issues) {
        res.status(400).json({
          success: false,
          error: `Validation failed: ${err.issues?.map((i: any) => `${i.path.join('.')}: ${i.message}`).join(', ') || err.message}`,
          details: err.issues,
        });
        return;
      }
      next(err);
    }
  });

  // Get Workflow Run by ID
  router.get('/run/:runId', async (req, res, next) => {
    try {
      const runId = getParam(req, 'runId');
      const run = coordinator.getWorkflowRun(runId);

      if (!run) {
        res.status(404).json({
          success: false,
          error: { code: 'WORKFLOW_RUN_NOT_FOUND', message: `Workflow run "${runId}" not found.` },
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: run,
      });
    } catch (err: any) {
      if (err.name === 'ZodError' || err.issues) {
        res.status(400).json({
          success: false,
          error: `Validation failed: ${err.issues?.map((i: any) => `${i.path.join('.')}: ${i.message}`).join(', ') || err.message}`,
          details: err.issues,
        });
        return;
      }
      next(err);
    }
  });

  // Resume Paused Workflow
  router.post('/run/:runId/resume', async (req, res, next) => {
    try {
      const runId = getParam(req, 'runId');
      const actor = getActorFromRequest(req);

      const parsedRequest = WorkflowResumeRequestSchema.parse({
        ...req.body,
        actor: req.body.actor || actor,
      });

      const resumedRun = await coordinator.resumeWorkflow(runId, parsedRequest);

      res.status(200).json({
        success: true,
        data: resumedRun,
      });
    } catch (err) {
      next(err);
    }
  });

  // Get Latest Consolidated Report for Patient
  router.get('/patient/:patientId/report', async (req, res, next) => {
    try {
      const patientId = getParam(req, 'patientId');
      const patient = patientRepo.findById(patientId);

      if (!patient) {
        res.status(404).json({
          success: false,
          error: { code: 'PATIENT_NOT_FOUND', message: `Patient "${patientId}" not found.` },
        });
        return;
      }

      const latestRun = coordinator.getLatestRunForPatient(patientId);
      if (latestRun && latestRun.report) {
        res.status(200).json({
          success: true,
          data: latestRun.report,
        });
        return;
      }

      // If no report cached, run workflow
      const newRun = await coordinator.startWorkflow({
        patientId,
        requireConfirmedOnly: false,
        actor: 'Clinical Report Dispatcher',
      });

      res.status(200).json({
        success: true,
        data: newRun.report || newRun,
      });
    } catch (err) {
      next(err);
    }
  });

  // Legacy Scoped MCP Tool Invocation Endpoint
  router.post('/mcp/call', async (req, res, next) => {
    try {
      const toolName = req.body.name || req.body.toolName;
      const rawArgs = req.body.arguments || {};

      if (!toolName || typeof toolName !== 'string') {
        res.status(400).json({
          success: false,
          error: 'Validation failed: toolName or name must be a valid string.',
        });
        return;
      }

      const result = await mcpToolService.callTool(toolName, rawArgs);

      if (!result.success) {
        res.status(400).json({
          success: false,
          error: result.error?.message || 'Tool execution failed',
          code: result.error?.code,
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: {
          toolName: result.toolName,
          result: result.data,
        },
      });
    } catch (err) {
      next(err);
    }
  });

  // ==========================================
  // 2. AGENTIC ARCHITECTURE ENDPOINTS
  // ==========================================

  if (agenticOrchestrator) {
    // Create Agentic Workflow
    router.post('/agentic/workflows', async (req, res, next) => {
      try {
        const actor = getActorFromRequest(req);
        const parsed = AgenticWorkflowCreateInputSchema.parse({
          ...req.body,
          actor: req.body.actor || actor,
        });

        const context = await agenticOrchestrator.createWorkflow({
          patientId: parsed.patientId,
          prescriptionDocumentId: parsed.prescriptionDocumentId,
          requireExplicitConfirmation: parsed.requireExplicitConfirmation,
          actor: parsed.actor,
        });

        res.status(201).json({
          success: true,
          data: context,
        });
      } catch (err: any) {
        if (err.name === 'ZodError' || err.issues) {
          res.status(400).json({
            success: false,
            error: `Validation failed: ${err.issues?.map((i: any) => `${i.path.join('.')}: ${i.message}`).join(', ') || err.message}`,
            details: err.issues,
          });
          return;
        }
        next(err);
      }
    });

    // Get Agentic Workflow by ID
    router.get('/agentic/workflows/:workflowId', async (req, res, next) => {
      try {
        const workflowId = getParam(req, 'workflowId');
        const context = agenticOrchestrator.getWorkflow(workflowId);

        if (!context) {
          res.status(404).json({
            success: false,
            error: {
              code: 'WORKFLOW_NOT_FOUND',
              message: `Workflow "${workflowId}" was not found.`,
            },
          });
          return;
        }

        res.status(200).json({
          success: true,
          data: context,
        });
      } catch (err) {
        next(err);
      }
    });

    // Advance Agentic Workflow
    router.post('/agentic/workflows/:workflowId/advance', async (req, res, next) => {
      try {
        const workflowId = getParam(req, 'workflowId');
        const actor = req.body.actor || getActorFromRequest(req);

        const updatedContext = await agenticOrchestrator.advanceWorkflow(workflowId, actor);

        res.status(200).json({
          success: true,
          data: updatedContext,
        });
      } catch (err: any) {
        res.status(400).json({
          success: false,
          error: err.message,
          code: err.name || 'WORKFLOW_ADVANCE_ERROR',
        });
      }
    });

    // Confirm Medication Candidate
    router.post('/agentic/workflows/:workflowId/confirm-candidate', async (req, res, next) => {
      try {
        const workflowId = getParam(req, 'workflowId');
        const actor = req.body.actor || getActorFromRequest(req);
        const candidateId = req.body.candidateId;
        const justification = req.body.justification || 'Verified against medical record';

        if (!candidateId) {
          res.status(400).json({
            success: false,
            error: 'candidateId is required.',
          });
          return;
        }

        const updatedContext = await agenticOrchestrator.confirmMedicationCandidate(
          workflowId,
          candidateId,
          actor,
          justification
        );

        res.status(200).json({
          success: true,
          data: updatedContext,
        });
      } catch (err: any) {
        res.status(400).json({
          success: false,
          error: err.message,
        });
      }
    });

    // Get Pending Reviews Across All Workflows
    router.get('/agentic/reviews/pending', async (_req, res, next) => {
      try {
        const reviews = agenticOrchestrator.getReviewQueue(undefined, 'pending');
        res.status(200).json({
          success: true,
          data: reviews,
        });
      } catch (err: any) {
        next(err);
      }
    });

    // Get Reviews for Workflow
    router.get('/agentic/workflows/:workflowId/reviews', async (req, res, next) => {
      try {
        const workflowId = getParam(req, 'workflowId');
        const status = req.query.status as string | undefined;
        const reviews = agenticOrchestrator.getReviewQueue(workflowId, status);
        res.status(200).json({
          success: true,
          data: reviews,
        });
      } catch (err: any) {
        next(err);
      }
    });

    // Get Approval Records for Workflow
    router.get('/agentic/workflows/:workflowId/approvals', async (req, res, next) => {
      try {
        const workflowId = getParam(req, 'workflowId');
        const approvals = agenticOrchestrator.getApprovalRecords(workflowId);
        res.status(200).json({
          success: true,
          data: approvals,
        });
      } catch (err: any) {
        next(err);
      }
    });

    // Resolve Human Review Request
    router.post('/agentic/workflows/:workflowId/reviews/:reviewId/resolve', async (req, res, next) => {
      try {
        const workflowId = getParam(req, 'workflowId');
        const reviewId = getParam(req, 'reviewId');
        const resolution = ReviewResolutionSchema.parse(req.body);

        const updatedContext = await agenticOrchestrator.resolveHumanReview(
          workflowId,
          reviewId,
          resolution
        );

        res.status(200).json({
          success: true,
          data: updatedContext,
        });
      } catch (err: any) {
        res.status(400).json({
          success: false,
          error: err.message,
          code: err.name,
        });
      }
    });

    // Correct Medication (Feedback Loop)
    router.post('/agentic/workflows/:workflowId/correct-medication', async (req, res, next) => {
      try {
        const workflowId = getParam(req, 'workflowId');
        const actor = req.body.actor || getActorFromRequest(req);
        const medicationId = req.body.medicationId;
        const justification = req.body.justification || 'Prescriber adjusted dose';

        if (!medicationId) {
          res.status(400).json({
            success: false,
            error: 'medicationId is required.',
          });
          return;
        }

        const updatedContext = await agenticOrchestrator.correctMedication(
          workflowId,
          medicationId,
          actor,
          justification
        );

        res.status(200).json({
          success: true,
          data: updatedContext,
        });
      } catch (err: any) {
        res.status(400).json({
          success: false,
          error: err.message,
        });
      }
    });

    // Record Lab (Feedback Loop)
    router.post('/agentic/workflows/:workflowId/record-lab', async (req, res, next) => {
      try {
        const workflowId = getParam(req, 'workflowId');
        const actor = req.body.actor || getActorFromRequest(req);
        const testName = req.body.testName;

        if (!testName) {
          res.status(400).json({
            success: false,
            error: 'testName is required.',
          });
          return;
        }

        const updatedContext = await agenticOrchestrator.recordNewLabData(
          workflowId,
          testName,
          actor
        );

        res.status(200).json({
          success: true,
          data: updatedContext,
        });
      } catch (err: any) {
        res.status(400).json({
          success: false,
          error: err.message,
        });
      }
    });
  }

  // Tool Invocation via Typed ToolRegistry
  if (toolRegistry) {
    router.post('/agentic/tools/call', async (req, res, next) => {
      try {
        const parsed = ToolExecutionRequestSchema.parse(req.body);
        const result = await toolRegistry.executeTool(
          parsed.name,
          parsed.arguments,
          {
            actor: parsed.actor,
            actorRole: parsed.actorRole,
            confirmationToken: parsed.confirmationToken,
          }
        );

        if (!result.success) {
          res.status(400).json({
            success: false,
            error: result.error?.message || 'Tool execution failed',
            code: result.error?.code,
            details: result.error?.details,
          });
          return;
        }

        res.status(200).json({
          success: true,
          data: {
            toolName: result.toolName,
            result: result.data,
          },
        });
      } catch (err: any) {
        if (err.name === 'ZodError' || err.issues) {
          res.status(400).json({
            success: false,
            error: `Validation failed: ${err.issues?.map((i: any) => `${i.path.join('.')}: ${i.message}`).join(', ') || err.message}`,
            details: err.issues,
          });
          return;
        }
        next(err);
      }
    });

    router.get('/agentic/tools', (_req, res) => {
      res.status(200).json({
        success: true,
        data: toolRegistry.listTools(),
      });
    });
  }

  return router;
}
