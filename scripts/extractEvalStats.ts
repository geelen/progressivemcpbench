import { readdir, readFile, stat } from "fs/promises";
import { join, basename, extname } from "path";
import JSZip from "jszip";
import type { SampleStats, EvalStats, RunSummary } from "./types/report";

function mean(arr: number[]): number | null {
  if (arr.length === 0) return null;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function stderr(arr: number[]): number | null {
  if (arr.length < 2) return null;
  const avg = arr.reduce((a, b) => a + b, 0) / arr.length;
  const squaredDiffs = arr.map((x) => (x - avg) ** 2);
  const variance = squaredDiffs.reduce((a, b) => a + b, 0) / arr.length;
  const stdDev = Math.sqrt(variance);
  return stdDev / Math.sqrt(arr.length);
}

function median(arr: number[]): number | null {
  if (arr.length === 0) return null;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function percentile(arr: number[], p: number): number | null {
  if (arr.length < 20) return null;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.floor(arr.length * p);
  return sorted[idx];
}

function sum(arr: number[]): number {
  return arr.reduce((a, b) => a + b, 0);
}

interface UsageInfo {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  openaiPromptTokens: number;
  openaiCachedTokens: number;
  anthropicInputTokens: number;
  anthropicCacheReadTokens: number;
  anthropicCacheCreationTokens: number;
}

function extractUsageFromResponse(response: Record<string, unknown>): UsageInfo {
  const result: UsageInfo = {
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    openaiPromptTokens: 0,
    openaiCachedTokens: 0,
    anthropicInputTokens: 0,
    anthropicCacheReadTokens: 0,
    anthropicCacheCreationTokens: 0,
  };

  const usage = (response.usage as Record<string, unknown>) || {};

  const promptTokens = (usage.prompt_tokens as number) || 0;
  const completionTokens = (usage.completion_tokens as number) || 0;
  const totalTokens = (usage.total_tokens as number) || promptTokens + completionTokens;

  result.inputTokens = promptTokens;
  result.outputTokens = completionTokens;
  result.totalTokens = totalTokens;
  result.openaiPromptTokens = promptTokens;

  const promptDetails = (usage.prompt_tokens_details as Record<string, unknown>) || {};
  const cachedTokens = (promptDetails.cached_tokens as number) || 0;
  result.openaiCachedTokens = cachedTokens;

  if ("cache_read_input_tokens" in usage || "cache_creation_input_tokens" in usage) {
    result.anthropicInputTokens = (usage.input_tokens as number) || 0;
    result.anthropicCacheReadTokens = (usage.cache_read_input_tokens as number) || 0;
    result.anthropicCacheCreationTokens = (usage.cache_creation_input_tokens as number) || 0;
    result.inputTokens = (usage.input_tokens as number) || 0;
    result.outputTokens = (usage.output_tokens as number) || 0;
    result.totalTokens = result.inputTokens + result.outputTokens;
  }

  return result;
}

interface ProviderTiming {
  queueTime: number;
  promptTime: number;
  completionTime: number;
  totalTime: number;
}

function extractProviderTiming(metadata: Record<string, unknown>): ProviderTiming {
  return {
    queueTime: (metadata.queue_time as number) || 0,
    promptTime: (metadata.prompt_time as number) || 0,
    completionTime: (metadata.completion_time as number) || 0,
    totalTime: (metadata.total_time as number) || 0,
  };
}

interface SpanInfo {
  type: string;
  name: string;
  parentId: string | null;
}

function buildSpanHierarchy(events: Record<string, unknown>[]): Map<string, SpanInfo> {
  const spanInfo = new Map<string, SpanInfo>();
  for (const evt of events) {
    if (evt.event === "span_begin") {
      spanInfo.set(evt.id as string, {
        type: (evt.type as string) || "",
        name: (evt.name as string) || "",
        parentId: (evt.parent_id as string) || null,
      });
    }
  }
  return spanInfo;
}

function getRootSpanType(spanId: string, spanInfo: Map<string, SpanInfo>): string {
  const visited = new Set<string>();
  let currentId: string | null = spanId;

  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    const info = spanInfo.get(currentId);
    if (!info) return "unknown";
    if (["solvers", "scorers", "init"].includes(info.type)) {
      return info.type;
    }
    currentId = info.parentId;
  }
  return "unknown";
}

function extractSampleStats(sampleData: Record<string, unknown>): SampleStats {
  const stats: SampleStats = {
    sampleId: (sampleData.id as string) || "unknown",
    epoch: (sampleData.epoch as number) ?? null,
    totalTime: (sampleData.total_time as number) ?? null,
    workingTime: (sampleData.working_time as number) ?? null,
    score: null,
    nModelCalls: 0,
    nToolCalls: 0,
    llmHttpTimeTotal: 0,
    llmHttpTimes: [],
    llmProviderTimeTotal: 0,
    llmQueueTimeTotal: 0,
    llmPromptTimeTotal: 0,
    llmCompletionTimeTotal: 0,
    inputTokensTotal: 0,
    outputTokensTotal: 0,
    totalTokens: 0,
    openaiPromptTokensTotal: 0,
    openaiCachedTokensTotal: 0,
    anthropicInputTokensTotal: 0,
    anthropicCacheReadTokensTotal: 0,
    anthropicCacheCreationTokensTotal: 0,
  };

  const scores = (sampleData.scores as Record<string, unknown>) || {};
  for (const scorerData of Object.values(scores)) {
    if (typeof scorerData === "object" && scorerData !== null && "value" in scorerData) {
      stats.score = (scorerData as Record<string, unknown>).value as number;
      break;
    }
  }

  const events = (sampleData.events as Record<string, unknown>[]) || [];
  const spanInfo = buildSpanHierarchy(events);

  for (const event of events) {
    const eventType = (event.event as string) || (event.type as string) || (event.kind as string) || "";

    if (eventType === "model" || eventType.toLowerCase().includes("model")) {
      const spanId = (event.span_id as string) || "";
      const rootSpanType = getRootSpanType(spanId, spanInfo);

      // Only count model calls within solver contexts (this is the correct filter)
      if (rootSpanType !== "solvers") {
        continue;
      }

      stats.nModelCalls++;

      const call = (event.call as Record<string, unknown>) || {};
      const httpTime = (call.time as number) || 0;
      if (httpTime) {
        stats.llmHttpTimeTotal += httpTime;
        stats.llmHttpTimes.push(httpTime);
      }

      const output = (event.output as Record<string, unknown>) || {};
      const usage = (output.usage as Record<string, unknown>) || {};
      stats.inputTokensTotal += (usage.input_tokens as number) || 0;
      stats.outputTokensTotal += (usage.output_tokens as number) || 0;
      stats.totalTokens += (usage.total_tokens as number) || 0;

      const response = (call.response as Record<string, unknown>) || {};
      if (Object.keys(response).length > 0) {
        const cacheInfo = extractUsageFromResponse(response);
        stats.openaiPromptTokensTotal += cacheInfo.openaiPromptTokens;
        stats.openaiCachedTokensTotal += cacheInfo.openaiCachedTokens;
        stats.anthropicInputTokensTotal += cacheInfo.anthropicInputTokens;
        stats.anthropicCacheReadTokensTotal += cacheInfo.anthropicCacheReadTokens;
        stats.anthropicCacheCreationTokensTotal += cacheInfo.anthropicCacheCreationTokens;
      }

      const metadata = (output.metadata as Record<string, unknown>) || {};
      const providerTiming = extractProviderTiming(metadata);
      stats.llmProviderTimeTotal += providerTiming.totalTime;
      stats.llmQueueTimeTotal += providerTiming.queueTime;
      stats.llmPromptTimeTotal += providerTiming.promptTime;
      stats.llmCompletionTimeTotal += providerTiming.completionTime;
    } else if (eventType === "tool" || eventType.toLowerCase().includes("tool")) {
      stats.nToolCalls++;
    }
  }

  const modelUsage = (sampleData.model_usage as Record<string, Record<string, unknown>>) || {};
  if (!stats.inputTokensTotal && Object.keys(modelUsage).length > 0) {
    for (const usage of Object.values(modelUsage)) {
      stats.inputTokensTotal += (usage.input_tokens as number) || 0;
      stats.outputTokensTotal += (usage.output_tokens as number) || 0;
      stats.totalTokens += (usage.total_tokens as number) || 0;
    }
  }

  return stats;
}

async function parseEvalFile(evalFilePath: string): Promise<EvalStats> {
  const evalStats: EvalStats = {
    logPath: evalFilePath,
    model: null,
    task: null,
    numSamples: 0,
    sampleStats: [],
  };

  try {
    const zipData = await readFile(evalFilePath);
    const zip = await JSZip.loadAsync(zipData);

    try {
      const startFile = zip.file("_journal/start.json");
      if (startFile) {
        const startContent = await startFile.async("string");
        const startData = JSON.parse(startContent);
        const evalInfo = startData.eval || {};
        evalStats.model = evalInfo.model || null;
        evalStats.task = evalInfo.task || null;
      }
    } catch {
      // Ignore errors reading start.json
    }

    const sampleFiles = Object.keys(zip.files).filter(
      (name) => name.startsWith("samples/") && name.endsWith(".json")
    );

    for (const sampleFile of sampleFiles) {
      try {
        const file = zip.file(sampleFile);
        if (file) {
          const content = await file.async("string");
          const sampleData = JSON.parse(content);
          const sampleStats = extractSampleStats(sampleData);
          evalStats.sampleStats.push(sampleStats);
        }
      } catch {
        // Ignore errors parsing individual samples
      }
    }

    evalStats.numSamples = evalStats.sampleStats.length;
  } catch (err) {
    console.error(`Warning: Could not read ZIP file ${evalFilePath}:`, err);
  }

  return evalStats;
}

async function parseJsonFile(jsonFilePath: string): Promise<EvalStats> {
  const evalStats: EvalStats = {
    logPath: jsonFilePath,
    model: null,
    task: null,
    numSamples: 0,
    sampleStats: [],
  };

  try {
    const content = await readFile(jsonFilePath, "utf-8");
    const data = JSON.parse(content);

    let samples: Record<string, unknown>[] = [];
    if (data.results?.samples) {
      samples = data.results.samples;
    } else if (data.samples) {
      samples = data.samples;
    }

    for (const sampleData of samples) {
      const sampleStats = extractSampleStats(sampleData);
      evalStats.sampleStats.push(sampleStats);
    }

    evalStats.numSamples = evalStats.sampleStats.length;

    if (data.eval) {
      evalStats.model = data.eval.model || null;
      evalStats.task = data.eval.task || null;
    }
  } catch (err) {
    console.error(`Warning: Could not parse ${jsonFilePath}:`, err);
  }

  return evalStats;
}

async function findLogFiles(logPath: string): Promise<string[]> {
  const pathStat = await stat(logPath);

  if (pathStat.isFile()) {
    const ext = extname(logPath);
    if (ext === ".eval" || ext === ".json") {
      return [logPath];
    }
    return [];
  }

  const logFiles: string[] = [];

  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== "samples") {
          await walk(fullPath);
        }
      } else if (entry.isFile()) {
        const ext = extname(entry.name);
        if (ext === ".eval") {
          logFiles.push(fullPath);
        } else if (ext === ".json" && !fullPath.includes("/samples/")) {
          logFiles.push(fullPath);
        }
      }
    }
  }

  await walk(logPath);
  return logFiles.sort();
}

