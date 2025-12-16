#!/usr/bin/env bun
/**
 * Analyze failure modes in ProgressiveMCPBench evaluation logs.
 *
 * Usage:
 *   # Analyze the last 5 runs
 *   bun run analyzeFailures.ts -n 5
 *
 *   # Analyze runs from the last 30 minutes
 *   bun run analyzeFailures.ts --since 30m
 *
 *   # Analyze runs since a specific timestamp
 *   bun run analyzeFailures.ts --since 2025-01-15T10:30:00Z
 *
 *   # Analyze a specific log file
 *   bun run analyzeFailures.ts --log-file logs/my-evaluation.eval
 *
 *   # Limit failures per run
 *   bun run analyzeFailures.ts -n 5 --max-per-run 10
 *
 *   # Skip LLM categorization (just extract failures)
 *   bun run analyzeFailures.ts -n 5 --no-llm
 */

import { readdir, readFile, stat } from "fs/promises";
import { join, basename, extname } from "path";
import JSZip from "jszip";

interface FailedSample {
  evalFile: string;
  model: string;
  strategy: string;
  task: string;
  sampleId: string;
  epoch: number;
  inputPrompt: string;
  target: string[];
  finalAnswer: string | null;
  toolCallsMade: ToolCall[];
  errorMessages: string[];
  timeout: boolean;
  score: number;
  category: string | null;
  failureCategory: string | null;
  failureExplanation: string | null;
}

interface ToolCall {
  function?: string;
  arguments?: unknown;
  responsePreview?: string | null;
}

interface Message {
  role?: string;
  content?: string | ContentPart[];
  tool_calls?: { function?: string; arguments?: unknown }[];
  function?: string;
}

interface ContentPart {
  text?: string;
}

interface FailureSummary {
  totalFailures: number;
  infrastructureFailures: number;
  genuineFailures: number;
  byCategory: Record<string, number>;
  byModel: Record<string, number>;
  byStrategy: Record<string, number>;
}

interface RunAnalysis {
  evalFile: string;
  logPath: string;
  model: string;
  strategy: string;
  rerunCommand: string;
  failureCount: number;
  passCount: number;
  totalCount: number;
  summary: FailureSummary;
  failures: FailedSample[];
}

function extractToolCalls(messages: Message[]): ToolCall[] {
  const toolCalls: ToolCall[] = [];
  for (const msg of messages) {
    if (msg.role === "assistant" && msg.tool_calls) {
      for (const tc of msg.tool_calls) {
        toolCalls.push({
          function: tc.function,
          arguments: tc.arguments,
        });
      }
    }
    if (msg.role === "tool") {
      let content = msg.content || "";
      if (Array.isArray(content)) {
        content = content
          .filter((c): c is ContentPart => typeof c === "object" && c !== null)
          .map((c) => c.text || "")
          .join(" ");
      }
      toolCalls.push({
        function: msg.function,
        responsePreview: typeof content === "string" ? content.slice(0, 500) : null,
      });
    }
  }
  return toolCalls;
}

function extractErrorMessages(messages: Message[]): string[] {
  const errors: string[] = [];
  for (const msg of messages) {
    let text = "";
    const content = msg.content;
    if (typeof content === "string") {
      text = content;
    } else if (Array.isArray(content)) {
      text = content
        .filter((c): c is ContentPart => typeof c === "object" && c !== null)
        .map((c) => c.text || "")
        .join(" ");
    }

    const lowerText = text.toLowerCase();
    if (
      ["error:", "exception:", "timeout", "failed", "timed out"].some((pattern) =>
        lowerText.includes(pattern)
      )
    ) {
      errors.push(text.slice(0, 500));
    }
  }
  return errors;
}

function extractFinalAnswer(messages: Message[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role === "assistant") {
      const content = msg.content;
      if (typeof content === "string") {
        return content.slice(0, 1000);
      } else if (Array.isArray(content)) {
        const texts = content
          .filter((c): c is ContentPart => typeof c === "object" && c !== null)
          .map((c) => c.text || "");
        return texts.join(" ").slice(0, 1000);
      }
    }
  }
  return null;
}

