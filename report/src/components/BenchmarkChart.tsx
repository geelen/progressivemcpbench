import { createSignal, createMemo, createEffect, onMount, onCleanup, For } from "solid-js";
import * as echarts from "echarts";
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
  format: (v: number | null) => string;
  unit?: string;
}

const MODEL_COLORS = [
  "#2563eb",
  "#dc2626",
  "#16a34a",
  "#ca8a04",
  "#9333ea",
  "#ea580c",
  "#0891b2",
  "#be185d",
  "#4f46e5",
  "#059669",
  "#7c3aed",
  "#d97706",
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
    unit: "s",
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
    getValue: (r) => (r.cache.openaiHitRate !== null ? r.cache.openaiHitRate * 100 : null),
    format: (v) => (v === null ? "—" : `${v.toFixed(1)}%`),
    unit: "%",
  },
];

export default function BenchmarkChart(props: Props) {
  let containerRef: HTMLDivElement | undefined;
  let chartInstance: echarts.ECharts | null = null;

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

  const chartOption = createMemo(() => {
    const strategies = sortedStrategies();
    const models = sortedModels().filter((m) => !hiddenModels().has(m.id));
    const runMap = runsByModelStrategy();
    const metric = currentMetric();

    const series = models.map((model) => {
      const data = strategies.map((strat) => {
        const run = runMap.get(`${model.id}::${strat.id}`);
        if (!run) return null;
        return metric.getValue(run);
      });

      return {
        name: model.displayName,
        type: "line" as const,
        data,
        smooth: false,
        symbol: "circle",
        symbolSize: 8,
        lineStyle: {
          width: 2,
          color: modelColorMap().get(model.id),
        },
        itemStyle: {
          color: modelColorMap().get(model.id),
        },
        emphasis: {
          focus: "series" as const,
          itemStyle: {
            borderWidth: 2,
            borderColor: "#fff",
          },
        },
      };
    });

    return {
      backgroundColor: "transparent",
      grid: {
        left: 60,
        right: 20,
        top: 20,
        bottom: 40,
      },
      tooltip: {
        trigger: "axis" as const,
        backgroundColor: "rgba(255, 255, 255, 0.95)",
        borderColor: "#ddd",
        borderWidth: 1,
        textStyle: {
          color: "#333",
        },
        formatter: (params: { seriesName: string; value: number | null; color: string }[]) => {
          if (!Array.isArray(params) || params.length === 0) return "";
          const lines = params
            .filter((p) => p.value !== null && p.value !== undefined)
            .map(
              (p) =>
                `<span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${p.color};margin-right:6px;"></span>${p.seriesName}: <strong>${metric.format(p.value)}</strong>`
            );
          return lines.join("<br/>");
        },
      },
      xAxis: {
        type: "category" as const,
        data: strategies.map((s) => s.displayName),
        axisLine: {
          lineStyle: { color: "#ddd" },
        },
        axisTick: {
          lineStyle: { color: "#ddd" },
        },
        axisLabel: {
          color: "#666",
        },
      },
      yAxis: {
        type: "value" as const,
        name: metric.label,
        nameLocation: "middle" as const,
        nameGap: 45,
        nameTextStyle: {
          color: "#666",
        },
        min: selectedMetric() === "score" ? 0 : undefined,
        max: selectedMetric() === "score" ? 1 : undefined,
        axisLine: {
          show: false,
        },
        axisTick: {
          show: false,
        },
        axisLabel: {
          color: "#666",
        },
        splitLine: {
          lineStyle: {
            color: "#eee",
          },
        },
      },
      series,
    };
  });

  onMount(() => {
    if (!containerRef) return;

    chartInstance = echarts.init(containerRef);
    chartInstance.setOption(chartOption());

    const resizeObserver = new ResizeObserver(() => {
      chartInstance?.resize();
    });
    resizeObserver.observe(containerRef);

    onCleanup(() => {
      resizeObserver.disconnect();
      chartInstance?.dispose();
      chartInstance = null;
    });
  });

  createEffect(() => {
    const option = chartOption();
    if (chartInstance) {
      chartInstance.setOption(option, { notMerge: true });
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
        ref={containerRef}
        style={{
          height: "500px",
          background: "#fafafa",
          "border-radius": "8px",
        }}
      />

      <div
        style={{
          display: "flex",
          gap: "12px",
          "margin-top": "16px",
          "flex-wrap": "wrap",
          "align-items": "center",
        }}
      >
        <span style={{ "font-size": "12px", color: "#666", "margin-right": "4px" }}>Models:</span>
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
              />
              {model.displayName}
            </button>
          )}
        </For>
      </div>
    </div>
  );
}
