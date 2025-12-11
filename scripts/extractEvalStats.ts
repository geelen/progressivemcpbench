import { readdir, readFile, stat } from "fs/promises";
import { join, basename, extname } from "path";
import JSZip from "jszip";
import type { SampleStats, EvalStats, RunSummary } from "./types/report";

function mean(arr: number[]): number | null {
  if (arr.length === 0) return null;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
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

export function aggregateStats(evalStats: EvalStats): RunSummary {
  const samples = evalStats.sampleStats;

  if (samples.length === 0) {
    return {
      id: basename(evalStats.logPath, extname(evalStats.logPath)),
      logPath: evalStats.logPath,
      modelId: evalStats.model || "unknown",
      strategyId: "unknown",
      task: evalStats.task,
      sampleCount: 0,
      score: { mean: null, min: null, max: null },
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
    score: {
      mean: mean(scores),
      min: scores.length > 0 ? Math.min(...scores) : null,
      max: scores.length > 0 ? Math.max(...scores) : null,
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
}

export async function extractEvalStats(options: ExtractOptions): Promise<RunSummary[]> {
  const { logsDir, minSamples = 1 } = options;

  const logFiles = await findLogFiles(logsDir);
  console.log(`Found ${logFiles.length} log file(s)`);

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
