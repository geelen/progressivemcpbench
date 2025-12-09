# Synthetic MCP Server

A TypeScript MCP server for Cloudflare Workers that masquerades as multiple MCP servers for testing purposes.

## Quick Start

```bash
# Install dependencies
pnpm install

# Run locally
pnpm dev

# Check types
pnpm typecheck

# Deploy to Cloudflare
pnpm deploy
```

## Architecture

```
server/
├── src/
│   ├── index.ts                 # Hono app entry point
│   ├── config/
│   │   └── servers.ts           # Server configuration loader
│   ├── data/
│   │   ├── servers.json         # Virtual server definitions
│   │   ├── api/                  # Bundled API data (arxiv, trials, etc.)
│   │   ├── web/                  # Web corpus metadata
│   │   ├── datasets.ts          # Dataset loader
│   │   ├── filesystem.ts        # Virtual filesystem
│   │   └── webCorpus.ts         # Web corpus data access
│   └── mcp/
│       ├── types.ts             # TypeScript type definitions
│       ├── router.ts            # Hono route mounting
│       ├── buildServer.ts       # McpServer factory
│       ├── virtualServerRegistry.ts  # Server instance cache
│       └── handlers/            # Handler implementations
│           ├── index.ts         # Handler dispatcher
│           ├── staticJson.ts
│           ├── tableLookup.ts
│           ├── tableSearch.ts
│           ├── filesystem.ts
│           ├── webCorpus.ts
│           ├── urlSearch.ts
│           ├── hackerNews.ts
│           ├── wikipedia.ts
│           ├── excelReader.ts
│           └── compute.ts
├── wrangler.toml               # Cloudflare config
├── tsconfig.json
└── package.json
```

## Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /` | List available servers |
| `GET /servers` | JSON array of server names |
| `ALL /mcp/:serverName` | MCP endpoint for virtual server |

## Adding New Servers

1. Edit `src/data/servers.json` to add a new server definition
2. Add any required data files to `src/data/api/` or `src/data/web/`
3. If you need a new handler type, implement it in `src/mcp/handlers/`

## Handler Types

- `static_json` - Returns fixed JSON response
- `table_lookup` - Looks up data by key
- `table_search` - Searches JSON arrays
- `filesystem` - Virtual file operations
- `web_corpus` - Synthetic web pages
- `url_search` - URL search with decoys
- `hackernews_story` - HN story lookup
- `wikipedia_search` - Wikipedia search
- `excel_reader` - Excel file operations
- `compute` - Simple computations

## Dependencies

- [Hono](https://hono.dev/) - Web framework
- [@hono/mcp](https://honohub.dev/docs/hono-mcp) - MCP transport for Hono
- [@modelcontextprotocol/sdk](https://github.com/modelcontextprotocol/typescript-sdk) - MCP protocol implementation