function parseTimestampFromFilename(logPath: string): string | null {
  const filename = basename(logPath);
  // Format: 2025-01-15T10-30-00+04-00_progressivemcpbench_model.eval
  const match = filename.match(/^(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}[+-]\d{2}-\d{2})/);
  if (match) {
    // Convert 2025-01-15T10-30-00+04-00 to 2025-01-15T10:30:00+04:00
    const ts = match[1]
      .replace(/T(\d{2})-(\d{2})-(\d{2})/, "T$1:$2:$3")
      .replace(/([+-])(\d{2})-(\d{2})$/, "$1$2:$3");
    return new Date(ts).toISOString();
  }
  return null;
}

export function aggregateStats(evalStats: EvalStats): RunSummary {
  const samples = evalStats.sampleStats;
  const runAt = parseTimestampFromFilename(evalStats.logPath) || new Date().toISOString();

  if (samples.length === 0) {
    return {
      id: basename(evalStats.logPath, extname(evalStats.logPath)),
      logPath: evalStats.logPath,
      modelId: evalStats.model || "unknown",
      strategyId: "unknown",
      task: evalStats.task,
      sampleCount: 0,
      runAt,
      score: { mean: null, min: null, max: null, stderr: null },
      time: {
        totalSum: null,
        totalMean: null,
        totalP50: null,
        totalP95: null,
        workingSum: null,
        workingMean: null,
        llmHttpSum: null,
        llmHttpMean: null,
        llmTimeFraction: null,
        toolTimeApprox: null,
      },
      calls: { modelCalls: 0, toolCalls: 0 },
      tokens: { inputSum: 0, outputSum: 0, totalSum: 0, outputPerSec: null, inputPerSec: null },
      cache: {
        openaiPromptSum: 0,
        openaiCachedSum: 0,
        openaiHitRate: null,
        anthropicInputSum: 0,
        anthropicCacheReadSum: 0,
        anthropicCacheCreationSum: 0,
      },
    };
  }

  const totalTimes = samples.filter((s) => s.totalTime != null).map((s) => s.totalTime!);
  const workingTimes = samples.filter((s) => s.workingTime != null).map((s) => s.workingTime!);
  const scores = samples.filter((s) => s.score != null).map((s) => s.score!);

  const totalModelCalls = sum(samples.map((s) => s.nModelCalls));
  const totalToolCalls = sum(samples.map((s) => s.nToolCalls));

  const allHttpTimes: number[] = [];
  const allQueueTimes: number[] = [];
  const allPromptTimes: number[] = [];
  const allCompletionTimes: number[] = [];
  const allProviderTimes: number[] = [];

  for (const s of samples) {
    allHttpTimes.push(...s.llmHttpTimes);
    if (s.nModelCalls > 0) {
      allQueueTimes.push(s.llmQueueTimeTotal / s.nModelCalls);
      allPromptTimes.push(s.llmPromptTimeTotal / s.nModelCalls);
      allCompletionTimes.push(s.llmCompletionTimeTotal / s.nModelCalls);
      allProviderTimes.push(s.llmProviderTimeTotal / s.nModelCalls);
    }
  }

  const inputTokensSum = sum(samples.map((s) => s.inputTokensTotal));
  const outputTokensSum = sum(samples.map((s) => s.outputTokensTotal));
  const totalTokensSum = sum(samples.map((s) => s.totalTokens));

  const llmCompletionTimeSum = sum(samples.map((s) => s.llmCompletionTimeTotal));
  const outputTokensPerSec = llmCompletionTimeSum > 0 ? outputTokensSum / llmCompletionTimeSum : null;

  const llmPromptTimeSum = sum(samples.map((s) => s.llmPromptTimeTotal));
  const inputTokensPerSec = llmPromptTimeSum > 0 ? inputTokensSum / llmPromptTimeSum : null;

  const openaiPromptSum = sum(samples.map((s) => s.openaiPromptTokensTotal));
  const openaiCachedSum = sum(samples.map((s) => s.openaiCachedTokensTotal));

  const anthropicInputSum = sum(samples.map((s) => s.anthropicInputTokensTotal));
  const anthropicCacheReadSum = sum(samples.map((s) => s.anthropicCacheReadTokensTotal));
  const anthropicCacheCreationSum = sum(samples.map((s) => s.anthropicCacheCreationTokensTotal));

  const llmHttpTimeSum = sum(samples.map((s) => s.llmHttpTimeTotal));
  const workingTimeSum = sum(workingTimes);
  const toolTimeApprox = workingTimes.length > 0 ? workingTimeSum - llmHttpTimeSum : null;
  const llmTimeFraction = workingTimeSum > 0 ? llmHttpTimeSum / workingTimeSum : null;

  return {
    id: basename(evalStats.logPath, extname(evalStats.logPath)),
    logPath: evalStats.logPath,
    modelId: evalStats.model || "unknown",
    strategyId: "unknown",
    task: evalStats.task,
    sampleCount: samples.length,
    runAt,
    score: {
      mean: mean(scores),
      min: scores.length > 0 ? Math.min(...scores) : null,
      max: scores.length > 0 ? Math.max(...scores) : null,
      stderr: stderr(scores),
    },
    time: {
      totalSum: totalTimes.length > 0 ? sum(totalTimes) : null,
      totalMean: mean(totalTimes),
      totalP50: median(totalTimes),
      totalP95: percentile(totalTimes, 0.95),
      workingSum: workingTimes.length > 0 ? workingTimeSum : null,
      workingMean: mean(workingTimes),
      llmHttpSum: llmHttpTimeSum,
      llmHttpMean: mean(allHttpTimes),
      llmTimeFraction,
      toolTimeApprox,
    },
    calls: {
      modelCalls: totalModelCalls,
      toolCalls: totalToolCalls,
    },
    tokens: {
      inputSum: inputTokensSum,
      outputSum: outputTokensSum,
      totalSum: totalTokensSum,
      outputPerSec: outputTokensPerSec,
      inputPerSec: inputTokensPerSec,
    },
    cache: {
      openaiPromptSum,
      openaiCachedSum,
      openaiHitRate: openaiPromptSum > 0 ? openaiCachedSum / openaiPromptSum : null,
      anthropicInputSum,
      anthropicCacheReadSum,
      anthropicCacheCreationSum,
    },
    provider: {
      queueTimeMean: mean(allQueueTimes),
      promptTimeMean: mean(allPromptTimes),
      completionTimeMean: mean(allCompletionTimes),
      providerTimeMean: mean(allProviderTimes),
    },
  };
}

