#!/usr/bin/env node
import { writeFile, mkdir, stat } from "fs/promises";
import { dirname, basename, extname } from "path";
import { parseArgs } from "util";
import { MODELS, STRATEGIES } from "./benchConfig";
import { METRICS, type ReportJson, type RunSummary } from "./types/report";
import { extractEvalStats } from "./extractEvalStats";

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

async function getFileMtime(filePath: string): Promise<number> {
  const fileStat = await stat(filePath);
  return fileStat.mtimeMs;
}

interface RunWithMtime extends RunSummary {
  mtime: number;
}

interface UpdateOptions {
  logsDir: string;
  outputPath: string;
  minSamples?: number;
}

async function updateReport(options: UpdateOptions): Promise<void> {
  const { logsDir, outputPath, minSamples = 2 } = options;

  const allRuns = await extractEvalStats({ logsDir, minSamples });
  
  // Key: "modelId::strategyId" -> most recent run
  const latestByCombo = new Map<string, RunWithMtime>();

  for (const run of allRuns) {
    run.strategyId = extractStrategyFromPath(run.logPath);
    run.id = generateRunId(run);
    
    const mtime = await getFileMtime(run.logPath);
    const comboKey = `${run.modelId}::${run.strategyId}`;
    
    const existing = latestByCombo.get(comboKey);
    if (!existing || mtime > existing.mtime) {
      latestByCombo.set(comboKey, { ...run, mtime });
    }
  }

  // Strip mtime from final output
  const finalRuns: RunSummary[] = Array.from(latestByCombo.values()).map(
    ({ mtime, ...run }) => run
  );

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
  console.log(`  Model/strategy combos: ${finalRuns.length}`);
  console.log(`  Expected max: ${MODELS.length * STRATEGIES.length}`);
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      logs: { type: "string", short: "l" },
      output: { type: "string", short: "o" },
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
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
