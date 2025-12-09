import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPTransport } from '@hono/mcp';
import { SERVERS_CONFIG } from '../config/servers.js';
import { buildMcpServerFromConfig } from './buildServer.js';

interface VirtualServerEntry {
  mcpServer: McpServer;
  transport: StreamableHTTPTransport;
}

const registry: Record<string, VirtualServerEntry> = {};

export function getOrCreateVirtualServer(
  name: string
): VirtualServerEntry | undefined {
  if (!(name in SERVERS_CONFIG)) {
    return undefined;
  }

  if (!registry[name]) {
    const config = SERVERS_CONFIG[name];
    const mcpServer = buildMcpServerFromConfig(config);
    const transport = new StreamableHTTPTransport();
    registry[name] = { mcpServer, transport };
  }

  return registry[name];
}

export function getAvailableServers(): string[] {
  return Object.keys(SERVERS_CONFIG);
}

export interface ServerDetails {
  name: string;
  description: string;
  tools: string[];
}

export function getServerDetails(): ServerDetails[] {
  return Object.entries(SERVERS_CONFIG).map(([name, config]) => ({
    name,
    description: config.description ?? '',
    tools: config.tools.map((t) => t.name),
  }));
}