export interface ExtractOptions {
  logsDir: string;
  minSamples?: number;
  sinceTimestamp?: number;
}

export async function extractEvalStats(options: ExtractOptions): Promise<RunSummary[]> {
  const { logsDir, minSamples = 1, sinceTimestamp = 0 } = options;

  const allLogFiles = await findLogFiles(logsDir);
  
  // Filter to only logs newer than sinceTimestamp
  const logFiles: string[] = [];
  for (const logFile of allLogFiles) {
    const fileStat = await stat(logFile);
    if (fileStat.mtimeMs > sinceTimestamp) {
      logFiles.push(logFile);
    }
  }
  
  console.log(`Found ${logFiles.length} log file(s) to process (of ${allLogFiles.length} total)`);

  const runs: RunSummary[] = [];

  for (const logFile of logFiles) {
    console.log(`Processing ${logFile}`);

    let evalStats: EvalStats;
    if (logFile.endsWith(".eval")) {
      evalStats = await parseEvalFile(logFile);
    } else {
      evalStats = await parseJsonFile(logFile);
    }

    if (evalStats.numSamples >= minSamples) {
      const runSummary = aggregateStats(evalStats);
      runs.push(runSummary);
    } else {
      console.log(`  Skipping: only ${evalStats.numSamples} samples (min: ${minSamples})`);
    }
  }

  return runs;
}

