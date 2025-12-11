import { createSignal, createMemo, onMount, onCleanup, For } from "solid-js";
import { Chart, registerables } from "chart.js";
import type { RunSummary, ModelConfig, StrategyConfig } from "../types/report";

Chart.register(...registerables);

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
  format: (v: number | null) => string;
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
    format: (v) => (v === null ? "—" : v.toFixed(3)),
  },
  {
    key: "time",
    label: "Time (mean)",
    getValue: (r) => r.time.totalMean,
    format: (v) => {
      if (v === null) return "—";
      if (v < 1) return `${(v * 1000).toFixed(0)}ms`;
      if (v < 60) return `${v.toFixed(1)}s`;
      return `${(v / 60).toFixed(1)}m`;
    },
  },
  {
    key: "totalTokens",
    label: "Total Tokens",
    getValue: (r) => r.tokens.totalSum,
    format: (v) => {
      if (v === null || v === 0) return "0";
      if (v < 1000) return v.toString();
      if (v < 1_000_000) return `${(v / 1000).toFixed(1)}K`;
      return `${(v / 1_000_000).toFixed(2)}M`;
    },
  },
  {
    key: "modelCalls",
    label: "Model Calls",
    getValue: (r) => r.calls.modelCalls,
    format: (v) => (v === null ? "—" : v.toString()),
  },
  {
    key: "toolCalls",
    label: "Tool Calls",
    getValue: (r) => r.calls.toolCalls,
    format: (v) => (v === null ? "—" : v.toString()),
  },
  {
    key: "cacheHit",
    label: "Cache Hit Rate",
    getValue: (r) => r.cache.openaiHitRate,
    format: (v) => (v === null ? "—" : `${(v * 100).toFixed(1)}%`),
  },
];

export default function BenchmarkChart(props: Props) {
  let canvasRef: HTMLCanvasElement | undefined;
  let chartInstance: Chart | null = null;

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

  const chartData = createMemo(() => {
    const strategies = sortedStrategies();
    const models = sortedModels().filter((m) => !hiddenModels().has(m.id));
    const runMap = runsByModelStrategy();

    const labels = strategies.map((s) => s.displayName);

    const datasets = models.map((model) => {
      const data = strategies.map((strat) => {
        const run = runMap.get(`${model.id}::${strat.id}`);
        if (!run) return null;
        return currentMetric().getValue(run);
      });

      return {
        label: model.displayName,
        data,
        borderColor: modelColorMap().get(model.id),
        backgroundColor: modelColorMap().get(model.id),
        tension: 0.1,
        pointRadius: 5,
        pointHoverRadius: 7,
      };
    });

    return { labels, datasets };
  });

  const updateChart = () => {
    if (!chartInstance) return;
    const data = chartData();
    chartInstance.data.labels = data.labels;
    chartInstance.data.datasets = data.datasets;
    chartInstance.options.scales!.y!.title!.text = currentMetric().label;
    chartInstance.update();
  };

  onMount(() => {
    if (!canvasRef) return;

    const data = chartData();

    chartInstance = new Chart(canvasRef, {
      type: "line",
      data: {
        labels: data.labels,
        datasets: data.datasets,
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: "index",
          intersect: false,
        },
        plugins: {
          legend: {
            display: false,
          },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const value = ctx.parsed.y;
                return `${ctx.dataset.label}: ${currentMetric().format(value)}`;
              },
            },
          },
        },
        scales: {
          x: {
            title: {
              display: true,
              text: "Strategy",
            },
          },
          y: {
            title: {
              display: true,
              text: currentMetric().label,
            },
            beginAtZero: selectedMetric() === "score",
          },
        },
      },
    });
  });

  onCleanup(() => {
    if (chartInstance) {
      chartInstance.destroy();
      chartInstance = null;
    }
  });

  createMemo(() => {
    chartData();
    currentMetric();
    updateChart();
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
          height: "500px",
          background: "#fafafa",
          "border-radius": "8px",
          padding: "16px",
        }}
      >
        <canvas ref={canvasRef}></canvas>
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
