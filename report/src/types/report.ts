export interface ModelConfig {
  id: string;
  provider: string;
  displayName: string;
  order: number;
}

export interface StrategyConfig {
  id: string;
  displayName: string;
  order: number;
}

export interface MetricConfig {
  id: string;
  group: "score" | "time" | "tokens" | "cache" | "calls";
  label: string;
  description?: string;
  unit?: string;
}

export interface RunSummary {
  id: string;
  logPath: string;
  modelId: string;
  strategyId: string;
  task: string | null;
  sampleCount: number;

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
