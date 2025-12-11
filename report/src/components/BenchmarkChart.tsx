import { createSignal, createMemo, createEffect, onMount, onCleanup, For } from "solid-js";
import type { RunSummary, ModelConfig, StrategyConfig } from "../types/report";

interface Props {
  runs: RunSummary[];
  models: ModelConfig[];
  strategies: StrategyConfig[];
}

type MetricKey = "score" | "time" | "totalTokens" | "modelCalls" | "toolCalls" | "cacheHit";

interface MetricDef {
  key: MetricKey;
  label: string;
  getValue: (run: RunSummary) => number | null;
  format: (v: number) => string;
  yAxisFormat?: (v: number) => string;
}

const MODEL_COLORS = [
  "#2563eb", // blue
  "#dc2626", // red
  "#16a34a", // green
  "#ca8a04", // yellow
  "#9333ea", // purple
  "#ea580c", // orange
  "#0891b2", // cyan
  "#be185d", // pink
  "#4f46e5", // indigo
  "#059669", // emerald
  "#7c3aed", // violet
  "#d97706", // amber
];

const METRICS: MetricDef[] = [
  {
    key: "score",
    label: "Score",
    getValue: (r) => r.score.mean,
    format: (v) => v.toFixed(3),
  },
  {
    key: "time",
    label: "Time (mean)",
    getValue: (r) => r.time.totalMean,
    format: (v) => {
      if (v < 1) return `${(v * 1000).toFixed(0)}ms`;
      if (v < 60) return `${v.toFixed(1)}s`;
      return `${(v / 60).toFixed(1)}m`;
    },
    yAxisFormat: (v) => `${v.toFixed(1)}s`,
  },
  {
    key: "totalTokens",
    label: "Total Tokens",
    getValue: (r) => r.tokens.totalSum,
    format: (v) => {
      if (v < 1000) return v.toString();
      if (v < 1_000_000) return `${(v / 1000).toFixed(1)}K`;
      return `${(v / 1_000_000).toFixed(2)}M`;
    },
    yAxisFormat: (v) => {
      if (v < 1000) return v.toString();
      if (v < 1_000_000) return `${(v / 1000).toFixed(0)}K`;
      return `${(v / 1_000_000).toFixed(1)}M`;
    },
  },
  {
    key: "modelCalls",
    label: "Model Calls",
    getValue: (r) => r.calls.modelCalls,
    format: (v) => v.toString(),
  },
  {
    key: "toolCalls",
    label: "Tool Calls",
    getValue: (r) => r.calls.toolCalls,
    format: (v) => v.toString(),
  },
  {
    key: "cacheHit",
    label: "Cache Hit Rate",
    getValue: (r) => r.cache.openaiHitRate,
    format: (v) => `${(v * 100).toFixed(1)}%`,
    yAxisFormat: (v) => `${(v * 100).toFixed(0)}%`,
  },
];

