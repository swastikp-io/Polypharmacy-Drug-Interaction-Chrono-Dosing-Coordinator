import { randomUUID } from 'crypto';
import { z } from 'zod';
import type {
  AgentId,
  ToolExecutionRecord,
} from '../../../../shared/agentContractTypes.js';
import type { ToolExecutionRepository } from '../../../repositories/toolExecutionRepository.js';
import {
  ToolInputValidationError,
  UnauthorizedToolExecutionError,
} from '../stateMachine/errors.js';
import { computeSanitizedInputHash } from './sanitizer.js';
import { validateAgentToolAuthorization } from '../agents/agentContracts.js';

export type ToolAuthorizationPolicy =
  | 'public'
  | 'authenticated_user'
  | 'clinician_only'
  | 'admin_only';

export interface ToolExecutionContext {
  actor: string;
  actorRole?: 'clinician' | 'pharmacist' | 'nurse' | 'assistant' | 'system' | 'admin';
  agentId?: AgentId | string;
  workflowId?: string;
  confirmationToken?: string;
  dependencyVersions?: Record<string, string | number>;
}

export interface OrchestratorTool<TInput = any, TOutput = any> {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: z.ZodType<TInput>;
  readonly outputSchema?: z.ZodType<TOutput>;
  readonly authorizationPolicy: ToolAuthorizationPolicy;
  readonly isReadOnly: boolean;
  readonly expectedFailureModes: string[];
  execute(input: TInput, context: ToolExecutionContext): Promise<TOutput>;
}

export interface ToolExecutionSuccess<T = any> {
  success: true;
  toolName: string;
  data: T;
  executionRecord?: ToolExecutionRecord;
}

export interface ToolExecutionFailure {
  success: false;
  toolName: string;
  error: {
    code: string;
    message: string;
    details?: any;
  };
  executionRecord?: ToolExecutionRecord;
}

export type ToolExecutionResult<T = any> =
  | ToolExecutionSuccess<T>
  | ToolExecutionFailure;

export const PROHIBITED_TOOLS: readonly string[] = [
  'eval',
  'system_shell',
  'execute_command',
  'write_file',
  'read_arbitrary_file',
  'raw_sql',
  'sql_query',
  'fs_delete',
  'rmdir',
  'exec',
  'run_script',
  'bash',
  'sh',
  'powershell',
  'cmd',
];

export class ToolRegistry {
  private tools: Map<string, OrchestratorTool> = new Map();

  constructor(private executionRepo?: ToolExecutionRepository) {}

  public setExecutionRepository(repo: ToolExecutionRepository): void {
    this.executionRepo = repo;
  }

