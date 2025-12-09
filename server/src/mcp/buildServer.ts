import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ServerConfig, ToolConfig } from './types.js';
import { executeHandler } from './handlers/index.js';
import { z } from 'zod';

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

function jsonSchemaPropertyToZod(
  prop: Record<string, unknown>
): z.ZodTypeAny {
  const type = prop.type as string;

  switch (type) {
    case 'string':
      return z.string();
    case 'number':
    case 'integer':
      return z.number();
    case 'boolean':
      return z.boolean();
    case 'array':
      if (prop.items && typeof prop.items === 'object') {
        return z.array(
          jsonSchemaPropertyToZod(prop.items as Record<string, unknown>)
        );
      }
      return z.array(z.unknown());
    case 'object':
      if (prop.properties && typeof prop.properties === 'object') {
        return jsonSchemaToZod(prop as Record<string, unknown>);
      }
      return z.record(z.string(), z.unknown());
    default:
      return z.unknown();
  }
}

function jsonSchemaToZod(
  schema: Record<string, unknown>
): z.ZodObject<Record<string, z.ZodTypeAny>> {
  const properties = (schema.properties as Record<string, unknown>) ?? {};
  const required = (schema.required as string[]) ?? [];

  const shape: Record<string, z.ZodTypeAny> = {};

  for (const [key, prop] of Object.entries(properties)) {
    let zodType = jsonSchemaPropertyToZod(prop as Record<string, unknown>);

    if (!required.includes(key)) {
      zodType = zodType.optional();
    }

    shape[key] = zodType;
  }

  return z.object(shape);
}

function registerTool(
  mcpServer: McpServer,
  serverConfig: ServerConfig,
  tool: ToolConfig
): void {
  const zodSchema = jsonSchemaToZod(
    tool.inputSchema as unknown as Record<string, unknown>
  );

  mcpServer.registerTool(
    tool.name,
    {
      description: tool.description,
      inputSchema: zodSchema,
    },
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