export async function parseLogFile(logFile: string): Promise<EvalStats> {
  if (logFile.endsWith(".eval")) {
    return parseEvalFile(logFile);
  } else {
    return parseJsonFile(logFile);
  }
}

function formatNumber(num: number | null, unit: string = ""): string {
  if (num === null || num === undefined) return "N/A";
  return `${num.toLocaleString()}${unit}`;
}

function formatTime(ms: number | null): string {
  if (ms === null || ms === undefined) return "N/A";
  if (ms < 1000) return `${ms.toFixed(0)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function formatDuration(isoString: string): string {
  try {
    const date = new Date(isoString);
    return date.toLocaleString();
  } catch {
    return isoString;
  }
}

function formatRunSummary(runs: RunSummary[]): string {
  if (runs.length === 0) {
    return "No evaluation runs found matching criteria.";
  }

  // Sort by timestamp (most recent first)
  const sortedRuns = [...runs].sort((a, b) => {
    return new Date(b.runAt).getTime() - new Date(a.runAt).getTime();
  });

  let output = `\n📊 Evaluation Statistics Summary\n`;
  output += `Found ${sortedRuns.length} run(s)\n\n`;

  // Group by date
  const runsByDate = new Map<string, RunSummary[]>();
  for (const run of sortedRuns) {
    const date = new Date(run.runAt).toDateString();
    if (!runsByDate.has(date)) {
      runsByDate.set(date, []);
    }
    runsByDate.get(date)!.push(run);
  }

  for (const [date, dateRuns] of runsByDate) {
    output += `📅 ${date}\n`;
    output += `${"─".repeat(80)}\n`;

    for (const run of dateRuns) {
      output += `\n🔧 ${run.modelId} + ${run.strategyId}\n`;
      output += `   Task: ${run.task || "N/A"}\n`;
      output += `   Samples: ${run.sampleCount}\n`;
      output += `   Score: ${formatNumber(run.score.mean, "")} (min: ${formatNumber(run.score.min, "")}, max: ${formatNumber(run.score.max, "")})\n`;
      
      // Performance metrics
      output += `   ⏱️  Timing:\n`;
      output += `      Total: ${formatTime(run.time.totalMean)} avg (${formatTime(run.time.totalP50)} p50, ${formatTime(run.time.totalP95)} p95)\n`;
      output += `      Working: ${formatTime(run.time.workingMean)} avg\n`;
      output += `      LLM HTTP: ${formatTime(run.time.llmHttpMean)} avg per call\n`;
      if (run.time.llmTimeFraction !== null) {
        output += `      LLM Time Fraction: ${(run.time.llmTimeFraction * 100).toFixed(1)}%\n`;
      }
      
      // Model and tool calls
      output += `   🔄 Activity:\n`;
      output += `      LLM: ${run.calls.modelCalls} calls\n`;
      output += `      Tools: ${run.calls.toolCalls} calls\n`;
      
      // Token throughput
      if (run.tokens.inputPerSec !== null || run.tokens.outputPerSec !== null) {
        output += `   ⚡ Throughput:\n`;
        if (run.tokens.inputPerSec !== null) {
          output += `      Input: ${formatNumber(run.tokens.inputPerSec, "")} tokens/sec\n`;
        }
        if (run.tokens.outputPerSec !== null) {
          output += `      Output: ${formatNumber(run.tokens.outputPerSec, "")} tokens/sec\n`;
        }
      }
      
      // Token usage
      output += `   🔢 Tokens: ${formatNumber(run.tokens.inputSum, " in")}, ${formatNumber(run.tokens.outputSum, " out")}`;
      
      // Cache info
      if (run.cache.openaiPromptSum > 0) {
        const hitRate = run.cache.openaiHitRate ? (run.cache.openaiHitRate * 100).toFixed(1) : "N/A";
        output += ` (OpenAI cache: ${formatNumber(run.cache.openaiCachedSum, "")}/${formatNumber(run.cache.openaiPromptSum, "")} = ${hitRate}% hit)`;
      } else if (run.cache.anthropicCacheReadSum > 0 || run.cache.anthropicCacheCreationSum > 0) {
        output += ` (Anthropic cache: ${formatNumber(run.cache.anthropicCacheReadSum, "")} read + ${formatNumber(run.cache.anthropicCacheCreationSum, "")} created)`;
      }
      
      output += `\n`;
      
      output += `   📂 Log: ${run.logPath}\n`;
    }
    output += `\n`;
  }

  // Add summary statistics
  output += `\n📈 Overall Summary\n`;
  output += `${"─".repeat(80)}\n`;

  const totalSamples = sortedRuns.reduce((sum, run) => sum + run.sampleCount, 0);
  const totalModelCalls = sortedRuns.reduce((sum, run) => sum + run.calls.modelCalls, 0);
  const totalToolCalls = sortedRuns.reduce((sum, run) => sum + run.calls.toolCalls, 0);
  const totalInputTokens = sortedRuns.reduce((sum, run) => sum + run.tokens.inputSum, 0);
  const totalOutputTokens = sortedRuns.reduce((sum, run) => sum + run.tokens.outputSum, 0);

  output += `Total Runs: ${sortedRuns.length}\n`;
  output += `Total Samples: ${formatNumber(totalSamples)}\n`;
  output += `Total Model Calls: ${formatNumber(totalModelCalls)}\n`;
  output += `Total Tool Calls: ${formatNumber(totalToolCalls)}\n`;
  output += `Total Input Tokens: ${formatNumber(totalInputTokens)}\n`;
  output += `Total Output Tokens: ${formatNumber(totalOutputTokens)}\n`;

  return output;
}

interface CLIOptions {
  logsDir: string;
  minSamples?: number;
  sinceTimestamp?: number;
  help?: boolean;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const options: CLIOptions = {
    logsDir: "",
    minSamples: 1,
    sinceTimestamp: 0,
    help: false,
  };

  // Parse command line arguments
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--logs" || arg === "-l") {
      options.logsDir = args[++i] || "";
    } else if (arg === "--min-samples") {
      const val = args[++i];
      options.minSamples = val ? parseInt(val, 10) : 1;
    } else if (arg === "--since") {
      const val = args[++i];
      if (val) {
        // Parse ISO date string or timestamp
        const date = new Date(val);
        if (!isNaN(date.getTime())) {
          options.sinceTimestamp = date.getTime();
        } else {
          const timestamp = parseInt(val, 10);
          if (!isNaN(timestamp)) {
            options.sinceTimestamp = timestamp;
          }
        }
      }
    } else if (!arg.startsWith("--") && !arg.startsWith("-") && options.logsDir === "") {
      // First non-flag argument is logs directory
      options.logsDir = arg;
    }
  }

  if (options.help) {
    console.log(`
🔍 Extract Evaluation Statistics

Usage: bun run extractEvalStats.ts [options] [logs_directory]

Arguments:
  logs_directory        Path to logs directory (required if not using --logs)

Options:
  --logs, -l <path>     Path to logs directory
  --min-samples <n>     Minimum samples required (default: 1)
  --since <timestamp>    Only process logs newer than this timestamp
                        (ISO date string or Unix timestamp)
  --help, -h            Show this help message

Examples:
  bun run extractEvalStats.ts /path/to/logs
  bun run extractEvalStats.ts --logs /path/to/logs --min-samples 10
  bun run extractEvalStats.ts --logs /path/to/logs --since "2025-12-01"
`);
    process.exit(0);
  }

  if (!options.logsDir) {
    console.error("❌ Error: Logs directory is required");
    console.error("Use --help for usage information");
    process.exit(1);
  }

  try {
    console.log(`🔍 Extracting evaluation statistics...`);
    console.log(`📁 Logs directory: ${options.logsDir}`);
    console.log(`📊 Minimum samples: ${options.minSamples}`);
    if (options.sinceTimestamp > 0) {
      console.log(`⏰ Since: ${new Date(options.sinceTimestamp).toISOString()}`);
    }
    console.log();

    const runs = await extractEvalStats({
      logsDir: options.logsDir,
      minSamples: options.minSamples,
      sinceTimestamp: options.sinceTimestamp,
    });

    const output = formatRunSummary(runs);
    console.log(output);

  } catch (error) {
    console.error("❌ Error:", error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

// Only run main() if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}