  public registerTool<TInput, TOutput>(tool: OrchestratorTool<TInput, TOutput>): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool "${tool.name}" is already registered.`);
    }
    if (PROHIBITED_TOOLS.includes(tool.name.toLowerCase())) {
      throw new Error(`Cannot register prohibited tool "${tool.name}".`);
    }
    this.tools.set(tool.name, tool);
  }

  public getTool(name: string): OrchestratorTool | undefined {
    return this.tools.get(name);
  }

  public hasTool(name: string): boolean {
    return this.tools.has(name);
  }

  public listTools(): Array<{
    name: string;
    description: string;
    authorizationPolicy: ToolAuthorizationPolicy;
    isReadOnly: boolean;
    expectedFailureModes: string[];
  }> {
    return Array.from(this.tools.values()).map((t) => ({
      name: t.name,
      description: t.description,
      authorizationPolicy: t.authorizationPolicy,
      isReadOnly: t.isReadOnly,
      expectedFailureModes: t.expectedFailureModes,
    }));
  }

  public async executeTool(
    toolName: string,
    rawInput: unknown,
    context: ToolExecutionContext
  ): Promise<ToolExecutionResult> {
    const operationId = `op-${randomUUID()}`;
    const startedAt = new Date().toISOString();
    const startMs = Date.now();
    const inputHash = computeSanitizedInputHash(toolName, rawInput);
    const dependencyVersions = context.dependencyVersions || { orchestrator: '2026.1' };

    // 1. Prohibited check
    if (PROHIBITED_TOOLS.includes(toolName.toLowerCase())) {
      const durationMs = Date.now() - startMs;
      const executionRecord: ToolExecutionRecord = {
        operationId,
        workflowId: context.workflowId || 'untracked',
        agentId: context.agentId,
        toolName,
        inputHash,
        dependencyVersions,
        status: 'blocked',
        startedAt,
        completedAt: new Date().toISOString(),
        durationMs,
        error: {
          code: 'SECURITY_VIOLATION',
          message: `Tool "${toolName}" is strictly prohibited to ensure patient safety and sandbox integrity.`,
          isRecoverable: false,
          timestamp: new Date().toISOString(),
        },
      };
      this.persistExecution(executionRecord);

      return {
        success: false,
        toolName,
        error: {
          code: 'SECURITY_VIOLATION',
          message: `Tool "${toolName}" is strictly prohibited to ensure patient safety and sandbox integrity.`,
        },
        executionRecord,
      };
    }

    // 2. Agent capability & authorization check
    if (context.agentId) {
      try {
        validateAgentToolAuthorization(context.agentId, toolName);
      } catch (err: any) {
        const durationMs = Date.now() - startMs;
        const executionRecord: ToolExecutionRecord = {
          operationId,
          workflowId: context.workflowId || 'untracked',
          agentId: context.agentId,
          toolName,
          inputHash,
          dependencyVersions,
          status: 'blocked',
          startedAt,
          completedAt: new Date().toISOString(),
          durationMs,
          error: {
            code: 'UNAUTHORIZED_ACCESS',
            message: err.message,
            isRecoverable: false,
            timestamp: new Date().toISOString(),
            details: { agentId: context.agentId },
          },
        };
        this.persistExecution(executionRecord);

        return {
          success: false,
          toolName,
          error: {
            code: 'UNAUTHORIZED_ACCESS',
            message: err.message,
          },
          executionRecord,
        };
      }
    }

    const tool = this.tools.get(toolName);
    if (!tool) {
      const durationMs = Date.now() - startMs;
      const executionRecord: ToolExecutionRecord = {
        operationId,
        workflowId: context.workflowId || 'untracked',
        agentId: context.agentId,
        toolName,
        inputHash,
        dependencyVersions,
        status: 'failed',
        startedAt,
        completedAt: new Date().toISOString(),
        durationMs,
        error: {
          code: 'TOOL_NOT_FOUND',
          message: `Tool "${toolName}" is not registered in the orchestrator tool registry.`,
          isRecoverable: false,
          timestamp: new Date().toISOString(),
        },
      };
      this.persistExecution(executionRecord);

      return {
        success: false,
        toolName,
        error: {
          code: 'TOOL_NOT_FOUND',
          message: `Tool "${toolName}" is not registered in the orchestrator tool registry.`,
        },
        executionRecord,
      };
    }

    // 3. User & Role Authorization check
    const authError = this.checkAuthorization(tool, context);
    if (authError) {
      const durationMs = Date.now() - startMs;
      const executionRecord: ToolExecutionRecord = {
        operationId,
        workflowId: context.workflowId || 'untracked',
        agentId: context.agentId,
        toolName,
        inputHash,
        dependencyVersions,
        status: 'blocked',
        startedAt,
        completedAt: new Date().toISOString(),
        durationMs,
        error: {
          code: 'UNAUTHORIZED_ACCESS',
          message: authError,
          isRecoverable: false,
          timestamp: new Date().toISOString(),
        },
      };
      this.persistExecution(executionRecord);

      return {
        success: false,
        toolName,
        error: {
          code: 'UNAUTHORIZED_ACCESS',
          message: authError,
        },
        executionRecord,
      };
    }

    // 4. Input validation
    const parsedInputResult = tool.inputSchema.safeParse(rawInput);
    if (!parsedInputResult.success) {
      const issueMessages = parsedInputResult.error.issues.map(
        (i) => `${i.path.join('.') || 'root'}: ${i.message}`
      );
      const durationMs = Date.now() - startMs;
      const executionRecord: ToolExecutionRecord = {
        operationId,
        workflowId: context.workflowId || 'untracked',
        agentId: context.agentId,
        toolName,
        inputHash,
        dependencyVersions,
        status: 'failed',
        startedAt,
        completedAt: new Date().toISOString(),
        durationMs,
        error: {
          code: 'INVALID_INPUT',
          message: `Validation failed for tool "${toolName}": ${issueMessages.join('; ')}`,
          isRecoverable: true,
          timestamp: new Date().toISOString(),
          details: parsedInputResult.error.issues,
        },
      };
      this.persistExecution(executionRecord);

      return {
        success: false,
        toolName,
        error: {
          code: 'INVALID_INPUT',
          message: `Validation failed for tool "${toolName}": ${issueMessages.join('; ')}`,
          details: parsedInputResult.error.issues,
        },
        executionRecord,
      };
    }

    // 5. Execution
    try {
      const data = await tool.execute(parsedInputResult.data, context);

      // 6. Output schema validation if specified
      if (tool.outputSchema) {
        const outParse = tool.outputSchema.safeParse(data);
        if (!outParse.success) {
          const durationMs = Date.now() - startMs;
          const executionRecord: ToolExecutionRecord = {
            operationId,
            workflowId: context.workflowId || 'untracked',
            agentId: context.agentId,
            toolName,
            inputHash,
            dependencyVersions,
            status: 'failed',
            startedAt,
            completedAt: new Date().toISOString(),
            durationMs,
            error: {
              code: 'MALFORMED_OUTPUT',
              message: `Tool "${toolName}" returned output that does not conform to its output contract.`,
              isRecoverable: false,
              timestamp: new Date().toISOString(),
              details: outParse.error.issues,
            },
          };
          this.persistExecution(executionRecord);

          return {
            success: false,
            toolName,
            error: {
              code: 'MALFORMED_OUTPUT',
              message: `Tool "${toolName}" returned output that does not conform to its output contract.`,
              details: outParse.error.issues,
            },
            executionRecord,
          };
        }
      }

      const durationMs = Date.now() - startMs;
      const executionRecord: ToolExecutionRecord = {
        operationId,
        workflowId: context.workflowId || 'untracked',
        agentId: context.agentId,
        toolName,
        inputHash,
        dependencyVersions,
        status: 'success',
        startedAt,
        completedAt: new Date().toISOString(),
        durationMs,
        resultSummary: `Executed ${toolName} successfully in ${durationMs}ms`,
      };
      this.persistExecution(executionRecord);

      return {
        success: true,
        toolName,
        data,
        executionRecord,
      };
    } catch (err: any) {
      const durationMs = Date.now() - startMs;
      const executionRecord: ToolExecutionRecord = {
        operationId,
        workflowId: context.workflowId || 'untracked',
        agentId: context.agentId,
        toolName,
        inputHash,
        dependencyVersions,
        status: 'failed',
        startedAt,
        completedAt: new Date().toISOString(),
        durationMs,
        error: {
          code: err.code || 'TOOL_EXECUTION_ERROR',
          message: err.message || 'An error occurred during tool execution',
          isRecoverable: err.isRecoverable ?? true,
          timestamp: new Date().toISOString(),
          details: err.details,
        },
      };
      this.persistExecution(executionRecord);

      return {
        success: false,
        toolName,
        error: {
          code: err.code || 'TOOL_EXECUTION_ERROR',
          message: err.message || 'An error occurred during tool execution',
        },
        executionRecord,
      };
    }
  }

  private persistExecution(record: ToolExecutionRecord): void {
    if (!this.executionRepo) return;
    try {
      this.executionRepo.create(record);
    } catch (err: any) {
      // Do not crash tool execution if audit table write fails (e.g. FK in isolated unit test)
      console.warn(`[ToolRegistry] Non-fatal tool execution record persistence warning:`, err.message);
    }
  }

  private checkAuthorization(
    tool: OrchestratorTool,
    context: ToolExecutionContext
  ): string | null {
    const actor = context.actor || 'anonymous';
    const role = context.actorRole || 'assistant';

    // Disallow AI/automated impersonation on mutating/clinician tools
    const isAiActor =
      /^(llm|ai|assistant|gpt|claude|bot|agent|automated)/i.test(actor.trim()) ||
      Boolean(context.agentId);

    if (tool.authorizationPolicy === 'clinician_only') {
      if (isAiActor) {
        return `Automated/LLM actor "${actor}" cannot perform clinician-restricted tool "${tool.name}". Human clinical credential required.`;
      }
      if (role !== 'clinician' && role !== 'pharmacist' && role !== 'admin') {
        return `Role "${role}" is not authorized for clinician-only tool "${tool.name}".`;
      }
    }

    if (tool.authorizationPolicy === 'admin_only') {
      if (role !== 'admin') {
        return `Role "${role}" is not authorized for admin-only tool "${tool.name}".`;
      }
    }

    if (tool.authorizationPolicy === 'authenticated_user') {
      if (!context.actor || context.actor === 'anonymous') {
        return `Authentication required for tool "${tool.name}".`;
      }
    }

    // Mutating tool guard: check confirmation token if mutating
    if (!tool.isReadOnly && tool.authorizationPolicy === 'clinician_only') {
      if (context.confirmationToken !== 'CONFIRM_MUTATION') {
        return `Mutating tool "${tool.name}" requires explicit confirmationToken: "CONFIRM_MUTATION".`;
      }
    }

    return null;
  }
}
