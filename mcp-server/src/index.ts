import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { ClinicalEngineService } from './services/clinicalEngineService.js';
import { MCP_TOOLS, dispatchTool } from './tools/registry.js';

export function createMcpServer(customEngine?: ClinicalEngineService) {
  const engine = customEngine || ClinicalEngineService.getInstance();

  const server = new Server(
    {
      name: 'polypharmacy-coordinator',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // 1. Register list_tools handler
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: MCP_TOOLS,
    };
  });

  // 2. Register call_tool handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    return await dispatchTool(name, args, engine);
  });

  return { server, engine };
}

export async function startServer() {
  try {
    const { server } = createMcpServer();
    const transport = new StdioServerTransport();

    // Critical: Diagnostics must NEVER go to stdout (stdout is reserved strictly for JSON-RPC messages)
    console.error('[Polypharmacy Coordinator MCP] Initializing server v1.0.0...');
    console.error(`[Polypharmacy Coordinator MCP] Registered ${MCP_TOOLS.length} clinical decision-support tools.`);

    await server.connect(transport);
    console.error('[Polypharmacy Coordinator MCP] Stdio transport successfully connected.');
  } catch (err: any) {
    console.error('[Polypharmacy Coordinator MCP] Fatal error starting server:', err);
    process.exit(1);
  }
}

// Start server if directly executed
const isDirectExecution =
  import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}` ||
  process.argv[1]?.endsWith('index.js') ||
  process.argv[1]?.endsWith('index.ts');

if (isDirectExecution) {
  startServer();
}
