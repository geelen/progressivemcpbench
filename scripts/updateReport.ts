#!/usr/bin/env node
import { readFile, writeFile, mkdir } from "fs/promises";
import { dirname, basename, extname } from "path";
import { parseArgs } from "util";
import { MODELS, STRATEGIES } from "./benchConfig";
import { METRICS, type ReportJson, type RunSummary } from "./types/report";
import { extractEvalStats } from "./extractEvalStats";

async function loadExistingReport(reportPath: string): Promise<ReportJson | null> {
  try {
    const content = await readFile(reportPath, "utf-8");
    return JSON.parse(content);
  } catch {
    return null;
  }
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
  return `${run.modelId}__${run.strategyId}`;
}

interface UpdateOptions {
  logsDir: string;
  outputPath: string;
  minSamples?: number;
  full?: boolean;
}

async function updateReport(options: UpdateOptions): Promise<void> {
  const { logsDir, outputPath, minSamples = 2, full = false } = options;

  // Load existing report to get timestamp and existing runs
  const existingReport = await loadExistingReport(outputPath);
  const lastGeneratedAt = existingReport?.generatedAt 
    ? new Date(existingReport.generatedAt).getTime() 
    : 0;

  // Start with existing runs (keyed by model::strategy)
  const latestByCombo = new Map<string, RunSummary>();
  
  if (existingReport && !full) {
    for (const run of existingReport.runs) {
      const comboKey = `${run.modelId}::${run.strategyId}`;
      latestByCombo.set(comboKey, run);
    }
  }

  // Only process logs newer than last report (unless --full)
  const sinceTimestamp = full ? 0 : lastGeneratedAt;
  const allRuns = await extractEvalStats({ logsDir, minSamples, sinceTimestamp });
  
  let newCount = 0;
  let updatedCount = 0;
  let skippedUnknown = 0;

  for (const run of allRuns) {
    run.strategyId = extractStrategyFromPath(run.logPath);
    
    // Skip runs with unknown strategy
    if (run.strategyId === "unknown") {
      skippedUnknown++;
      console.log(`  Skipping unknown strategy: ${run.logPath}`);
      continue;
    }
    
    run.id = generateRunId(run);
    const comboKey = `${run.modelId}::${run.strategyId}`;
    
    const existing = latestByCombo.get(comboKey);
    const runAtMs = new Date(run.runAt).getTime();
    const existingRunAtMs = existing ? new Date(existing.runAt).getTime() : 0;
    
    if (!existing || runAtMs > existingRunAtMs) {
      if (existing) {
        updatedCount++;
      } else {
        newCount++;
      }
      latestByCombo.set(comboKey, run);
    }
  }

  const finalRuns: RunSummary[] = Array.from(latestByCombo.values());

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

  console.log(`Report updated: ${outputPath}`);
  console.log(`  Total combos: ${finalRuns.length} / ${MODELS.length * STRATEGIES.length}`);
  if (!full && existingReport) {
    console.log(`  New: ${newCount}, Updated: ${updatedCount}`);
    console.log(`  (Only processed logs newer than ${existingReport.generatedAt})`);
  }
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      logs: { type: "string", short: "l" },
      output: { type: "string", short: "o" },
      full: { type: "boolean", default: false },
      "min-samples": { type: "string", default: "2" },
      help: { type: "boolean", short: "h" },
    },
  });

  if (values.help) {
    console.log(`
Usage: bun run updateReport.ts [options]

Options:
  -l, --logs <path>        Path to OpenBench logs directory
  -o, --output <path>      Output path for report.json (default: ../data/reports/report.json)
  --full                   Reprocess all logs (ignore existing report timestamp)
  --min-samples <n>        Minimum samples required for a valid run (default: 2)
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
    minSamples,
    full: values.full,
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