function checkTimeout(sample: Record<string, unknown>): boolean {
  const errorRetries = sample.error_retries as unknown[] | undefined;
  if (errorRetries) {
    for (const error of errorRetries) {
      if (String(error).toLowerCase().includes("timeout")) {
        return true;
      }
    }
  }

  const totalTime = sample.total_time as number | undefined;
  if (totalTime && totalTime > 600) {
    return true;
  }

  return false;
}

function parseSample(
  sample: Record<string, unknown>,
  evalFile: string,
  model: string,
  strategy: string,
  task: string
): { failed: FailedSample | null; passed: boolean } {
  const scores = (sample.scores as Record<string, unknown>) || {};
  const scorer = (scores.progressivemcpbench_scorer as Record<string, unknown>) || {};
  const score = (scorer.value as number) ?? 1.0;

  const messages = (sample.messages as Message[]) || [];
  const metadata = (sample.metadata as Record<string, unknown>) || {};

  if (score > 0.0) {
    return { failed: null, passed: true };
  }

  const errorMessages = extractErrorMessages(messages);
  const metadataError = metadata.error_message as string | undefined;
  if (metadataError) {
    errorMessages.unshift(metadataError);
  }

  return {
    passed: false,
    failed: {
      evalFile,
      model,
      strategy,
      task,
      sampleId: (sample.id as string) || "unknown",
      epoch: (sample.epoch as number) || 0,
      inputPrompt: String(sample.input || "").slice(0, 500),
      target: (sample.target as string[]) || [],
      finalAnswer: extractFinalAnswer(messages),
      toolCallsMade: extractToolCalls(messages),
      errorMessages,
      timeout: checkTimeout(sample),
      score,
      category: (metadata.category as string) || null,
      failureCategory: null,
      failureExplanation: null,
    },
  };
}

interface EvalParseResult {
  failures: FailedSample[];
  passCount: number;
  totalCount: number;
  model: string;
  strategy: string;
}

async function parseEvalFile(
  evalPath: string,
  verbose: boolean = false
): Promise<EvalParseResult> {
  const failures: FailedSample[] = [];
  let passCount = 0;
  let totalCount = 0;
  let model = "unknown";
  let strategy = "unknown";

  try {
    const zipData = await readFile(evalPath);
    const zip = await JSZip.loadAsync(zipData);

    try {
      const startFile = zip.file("_journal/start.json");
      if (startFile) {
        const startContent = await startFile.async("string");
        const startData = JSON.parse(startContent);
        const evalInfo = startData.eval || {};
        model = evalInfo.model || "unknown";
        const task = evalInfo.task || "unknown";
        const taskArgs = evalInfo.task_args || {};
        strategy = taskArgs.strategy || "unknown";

        if (verbose) {
          console.log(`  Model: ${model}, Strategy: ${strategy}`);
        }

        const sampleFiles = Object.keys(zip.files).filter(
          (name) => name.startsWith("samples/") && name.endsWith(".json")
        );

        for (const sampleFile of sampleFiles) {
          try {
            const file = zip.file(sampleFile);
            if (file) {
              const content = await file.async("string");
              const sample = JSON.parse(content);
              totalCount++;
              const result = parseSample(sample, basename(evalPath), model, strategy, task);
              if (result.passed) {
                passCount++;
              } else if (result.failed) {
                failures.push(result.failed);
              }
            }
          } catch {
            if (verbose) {
              console.log(`    Warning: Could not parse ${sampleFile}`);
            }
          }
        }
      }
    } catch {
      // Ignore errors reading start.json
    }
  } catch (err) {
    console.error(`Warning: Could not open ${evalPath}:`, err);
  }

  return { failures, passCount, totalCount, model, strategy };
}

