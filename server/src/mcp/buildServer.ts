import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ServerConfig, ToolConfig } from './types.js';
import { executeHandler } from './handlers/index.js';

export function buildMcpServerFromConfig(config: ServerConfig): McpServer {
  const mcpServer = new McpServer({
    name: config.server_name,
    version: '1.0.0',
  });

  for (const tool of config.tools) {
    registerTool(mcpServer, config, tool);
  }

  return mcpServer;
}

function registerTool(
  mcpServer: McpServer,
  serverConfig: ServerConfig,
  tool: ToolConfig
): void {
  mcpServer.tool(
    tool.name,
    tool.description,
    tool.inputSchema.properties ?? {},
    async (args: Record<string, unknown>) => {
      const result = await executeHandler(tool.handler, args ?? {}, {
        serverName: serverConfig.server_name,
        toolName: tool.name,
      });

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    }
  );
}
