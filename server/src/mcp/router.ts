import type { Hono } from 'hono';
import {
  getOrCreateVirtualServer,
  getAvailableServers,
  getServerDetails,
} from './virtualServerRegistry.js';

export function mountMcpRoutes(app: Hono): void {
  app.get('/', (c) => {
    const servers = getAvailableServers();
    return c.json({
      message: 'Synthetic MCP Server',
      available_servers: servers,
      usage: 'Connect to /mcp/{server_name} as an MCP endpoint',
    });
  });

  app.get('/servers', (c) => {
    const servers = getServerDetails();
    return c.json({ servers });
  });

  app.all('/mcp/:serverName', async (c) => {
    const serverName = c.req.param('serverName');
    const entry = getOrCreateVirtualServer(serverName);

    if (!entry) {
      return c.json({ error: `Unknown server: ${serverName}` }, 404);
    }

    const { mcpServer, transport } = entry;

    try {
      await mcpServer.connect(transport);
    } catch {
      // Already connected
    }

    return transport.handleRequest(c);
  });

  app.all('/mcp/:serverName/*', async (c) => {
    const serverName = c.req.param('serverName');
    const entry = getOrCreateVirtualServer(serverName);

    if (!entry) {
      return c.json({ error: `Unknown server: ${serverName}` }, 404);
    }

    const { mcpServer, transport } = entry;

    try {
      await mcpServer.connect(transport);
    } catch {
      // Already connected
    }

    return transport.handleRequest(c);
  });
}
