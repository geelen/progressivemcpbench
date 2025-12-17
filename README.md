# ProgressiveMCPBench

A benchmark for evaluating how effectively language models can discover and use [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) tools. It tests agents on tasks requiring MCP tools—from file operations to API calls—while controlling *how* tools are presented to the model.

## Overview

ProgressiveMCPBench measures LLM agent performance across different **tool discovery strategies**:

| Strategy | Description |
|----------|-------------|
| `copilot` | Semantic search via `route()` + `execute-tool()` |
| `directory` | Filesystem-like exploration via `ls()` + `read-tool-file()` |
| `minimal-servers` | Direct access to required servers only |
| `minimal-tools` | Direct access to exact tools needed (upper bound) |
| `distraction-64` | Required tools + distractors (64 total) |
| `distraction-128` | Required tools + distractors (128 total) |

The benchmark uses a **synthetic MCP layer** providing:
- **Deterministic responses** – Same inputs always produce same outputs
- **Fast execution** – No network latency or server startup time
- **No dependencies** – No Node.js, npm packages, or external services
- **Reliable evaluation** – No infrastructure failures or timeouts

## Repository Structure

```
progressivemcpbench/
├── dataset/                    # Benchmark dataset (used by OpenBench)
│   ├── config/
│   │   ├── servers.json        # Server definitions with tool schemas
│   │   └── seeds/              # Source files for generation
│   ├── data/
│   │   ├── api/                # JSON lookup tables for synthetic APIs
│   │   ├── files/root/         # Synthetic filesystem (csv, excel, pdf, etc.)
│   │   └── web/                # Synthetic web corpus
│   ├── tasks/
│   │   └── progressivemcpbench.json  # Evaluation tasks
│   ├── generate/               # Dataset generation pipeline
│   └── scripts/                # Dataset annotation helpers
├── scripts/                    # Benchmark running & analysis (TypeScript)
│   ├── runFullBench.ts         # Run evaluations across models/strategies
│   ├── extractEvalStats.ts     # Extract statistics from eval logs
│   ├── analyzeFailures.ts      # Analyze failure modes
│   └── updateReport.ts         # Update report with new results
├── report/                     # Interactive results dashboard (Vite/React)
├── server/                     # Synthetic MCP HTTP server
└── data/                       # Evaluation results and reports
```

## Running Evaluations

Evaluations are run via [OpenBench](https://github.com/groq/openbench):

```bash
# Run with directory-style tool discovery
bench eval progressivemcpbench --model openai/gpt-4o -T strategy=directory

# Run with only required servers per task
bench eval progressivemcpbench --model anthropic/claude-sonnet-4-5 -T strategy=minimal-servers

# Run with only exact required tools per task
bench eval progressivemcpbench --model google/gemini-2.5-flash -T strategy=minimal-tools
```

The synthetic MCP HTTP server starts automatically when running the eval.

### Running a Full Benchmark Suite

Use the scripts in this repository to run comprehensive benchmarks:

```bash
cd scripts
pnpm install
pnpm tsx runFullBench.ts
```

This runs all configured models across all strategies and saves results to `data/`.

## Viewing Results

The `report/` directory contains an interactive React dashboard:

```bash
cd report
pnpm install
pnpm dev
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Inspect AI Eval                         │
├─────────────────────────────────────────────────────────────┤
│  Strategy Layer                                             │
│  ├─ copilot ────────────► Semantic search discovery         │
│  ├─ directory ──────────► Filesystem-like exploration       │
│  ├─ minimal-servers ────► Server-level filtering            │
│  ├─ minimal-tools ──────► Exact tools only                  │
│  ├─ distraction-64 ─────► Required + distractors (64)       │
│  └─ distraction-128 ────► Required + distractors (128)      │
├─────────────────────────────────────────────────────────────┤
│  Synthetic HTTP MCP Server (localhost:8765)                 │
│  ├─ filesystem handler ──► dataset/data/files/root/         │
│  ├─ table_lookup handler ► dataset/data/api/*.json          │
│  ├─ excel_reader handler ► dataset/data/files/root/**/*.xlsx│
│  ├─ static_json handler ─► Fixed responses                  │
│  └─ web_corpus handler ──► dataset/data/web/                │
└─────────────────────────────────────────────────────────────┘
```

## Scoring

Tasks are scored using LLM-as-a-judge with the SimpleQA grader template:

| Score | Meaning |
|-------|---------|
| 1.0 | Correct answer |
| 0.5 | Partially correct (fuzzy match) |
| 0.0 | Incorrect or no answer |

The model must output a JSON object with a `final_answer` field containing the answer.

## Dataset Generation

The `dataset/generate/` directory contains the pipeline for creating and updating the benchmark dataset:

```bash
# Generate servers.json with tool handlers
python dataset/generate/step1_generate_schemas.py

# Generate the task file used by the eval
python dataset/generate/step3_generate_tasks.py

# Validate all tasks work
python dataset/generate/step4_validate_all.py
```

### Adding New Tasks

1. Edit `dataset/config/seeds/working_tasks.json` to add tasks
2. Edit `dataset/config/seeds/servers_raw.json` to add servers
3. Add data files to `dataset/data/api/` or `dataset/data/files/root/`
4. Run `step1_generate_schemas.py` and `step3_generate_tasks.py`

See the generation scripts for detailed documentation.

## Handler Types

| Handler | Purpose | Data Location |
|---------|---------|---------------|
| `filesystem` | Read files from synthetic filesystem | `data/files/root/` |
| `table_lookup` | Query JSON data by key | `data/api/*.json` |
| `table_search` | Search JSON data with decoys | `data/api/*.json` |
| `excel_reader` | Read Excel files | `data/files/root/**/*.xlsx` |
| `static_json` | Return fixed JSON responses | Inline in handler |
| `web_corpus` | Fetch synthetic web pages | `data/web/` |

## Requirements

- Python 3.10+ (for OpenBench evaluations)
- Node.js 18+ (for scripts and report)
- OPENAI_API_KEY (for embeddings in copilot strategy)

## References

Based on [LiveMCPBench](https://github.com/icip-cas/LiveMCPBench) with extensions for progressive tool discovery research.

## License

MIT
