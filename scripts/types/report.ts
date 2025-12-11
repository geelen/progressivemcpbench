import type { ModelConfig, StrategyConfig } from "../benchConfig";

export interface MetricConfig {
  id: string;
  group: "score" | "time" | "tokens" | "cache" | "calls";
  label: string;
  description?: string;
  unit?: string;
}

export const METRICS: MetricConfig[] = [
  { id: "score_mean", group: "score", label: "Score (mean)" },
  { id: "score_min", group: "score", label: "Score (min)" },
  { id: "score_max", group: "score", label: "Score (max)" },
  { id: "total_time_sum", group: "time", label: "Total Time (sum)", unit: "s" },
  { id: "total_time_mean", group: "time", label: "Total Time (mean)", unit: "s" },
  { id: "working_time_sum", group: "time", label: "Working Time (sum)", unit: "s" },
  { id: "working_time_mean", group: "time", label: "Working Time (mean)", unit: "s" },
  { id: "llm_http_time_sum", group: "time", label: "LLM HTTP Time (sum)", unit: "s" },
  { id: "llm_http_time_mean", group: "time", label: "LLM HTTP Time (mean)", unit: "s" },
  { id: "input_tokens_sum", group: "tokens", label: "Input Tokens" },
  { id: "output_tokens_sum", group: "tokens", label: "Output Tokens" },
  { id: "total_tokens_sum", group: "tokens", label: "Total Tokens" },
  { id: "output_tokens_per_sec", group: "tokens", label: "Output Tokens/sec", unit: "tok/s" },
  { id: "total_model_calls", group: "calls", label: "Model Calls" },
  { id: "total_tool_calls", group: "calls", label: "Tool Calls" },
  { id: "openai_cache_hit_rate", group: "cache", label: "OpenAI Cache Hit Rate", unit: "%" },
  { id: "anthropic_cache_read_tokens_sum", group: "cache", label: "Anthropic Cache Read Tokens" },
];

export interface RunSummary {
  id: string;
  logPath: string;
  modelId: string;
  strategyId: string;
  task: string | null;
  sampleCount: number;
  runAt: string; // ISO timestamp of when the benchmark was run

  score: {
    mean: number | null;
    min: number | null;
    max: number | null;
  };

  time: {
    totalSum: number | null;
    totalMean: number | null;
    totalP50: number | null;
    totalP95: number | null;
    workingSum: number | null;
    workingMean: number | null;
    llmHttpSum: number | null;
    llmHttpMean: number | null;
    llmTimeFraction: number | null;
    toolTimeApprox: number | null;
  };

  calls: {
    modelCalls: number;
    toolCalls: number;
  };

  tokens: {
    inputSum: number;
    outputSum: number;
    totalSum: number;
    outputPerSec: number | null;
    inputPerSec: number | null;
  };

  cache: {
    openaiPromptSum: number;
    openaiCachedSum: number;
    openaiHitRate: number | null;
    anthropicInputSum: number;
    anthropicCacheReadSum: number;
    anthropicCacheCreationSum: number;
  };

  provider?: {
    queueTimeMean: number | null;
    promptTimeMean: number | null;
    completionTimeMean: number | null;
    providerTimeMean: number | null;
  };
}

export interface ReportJson {
  generatedAt: string;
  source: {
    logsDir: string;
  };
  dimensions: {
    models: ModelConfig[];
    strategies: StrategyConfig[];
    metrics: MetricConfig[];
  };
  runs: RunSummary[];
}

export interface SampleStats {
  sampleId: string;
  epoch: number | null;
  score: number | null;
  totalTime: number | null;
  workingTime: number | null;
  nModelCalls: number;
  nToolCalls: number;
  llmHttpTimeTotal: number;
  llmHttpTimes: number[];
  llmProviderTimeTotal: number;
  llmQueueTimeTotal: number;
  llmPromptTimeTotal: number;
  llmCompletionTimeTotal: number;
  inputTokensTotal: number;
  outputTokensTotal: number;
  totalTokens: number;
  openaiPromptTokensTotal: number;
  openaiCachedTokensTotal: number;
  anthropicInputTokensTotal: number;
  anthropicCacheReadTokensTotal: number;
  anthropicCacheCreationTokensTotal: number;
}

export interface EvalStats {
  logPath: string;
  model: string | null;
  task: string | null;
  numSamples: number;
  sampleStats: SampleStats[];
}
