import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createMcpServer } from '../src/index.js';
import { ClinicalEngineService } from '../src/services/clinicalEngineService.js';
import { MCP_TOOLS } from '../src/tools/registry.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

describe('Phase 7: MCP Server - Protocol, Initialization & Stdio Purity', () => {
  let db: Database.Database;
  let engine: ClinicalEngineService;
  let server: any;

  const P2_ID = 'p2222222-2222-2222-2222-222222222222'; // Arthur Pendelton
  const P3_ID = 'p3333333-3333-3333-3333-333333333333'; // Margaret Chen

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    engine = ClinicalEngineService.createWithDb(db);
    const mcp = createMcpServer(engine);
    server = mcp.server;
  });

  describe('Server Registration & ListTools', () => {
    it('registers exactly 9 clinical decision-support tools with Zod schemas', async () => {
      expect(MCP_TOOLS.length).toBe(9);

      const toolNames = MCP_TOOLS.map((t) => t.name);
      expect(toolNames).toContain('list_patients');
      expect(toolNames).toContain('get_patient_medications');
      expect(toolNames).toContain('parse_prescription');
      expect(toolNames).toContain('get_interaction_report');
      expect(toolNames).toContain('get_clinical_evidence');
      expect(toolNames).toContain('propose_medication_schedule');
      expect(toolNames).toContain('get_review_status');
      expect(toolNames).toContain('confirm_medication');
      expect(toolNames).toContain('get_patient_review_report');

      for (const tool of MCP_TOOLS) {
        expect(tool.description).toBeTruthy();
        expect(tool.inputSchema).toBeDefined();
        expect(tool.inputSchema.type).toBe('object');
      }
    });
  });

  describe('Direct MCP Request Dispatching', () => {
    it('executes list_patients and returns valid JSON serialized content', async () => {
      // Simulate CallToolRequest via server tool dispatcher
      const { dispatchTool } = await import('../src/tools/registry.js');
      const response = await dispatchTool('list_patients', {}, engine);

      expect(response.isError).toBeFalsy();
      expect(response.content.length).toBe(1);
      expect(response.content[0].type).toBe('text');

      const data = JSON.parse(response.content[0].text);
      expect(data.patients.length).toBeGreaterThanOrEqual(3);
    });

    it('executes get_patient_medications for Arthur Pendelton', async () => {
      const { dispatchTool } = await import('../src/tools/registry.js');
      const response = await dispatchTool('get_patient_medications', { patientId: P2_ID }, engine);

      expect(response.isError).toBeFalsy();
      const data = JSON.parse(response.content[0].text);
      expect(data.patientName).toBe('Arthur Pendelton');
      expect(data.confirmedOnly).toBe(true);
      expect(data.medications.length).toBeGreaterThan(0);
    });

    it('executes propose_medication_schedule and returns draft with safety notice', async () => {
      const { dispatchTool } = await import('../src/tools/registry.js');
      const response = await dispatchTool('propose_medication_schedule', { patientId: P3_ID }, engine);

      expect(response.isError).toBeFalsy();
      const data = JSON.parse(response.content[0].text);
      expect(data.status).toBe('draft');
      expect(data.isDraftOnly).toBe(true);
      expect(data.prescribedDosesPreserved100Percent).toBe(true);
      expect(data.safetyNotice).toContain('CLINICAL SAFETY NOTICE');
    });

    it('handles unknown tool call with graceful error output', async () => {
      const { dispatchTool } = await import('../src/tools/registry.js');
      const response = await dispatchTool('malicious_tool', {}, engine);

      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('Unknown MCP tool "malicious_tool"');
    });

    it('handles validation error gracefully when required arguments are omitted', async () => {
      const { dispatchTool } = await import('../src/tools/registry.js');
      const response = await dispatchTool('get_interaction_report', {}, engine);

      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('Clinical Decision-Support Error');
    });
  });

  describe('Stdio Transport & Protocol Purity (Child Process Test)', () => {
    it('emits only valid JSON-RPC on stdout and keeps diagnostic logging in stderr', async () => {
      const currentDir = path.dirname(fileURLToPath(import.meta.url));
      const entryPoint = path.resolve(currentDir, '../dist/index.js');

      // Skip child process spawn if compiled dist/index.js has not been built yet
      if (!fs.existsSync(entryPoint)) {
        return;
      }

      const child = spawn(process.execPath, [entryPoint], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, NODE_ENV: 'test' },
      });

      let stdoutData = '';
      let stderrData = '';

      child.stdout.on('data', (chunk) => {
        stdoutData += chunk.toString();
      });

      child.stderr.on('data', (chunk) => {
        stderrData += chunk.toString();
      });

      // Send JSON-RPC initialize request
      const initMessage = JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'test-runner', version: '1.0.0' },
        },
      }) + '\n';

      child.stdin.write(initMessage);

      // Wait reactively for stderr and stdout with a generous timeout for concurrent test runner load
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => resolve(), 5000);
        const checkDone = () => {
          if (
            stderrData.includes('[Polypharmacy Coordinator MCP]') &&
            stdoutData.includes('"jsonrpc"')
          ) {
            clearTimeout(timeout);
            resolve();
          }
        };

        child.stderr.on('data', checkDone);
        child.stdout.on('data', checkDone);
        // Also check immediately in case events fired synchronously
        checkDone();
      });

      child.kill();

      // Diagnostics should be captured on stderr
      expect(stderrData).toContain('[Polypharmacy Coordinator MCP]');

      // All stdout messages must be strictly valid JSON-RPC
      const lines = stdoutData
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length > 0);

      expect(lines.length).toBeGreaterThan(0);
      for (const line of lines) {
        expect(() => JSON.parse(line)).not.toThrow();
        const jsonRpc = JSON.parse(line);
        expect(jsonRpc.jsonrpc).toBe('2.0');
      }
    });
  });
});
