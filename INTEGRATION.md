# Synthetic MCP Server - Integration Guide

This document explains how to interface with the Synthetic MCP Server for testing MCP clients like OpenBench.

## Overview

The Synthetic MCP Server is a genuine MCP server that masquerades as multiple different MCP servers for testing purposes. Each virtual server exposes a set of tools with synthetic data, allowing you to test MCP client implementations without requiring real external services.

## Server Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                    Synthetic MCP Server                       │
│                    (Cloudflare Workers)                       │
├──────────────────────────────────────────────────────────────┤
│  GET /                      → List available servers          │
│  GET /servers               → JSON list of server names       │
│  ALL /mcp/{serverName}      → MCP endpoint for that server    │
└──────────────────────────────────────────────────────────────┘
```

## Available Virtual Servers

| Server Name | Description | Key Tools |
|-------------|-------------|-----------|
| `arxiv-mcp-server` | ArXiv paper search and download | `search_papers`, `download_paper`, `read_paper` |
| `biomcp` | Biomedical literature and trials | `search`, `fetch`, `think` |
| `playwright` | Web browsing and screenshots | `playwright_navigate`, `playwright_get_visible_html`, `playwright_screenshot` |
| `filesystem` | File system operations | `read_file`, `list_directory`, `read_multiple_files` |
| `hackernews` | HackerNews story lookup | `story_lookup` |
| `wikipedia` | Wikipedia article search | `search_articles` |
| `searxng` | Web URL search | `search` |
| `commodities-markets` | Commodity price lookup | `get_commodity_price`, `list_commodities` |
| `forex` | Foreign exchange rates | `get_forex_rate`, `list_currencies` |
| `excel` | Excel file reading | `excel_describe_sheets`, `excel_read_sheet` |
| `pdf-reader-mcp` | PDF document reading | `read_pdf` |
| `word-document-server` | Word document operations | Multiple document tools |
| `maven-deps-server` | Maven dependency lookup | `lookup_version` |
| `music-analysis` | Audio file analysis | `analyze_audio` |
| `mcp-simple-arxiv` | Simplified ArXiv search | `search`, `read_paper` |

## Connecting as an MCP Client

### Protocol

The server speaks the **MCP Streamable HTTP Transport** protocol:
- Transport: HTTP POST with SSE responses
- Content-Type: `application/json`
- Accept: `application/json, text/event-stream`

### Base URL

**Local Development:**
```
http://localhost:8787/mcp/{serverName}
```

**Production (when deployed):**
```
https://synthetic-mcp.{your-subdomain}.workers.dev/mcp/{serverName}
```

### Example: Initialize Connection

```bash
curl -X POST http://localhost:8787/mcp/playwright \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
      "protocolVersion": "2024-11-05",
      "capabilities": {},
      "clientInfo": {"name": "my-client", "version": "1.0.0"}
    }
  }'
```

Response:
```
event: message
data: {"result":{"protocolVersion":"2024-11-05","capabilities":{"tools":{"listChanged":true}},"serverInfo":{"name":"playwright","version":"1.0.0"}},"jsonrpc":"2.0","id":1}
```

### Example: List Tools

```bash
curl -X POST http://localhost:8787/mcp/playwright \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {}}'
```

### Example: Call a Tool

```bash
curl -X POST http://localhost:8787/mcp/arxiv-mcp-server \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{
    "jsonrpc": "2.0",
    "id": 3,
    "method": "tools/call",
    "params": {
      "name": "search_papers",
      "arguments": {"query": "machine learning"}
    }
  }'
```

## Using with TypeScript MCP SDK

```typescript
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const client = new Client({
  name: 'my-test-client',
  version: '1.0.0'
});

const transport = new StreamableHTTPClientTransport(
  new URL('http://localhost:8787/mcp/playwright')
);

await client.connect(transport);

// List available tools
const tools = await client.listTools();
console.log(tools);

// Call a tool
const result = await client.callTool('playwright_navigate', {
  url: 'https://example.com'
});
console.log(result);
```

## Data Sources

All data is synthetic and bundled with the server:

- **ArXiv papers**: Sample papers about web agents, ML, etc.
- **Clinical trials**: Sample trial data for biomcp
- **Web corpus**: Pre-defined URLs with synthetic HTML content
- **File system**: Virtual `/root/` directory with sample files
- **HackerNews**: Sample stories with IDs
- **Wikipedia**: Sample articles

## Handler Types

Tools use different handler types to generate responses:

| Handler Type | Behavior |
|--------------|----------|
| `static_json` | Returns a fixed JSON response |
| `table_lookup` | Looks up data by key from bundled JSON |
| `table_search` | Searches bundled JSON data |
| `filesystem` | Simulates file operations on virtual files |
| `web_corpus` | Returns pre-crawled HTML content |
| `url_search` | Searches URL index with decoy results |
| `compute` | Performs simple computations |

## Running Locally

```bash
cd server
pnpm install
pnpm dev  # Starts on http://localhost:8787
```

## Deploying to Cloudflare

```bash
cd server
pnpm deploy
```

## Testing Tips

1. **Start with `tools/list`** to see available tools for a server
2. **Check tool schemas** in the response to understand required parameters
3. **Tools return JSON in text content** - parse the `text` field from the response
4. **Some tools return stubs** - responses may contain "synthetic stub" messages

## Differences from Real MCP Servers

This synthetic server intentionally differs from real servers:

1. **Static data**: All data is pre-bundled, not live
2. **Deterministic**: Same inputs always produce same outputs
3. **No external network calls**: Everything is self-contained
4. **Synthetic file paths**: Uses `/root/` prefix for virtual files
5. **Error simulation**: Decoy URLs return realistic errors

## Expanding the Server

To add new virtual servers or tools:

1. Edit `server/src/data/servers.json`
2. Add any required data files to `server/src/data/`
3. Implement new handler types if needed in `server/src/mcp/handlers/`