const CATEGORIZATION_PROMPT = `You are analyzing a failed task from an AI agent benchmark that tests MCP (Model Context Protocol) tool usage.

The agent was given a task and had access to MCP tools. The task failed (score=0). Analyze WHY it failed.

## Task Details
- Model: {model}
- Strategy: {strategy}
- Task Category: {category}
- Input: {inputPrompt}
- Expected Answer: {target}
- Agent's Answer: {finalAnswer}

## Tool Calls Made
{toolCalls}

## Error Messages Detected
{errors}

## Timeout
{timeout}

---

Categorize this failure into ONE of these categories:

1. **TOOL_NOT_FOUND** - Agent couldn't find the right tool via routing/discovery
2. **TOOL_CALL_ERROR** - Tool was found but returned an error when called
3. **TOOL_TIMEOUT** - Tool call timed out
4. **WRONG_TOOL_USED** - Agent used the wrong tool for the task
5. **INCOMPLETE_ANSWER** - Agent got partial info but didn't complete the task
6. **PARSING_ERROR** - Agent got correct data but couldn't parse/format the answer correctly
7. **REASONING_ERROR** - Agent made a logical/reasoning mistake
8. **NO_TOOLS_CALLED** - Agent didn't call any tools at all
9. **INFRASTRUCTURE_ERROR** - System/infrastructure failure (not agent's fault)
10. **GAVE_UP** - Agent explicitly stated it couldn't complete the task

Respond with JSON only:
{
  "category": "<one of the categories above>",
  "explanation": "<1-2 sentence explanation of what went wrong>"
}`;

async function categorizeFailure(
  failure: FailedSample,
  apiKey: string
): Promise<void> {
  const toolCallsStr = failure.toolCallsMade.length
    ? JSON.stringify(failure.toolCallsMade.slice(0, 10), null, 2)
    : "None";
  const errorsStr = failure.errorMessages.length
    ? failure.errorMessages.slice(0, 5).join("\n")
    : "None";

  const prompt = CATEGORIZATION_PROMPT.replace("{model}", failure.model)
    .replace("{strategy}", failure.strategy)
    .replace("{category}", failure.category || "Unknown")
    .replace("{inputPrompt}", failure.inputPrompt)
    .replace("{target}", JSON.stringify(failure.target))
    .replace("{finalAnswer}", failure.finalAnswer || "None")
    .replace("{toolCalls}", toolCallsStr)
    .replace("{errors}", errorsStr)
    .replace("{timeout}", failure.timeout ? "Yes" : "No");

  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "openai/gpt-oss-120b",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.0,
        max_tokens: 200,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API error: ${response.status} ${errorText}`);
    }

    const data = (await response.json()) as {
      choices: { message: { content: string } }[];
    };
    const content = data.choices[0]?.message?.content;

    if (content) {
      let text = content.trim();
      if (text.includes("```")) {
        const parts = text.split("```");
        if (parts.length >= 2) {
          text = parts[1];
          if (text.startsWith("json")) {
            text = text.slice(4);
          }
        }
      }
      const start = text.indexOf("{");
      const end = text.lastIndexOf("}") + 1;
      if (start >= 0 && end > start) {
        text = text.slice(start, end);
      }

      try {
        const result = JSON.parse(text);
        failure.failureCategory = result.category || "UNKNOWN";
        failure.failureExplanation = result.explanation || "";
      } catch {
        const match = content.match(/"category"\s*:\s*"([^"]+)"/);
        if (match) {
          failure.failureCategory = match[1];
          const expMatch = content.match(/"explanation"\s*:\s*"([^"]*)"/);
          failure.failureExplanation = expMatch ? expMatch[1] : content.slice(0, 200);
        } else {
          failure.failureCategory = "PARSE_ERROR";
          failure.failureExplanation = content.slice(0, 200);
        }
      }
    } else {
      failure.failureCategory = "EMPTY_RESPONSE";
      failure.failureExplanation = "LLM returned empty response";
    }
  } catch (err) {
    const errorStr = String(err);
    if (errorStr.toLowerCase().includes("rate") || errorStr.toLowerCase().includes("limit")) {
      failure.failureCategory = "RATE_LIMITED";
    } else {
      failure.failureCategory = "LLM_ERROR";
    }
    failure.failureExplanation = errorStr.slice(0, 200);
  }
}

