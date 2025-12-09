import serversJson from '../data/servers.json';
import type { ServersConfig } from '../mcp/types.js';

export const SERVERS_CONFIG = serversJson as ServersConfig;

export function getServerNames(): string[] {
  return Object.keys(SERVERS_CONFIG);
}

export function getServerConfig(name: string) {
  return SERVERS_CONFIG[name];
}
