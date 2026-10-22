import { Router } from 'express';
import type { WorkflowCoordinator } from '../services/orchestration/workflowCoordinator.js';
import type { McpToolService } from '../services/mcp/mcpToolService.js';
import type { PatientRepository } from '../repositories/patientRepository.js';
import {
  WorkflowResumeRequestSchema,
  WorkflowRunOptionsSchema,
} from '../../shared/orchestrationSchemas.js';
import { getActorFromRequest, getParam } from '../utils/requestUtils.js';

export function createOrchestrationRouter(
  coordinator: WorkflowCoordinator,
  mcpToolService: McpToolService,
  patientRepo: PatientRepository
): Router {
  const router = Router();

  // 1. Start Workflow Run
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

  // 2. Get Workflow Run by ID
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

  // 3. Resume Paused Workflow
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

  // 4. Get Latest Consolidated Report for Patient
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

  // 5. MCP Tool Invocation Endpoint (Strictly Validated)
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

  return router;
}
