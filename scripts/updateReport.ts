#!/usr/bin/env node
import { readFile, writeFile, mkdir, stat } from "fs/promises";
import { dirname, basename, extname, relative } from "path";
import { parseArgs } from "util";
import { MODELS, STRATEGIES } from "./benchConfig";
import { METRICS, type ReportJson, type RunSummary } from "./types/report";
import { extractEvalStats, parseLogFile, aggregateStats } from "./extractEvalStats";

interface ReportIndex {
  files: Record<string, { mtimeMs: number; runId: string }>;
}

function extractStrategyFromPath(logPath: string): string {
  const filename = basename(logPath, extname(logPath));
  for (const strategy of STRATEGIES) {
    if (filename.includes(strategy.id) || logPath.includes(`strategy=${strategy.id}`)) {
      return strategy.id;
    }
  }
  const match = filename.match(/strategy[_=]([a-z0-9-]+)/i);
  if (match) return match[1];
  return "unknown";
}

function generateRunId(run: RunSummary): string {
  return `${run.modelId}__${run.strategyId}__${basename(run.logPath, extname(run.logPath))}`;
}

async function loadExistingReport(reportPath: string): Promise<ReportJson | null> {
  try {
    const content = await readFile(reportPath, "utf-8");
    return JSON.parse(content);
  } catch {
    return null;
  }
}

async function loadReportIndex(indexPath: string): Promise<ReportIndex> {
  try {
    const content = await readFile(indexPath, "utf-8");
    return JSON.parse(content);
  } catch {
    return { files: {} };
  }
}

async function saveReportIndex(indexPath: string, index: ReportIndex): Promise<void> {
  await mkdir(dirname(indexPath), { recursive: true });
  await writeFile(indexPath, JSON.stringify(index, null, 2));
}

async function getFileMtime(filePath: string): Promise<number> {
  const fileStat = await stat(filePath);
  return fileStat.mtimeMs;
}

interface UpdateOptions {
  logsDir: string;
  outputPath: string;
  clean?: boolean;
  minSamples?: number;
}

async function updateReport(options: UpdateOptions): Promise<void> {
  const { logsDir, outputPath, clean = false, minSamples = 1 } = options;
  const indexPath = outputPath.replace(/\.json$/, ".index.json");

  let existingReport: ReportJson | null = null;
  let index: ReportIndex = { files: {} };

  if (!clean) {
    existingReport = await loadExistingReport(outputPath);
    index = await loadReportIndex(indexPath);
  }

  const existingRunsById = new Map<string, RunSummary>();
  if (existingReport) {
    for (const run of existingReport.runs) {
      existingRunsById.set(run.id, run);
    }
  }

  const allRuns = await extractEvalStats({ logsDir, minSamples });
  let newRunsCount = 0;
  let updatedRunsCount = 0;

  for (const run of allRuns) {
    run.strategyId = extractStrategyFromPath(run.logPath);
    run.id = generateRunId(run);

    const relativePath = relative(logsDir, run.logPath);
    const mtime = await getFileMtime(run.logPath);
    const existingEntry = index.files[relativePath];

    if (!clean && existingEntry && existingEntry.mtimeMs === mtime) {
      const existingRun = existingRunsById.get(existingEntry.runId);
      if (existingRun) {
        continue;
      }
    }

    if (existingRunsById.has(run.id)) {
      updatedRunsCount++;
    } else {
      newRunsCount++;
    }

    existingRunsById.set(run.id, run);
    index.files[relativePath] = { mtimeMs: mtime, runId: run.id };
  }

  const finalRuns = Array.from(existingRunsById.values());

  const report: ReportJson = {
    generatedAt: new Date().toISOString(),
    source: { logsDir },
    dimensions: {
      models: MODELS,
      strategies: STRATEGIES,
      metrics: METRICS,
    },
    runs: finalRuns,
  };

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, JSON.stringify(report, null, 2));
  await saveReportIndex(indexPath, index);

  console.log(`Report updated: ${outputPath}`);
  console.log(`  Total runs: ${finalRuns.length}`);
  console.log(`  New runs: ${newRunsCount}`);
  console.log(`  Updated runs: ${updatedRunsCount}`);
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      logs: { type: "string", short: "l" },
      output: { type: "string", short: "o" },
      clean: { type: "boolean", default: false },
      "min-samples": { type: "string", default: "1" },
      help: { type: "boolean", short: "h" },
    },
  });

  if (values.help) {
    console.log(`
Usage: bun run updateReport.ts [options]

Options:
  -l, --logs <path>        Path to OpenBench logs directory
  -o, --output <path>      Output path for report.json (default: ../data/reports/report.json)
  --clean                  Force regeneration of entire report (ignore existing)
  --min-samples <n>        Minimum samples required for a valid run (default: 1)
  -h, --help               Show this help message
`);
    process.exit(0);
  }

  const logsDir = values.logs || process.env.LOGS_DIR;
  if (!logsDir) {
    console.error("Error: --logs or LOGS_DIR environment variable required");
    process.exit(1);
  }

  const outputPath = values.output || "../data/reports/report.json";
  const minSamples = parseInt(values["min-samples"] || "1", 10);

  await updateReport({
    logsDir,
    outputPath,
    clean: values.clean,
    minSamples,
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