async function categorizeFailures(
  failures: FailedSample[],
  concurrency: number = 10
): Promise<void> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    console.error("Error: GROQ_API_KEY not set");
    return;
  }

  console.log(`Categorizing ${failures.length} failures using gpt-oss-120b...`);

  const semaphore = { count: 0 };
  const queue = [...failures];
  let completed = 0;

  const workers = Array.from({ length: concurrency }, async () => {
    while (queue.length > 0) {
      const failure = queue.shift();
      if (!failure) break;

      await categorizeFailure(failure, apiKey);
      completed++;

      if (completed % 50 === 0) {
        console.log(`  Progress: ${completed}/${failures.length}`);
      }
    }
  });

  await Promise.all(workers);
  console.log(`  Done: ${completed}/${failures.length} categorized`);
}

function generateSummary(failures: FailedSample[]): FailureSummary {
  const categoryCountsRaw: Record<string, number> = {};
  const modelCountsRaw: Record<string, number> = {};
  const strategyCountsRaw: Record<string, number> = {};

  for (const f of failures) {
    const cat = f.failureCategory || "UNCATEGORIZED";
    categoryCountsRaw[cat] = (categoryCountsRaw[cat] || 0) + 1;
    modelCountsRaw[f.model] = (modelCountsRaw[f.model] || 0) + 1;
    strategyCountsRaw[f.strategy] = (strategyCountsRaw[f.strategy] || 0) + 1;
  }

  const sortByCount = (obj: Record<string, number>) =>
    Object.fromEntries(Object.entries(obj).sort((a, b) => b[1] - a[1]));

  const infraCategories = new Set(["TOOL_CALL_ERROR", "TOOL_TIMEOUT", "INFRASTRUCTURE_ERROR"]);
  const infraFailures = failures.filter((f) =>
    f.failureCategory ? infraCategories.has(f.failureCategory) : false
  ).length;

  return {
    totalFailures: failures.length,
    infrastructureFailures: infraFailures,
    genuineFailures: failures.length - infraFailures,
    byCategory: sortByCount(categoryCountsRaw),
    byModel: sortByCount(modelCountsRaw),
    byStrategy: sortByCount(strategyCountsRaw),
  };
}

async function findProgressiveMcpBenchLogs(logsDir: string): Promise<string[]> {
  const logFiles: string[] = [];

  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== "samples") {
          await walk(fullPath);
        }
      } else if (entry.isFile() && entry.name.endsWith(".eval")) {
        if (entry.name.includes("progressivemcpbench")) {
          logFiles.push(fullPath);
        }
      }
    }
  }

  await walk(logsDir);
  return logFiles.sort();
}

function parseRelativeTime(timeStr: string): number {
  const match = timeStr.match(/^(\d+)(s|m|h|d)$/);
  if (!match) {
    throw new Error(`Invalid relative time format: ${timeStr}. Use formats like 30m, 2h, 1d`);
  }

  const value = parseInt(match[1], 10);
  const unit = match[2];

  const multipliers: Record<string, number> = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  };

  return Date.now() - value * multipliers[unit];
}

function parseSinceArg(since: string): { timestamp: number; isRelative: boolean } {
  if (/^\d+(s|m|h|d)$/.test(since)) {
    return { timestamp: parseRelativeTime(since), isRelative: true };
  }

  const parsed = Date.parse(since);
  if (isNaN(parsed)) {
    throw new Error(`Invalid --since value: ${since}. Use relative (30m, 2h) or ISO timestamp.`);
  }
  return { timestamp: parsed, isRelative: false };
}