export default function BenchmarkChart(props: Props) {
  let chartContainer: HTMLDivElement | undefined;
  let chartInstance: any = null;

  const [selectedMetric, setSelectedMetric] = createSignal<MetricKey>("score");
  const [hiddenModels, setHiddenModels] = createSignal<Set<string>>(new Set());

  const sortedModels = createMemo(() => {
    return [...props.models].sort((a, b) => a.order - b.order);
  });

  const sortedStrategies = createMemo(() => {
    return [...props.strategies].sort((a, b) => a.order - b.order);
  });

  const modelColorMap = createMemo(() => {
    const map = new Map<string, string>();
    sortedModels().forEach((m, i) => {
      map.set(m.id, MODEL_COLORS[i % MODEL_COLORS.length]);
    });
    return map;
  });

  const runsByModelStrategy = createMemo(() => {
    const map = new Map<string, RunSummary>();
    for (const run of props.runs) {
      map.set(`${run.modelId}::${run.strategyId}`, run);
    }
    return map;
  });

  const currentMetric = createMemo(() => {
    return METRICS.find((m) => m.key === selectedMetric())!;
  });

  const getChartOptions = () => {
    const metric = currentMetric();
    const strategies = sortedStrategies();
    const models = sortedModels().filter((m) => !hiddenModels().has(m.id));
    const runMap = runsByModelStrategy();
    const colors = models.map((m) => modelColorMap().get(m.id)!);

    const series = models.map((model) => {
      const data = strategies.map((strat) => {
        const run = runMap.get(`${model.id}::${strat.id}`);
        if (!run) return null;
        return metric.getValue(run);
      });

      return {
        name: model.displayName,
        data,
      };
    });

    return {
      chart: {
        type: "line" as const,
        height: 500,
        toolbar: {
          show: false,
        },
        zoom: {
          enabled: false,
        },
        animations: {
          enabled: false,
        },
      },
      colors,
      stroke: {
        width: 2,
        curve: "straight" as const,
      },
      markers: {
        size: 5,
        hover: {
          size: 7,
        },
      },
      series,
      xaxis: {
        categories: strategies.map((s) => s.displayName),
        title: {
          text: "Strategy",
        },
      },
      yaxis: {
        title: {
          text: metric.label,
        },
        min: metric.key === "score" || metric.key === "cacheHit" ? 0 : undefined,
        max: metric.key === "score" || metric.key === "cacheHit" ? 1 : undefined,
        labels: {
          formatter: metric.yAxisFormat || ((v: number) => (typeof v === "number" ? v.toFixed(2) : v)),
        },
      },
      tooltip: {
        shared: true,
        intersect: false,
        y: {
          formatter: (v: number) => (v !== null && v !== undefined ? metric.format(v) : "—"),
        },
      },
      legend: {
        show: false,
      },
      grid: {
        borderColor: "#e5e5e5",
      },
    };
  };

  onMount(async () => {
    const ApexCharts = (await import("apexcharts")).default;
    if (chartContainer) {
      chartInstance = new ApexCharts(chartContainer, getChartOptions());
      chartInstance.render();
    }
  });

  onCleanup(() => {
    if (chartInstance) {
      chartInstance.destroy();
      chartInstance = null;
    }
  });

  createEffect(() => {
    const options = getChartOptions();
    if (chartInstance) {
      chartInstance.updateOptions(options);
    }
  });

  const toggleModel = (modelId: string) => {
    setHiddenModels((prev) => {
      const next = new Set(prev);
      if (next.has(modelId)) {
        next.delete(modelId);
      } else {
        next.add(modelId);
      }
      return next;
    });
  };

  return (
    <div style={{ "margin-bottom": "32px" }}>
      <div
        style={{
          display: "flex",
          gap: "8px",
          "margin-bottom": "16px",
          "flex-wrap": "wrap",
        }}
      >
        <For each={METRICS}>
          {(metric) => (
            <button
              onClick={() => setSelectedMetric(metric.key)}
              style={{
                padding: "8px 16px",
                border: "1px solid #ddd",
                "border-radius": "4px",
                background: selectedMetric() === metric.key ? "#333" : "#fff",
                color: selectedMetric() === metric.key ? "#fff" : "#333",
                cursor: "pointer",
                "font-size": "14px",
              }}
            >
              {metric.label}
            </button>
          )}
        </For>
      </div>

      <div
        style={{
          background: "#fafafa",
          "border-radius": "8px",
          padding: "16px",
          "min-height": "532px",
        }}
      >
        <div ref={chartContainer}></div>
      </div>

      <div
        style={{
          display: "flex",
          gap: "12px",
          "margin-top": "16px",
          "flex-wrap": "wrap",
          "align-items": "center",
        }}
      >
        <span style={{ "font-size": "12px", color: "#666", "margin-right": "4px" }}>
          Models:
        </span>
        <For each={sortedModels()}>
          {(model) => (
            <button
              onClick={() => toggleModel(model.id)}
              style={{
                display: "flex",
                "align-items": "center",
                gap: "6px",
                padding: "4px 10px",
                border: "1px solid #ddd",
                "border-radius": "4px",
                background: hiddenModels().has(model.id) ? "#f5f5f5" : "#fff",
                opacity: hiddenModels().has(model.id) ? 0.5 : 1,
                cursor: "pointer",
                "font-size": "12px",
              }}
            >
              <span
                style={{
                  width: "12px",
                  height: "12px",
                  "border-radius": "2px",
                  background: modelColorMap().get(model.id),
                }}
              ></span>
              {model.displayName}
            </button>
          )}
        </For>
      </div>
    </div>
  );
}