function printUsage(): void {
  console.log(`
Usage: bun run analyzeFailures.ts [options]

Options:
  -n <count>         Analyze the last N runs (by file modification time)
  --since <time>     Analyze runs since time (e.g., 30m, 2h, 1d, or ISO timestamp)
  --log-file <path>  Analyze a specific .eval file
  --logs-dir <path>  Directory containing .eval files (default: ../data/logs)
  --max-per-run <n>  Max failures to extract per eval file
  --no-llm           Skip LLM categorization
  --concurrency <n>  LLM API concurrency (default: 10)
  -v, --verbose      Verbose output
  -h, --help         Show this help

Examples:
  bun run analyzeFailures.ts -n 5
  bun run analyzeFailures.ts --since 30m
  bun run analyzeFailures.ts --since 2025-01-15T10:30:00Z
  bun run analyzeFailures.ts --log-file ../data/logs/my-eval.eval
`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  let logsDir = join(import.meta.dirname, "..", "..", "openbench", "logs");
  let logFile: string | null = null;
  let lastN: number | null = null;
  let since: string | null = null;
  let maxPerRun: number | null = null;
  let noLlm = false;
  let concurrency = 10;
  let verbose = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case "-n":
        lastN = parseInt(args[++i], 10);
        break;
      case "--since":
        since = args[++i];
        break;
      case "--log-file":
        logFile = args[++i];
        break;
      case "--logs-dir":
        logsDir = args[++i];
        break;
      case "--max-per-run":
        maxPerRun = parseInt(args[++i], 10);
        break;
      case "--no-llm":
        noLlm = true;
        break;
      case "--concurrency":
        concurrency = parseInt(args[++i], 10);
        break;
      case "-v":
      case "--verbose":
        verbose = true;
        break;
      case "-h":
      case "--help":
        printUsage();
        process.exit(0);
    }
  }

  let evalFiles: string[] = [];
  let sinceTimestamp: number | null = null;

  if (logFile) {
    try {
      await stat(logFile);
      evalFiles = [logFile];
      console.log(`Analyzing specific log file: ${logFile}`);
    } catch {
      console.error(`Error: Log file not found: ${logFile}`);
      process.exit(1);
    }
  } else {
    const allLogs = await findProgressiveMcpBenchLogs(logsDir);

    if (allLogs.length === 0) {
      console.error(`No progressivemcpbench .eval files found in ${logsDir}`);
      process.exit(1);
    }

    const logsWithMtime = await Promise.all(
      allLogs.map(async (f) => {
        const s = await stat(f);
        return { path: f, mtime: s.mtimeMs };
      })
    );

    logsWithMtime.sort((a, b) => b.mtime - a.mtime);

    if (lastN) {
      evalFiles = logsWithMtime.slice(0, lastN).map((l) => l.path);
      console.log(`Analyzing last ${lastN} runs (${evalFiles.length} files)`);
    } else if (since) {
      const { timestamp, isRelative } = parseSinceArg(since);
      sinceTimestamp = timestamp;

      if (isRelative) {
        console.log(`Using cutoff timestamp: ${new Date(timestamp).toISOString()}`);
        console.log(`  (rerun with: --since ${new Date(timestamp).toISOString()})`);
      }

      evalFiles = logsWithMtime.filter((l) => l.mtime >= timestamp).map((l) => l.path);
      console.log(`Found ${evalFiles.length} runs since ${new Date(timestamp).toISOString()}`);
    } else {
      console.error("Error: Must specify -n <count>, --since <time>, or --log-file <path>");
      printUsage();
      process.exit(1);
    }
  }

  if (evalFiles.length === 0) {
    console.log("No matching log files found.");
    process.exit(0);
  }

  const runAnalyses: RunAnalysis[] = [];

  for (const evalFile of evalFiles) {
    if (verbose) {
      console.log(`\nProcessing ${evalFile}...`);
    }

    const { failures, passCount, totalCount, model, strategy } = await parseEvalFile(
      evalFile,
      verbose
    );

    let processedFailures = failures;
    if (maxPerRun && failures.length > maxPerRun) {
      processedFailures = failures.slice(0, maxPerRun);
    }

    if (!noLlm && processedFailures.length > 0) {
      await categorizeFailures(processedFailures, concurrency);
    }

    const summary = generateSummary(processedFailures);
    const rerunCommand = `bun run analyzeFailures.ts --log-file "${evalFile}"`;

    runAnalyses.push({
      evalFile: basename(evalFile),
      logPath: evalFile,
      model,
      strategy,
      rerunCommand,
      failureCount: failures.length,
      passCount,
      totalCount,
      summary,
      failures: processedFailures,
    });
  }

  console.log("\n" + "=".repeat(80));
  console.log("FAILURE ANALYSIS RESULTS");
  console.log("=".repeat(80));

  for (const run of runAnalyses) {
    console.log(`\n${"─".repeat(80)}`);
    console.log(`File: ${run.evalFile}`);
    console.log(`Model: ${run.model} | Strategy: ${run.strategy}`);
    console.log(`Results: ${run.passCount}/${run.totalCount} passed, ${run.failureCount} failed`);
    console.log(`Rerun: ${run.rerunCommand}`);

    if (run.failures.length > 0) {
      const summary = run.summary;

      console.log(`\n  Failures: ${summary.totalFailures}`);
      console.log(`    Infrastructure: ${summary.infrastructureFailures}`);
      console.log(`    Genuine: ${summary.genuineFailures}`);

      if (Object.keys(summary.byCategory).length > 0) {
        console.log("\n  By Category:");
        for (const [cat, count] of Object.entries(summary.byCategory)) {
          const pct = ((count / summary.totalFailures) * 100).toFixed(1);
          console.log(`    ${cat}: ${count} (${pct}%)`);
          
          const failuresInCategory = run.failures.filter(f => (f.failureCategory || "UNCATEGORIZED") === cat);
          const causeGroups = new Map<string, { count: number; sampleIds: string[] }>();
          
          for (const f of failuresInCategory) {
            const cause = f.errorMessages[0] || f.failureExplanation || "Unknown cause";
            const truncatedCause = cause.length > 120 ? cause.slice(0, 120) + "..." : cause;
            const existing = causeGroups.get(truncatedCause);
            if (existing) {
              existing.count++;
              existing.sampleIds.push(f.sampleId);
            } else {
              causeGroups.set(truncatedCause, { count: 1, sampleIds: [f.sampleId] });
            }
          }
          
          const sortedCauses = [...causeGroups.entries()].sort((a, b) => b[1].count - a[1].count);
          for (const [cause, { count: causeCount, sampleIds }] of sortedCauses) {
            const samplePreview = sampleIds.length <= 3 
              ? sampleIds.map(id => id.slice(0, 8)).join(", ")
              : `${sampleIds.slice(0, 3).map(id => id.slice(0, 8)).join(", ")}...`;
            console.log(`      ${causeCount}x: ${cause}`);
            console.log(`         samples: ${samplePreview}`);
          }
        }
      }

      if (verbose) {
        console.log("\n  Sample Failures:");
        for (const f of run.failures.slice(0, 3)) {
          console.log(`    - [${f.failureCategory}] ${f.sampleId}: ${f.failureExplanation || "No explanation"}`);
        }
      }
    }
  }

  console.log("\n" + "=".repeat(80));

  const totalRuns = runAnalyses.length;
  const totalFailures = runAnalyses.reduce((sum, r) => sum + r.failureCount, 0);
  const totalPassed = runAnalyses.reduce((sum, r) => sum + r.passCount, 0);
  const totalSamples = runAnalyses.reduce((sum, r) => sum + r.totalCount, 0);

  console.log(`\nSummary: ${totalRuns} run(s), ${totalPassed}/${totalSamples} passed, ${totalFailures} failures`);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
