import { createSignal, createMemo, onMount, onCleanup, For } from "solid-js";
import type { RunSummary, ModelConfig, StrategyConfig } from "../types/report";
import * as echarts from "echarts";

interface Props {
  runs: RunSummary[];
  models: ModelConfig[];
  strategies: StrategyConfig[];
}

const MODEL_COLORS = [
  "#2563eb", "#dc2626", "#16a34a", "#ca8a04", "#9333ea",
  "#ea580c", "#0891b2", "#be185d", "#4f46e5", "#059669",
  "#7c3aed", "#d97706",
];

const BASELINE_STRATEGIES = ["minimal-tools", "minimal-servers", "distraction-64", "distraction-128"];
const ADVANCED_STRATEGIES = ["copilot", "directory"];

export default function AdvancedStrategiesChart(props: Props) {
  let chartContainer: HTMLDivElement | undefined;
  let chartInstance: echarts.ECharts | null = null;

  const sortedModels = createMemo(() => {
    return [...props.models].sort((a, b) => a.order - b.order);
  });

  const defaultSelectedModels = createMemo(() => {
    const models = sortedModels();
    const topModels = models.slice(0, 4).map(m => m.id);
    return new Set(topModels);
  });

  const [selectedModels, setSelectedModels] = createSignal<Set<string>>(new Set());

  onMount(() => {
    setSelectedModels(defaultSelectedModels());
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

  const getStrategyLabel = (id: string) => {
    const strat = props.strategies.find(s => s.id === id);
    return strat?.displayName ?? id;
  };

  const chartData = createMemo(() => {
    const models = sortedModels().filter(m => selectedModels().has(m.id));
    const runsMap = runsByModelStrategy();
    const colors = modelColorMap();
    
    const xAxisData: string[] = [];
    const dataPoints: Array<{
      model: ModelConfig;
      strategy: string;
      run: RunSummary | undefined;
      color: string;
      isAdvanced: boolean;
    }> = [];

    models.forEach((model, modelIdx) => {
      BASELINE_STRATEGIES.forEach(stratId => {
        xAxisData.push(getStrategyLabel(stratId));
        const run = runsMap.get(`${model.id}::${stratId}`);
        dataPoints.push({
          model,
          strategy: stratId,
          run,
          color: colors.get(model.id) || MODEL_COLORS[0],
          isAdvanced: false,
        });
      });
      
      xAxisData.push("");
      dataPoints.push({
        model,
        strategy: "",
        run: undefined,
        color: colors.get(model.id) || MODEL_COLORS[0],
        isAdvanced: false,
      });

      ADVANCED_STRATEGIES.forEach(stratId => {
        xAxisData.push(getStrategyLabel(stratId));
        const run = runsMap.get(`${model.id}::${stratId}`);
        dataPoints.push({
          model,
          strategy: stratId,
          run,
          color: colors.get(model.id) || MODEL_COLORS[0],
          isAdvanced: true,
        });
      });

      if (modelIdx < models.length - 1) {
        xAxisData.push("");
        dataPoints.push({
          model,
          strategy: "",
          run: undefined,
          color: "#fff",
          isAdvanced: false,
        });
      }
    });

    return { xAxisData, dataPoints, models };
  });

  const getChartOptions = (): echarts.EChartsOption => {
    const { xAxisData, dataPoints, models } = chartData();

    const customSeriesData = dataPoints.map((d, idx) => {
      if (!d.run) return [idx, null, null, null, d.color, d.isAdvanced];
      return [idx, d.run.score.max, d.run.score.min, d.run.score.mean, d.color, d.isAdvanced];
    });

    const modelPositions: Array<{ model: ModelConfig; center: number }> = [];
    let currentIdx = 0;
    models.forEach((model, modelIdx) => {
      const start = currentIdx;
      currentIdx += BASELINE_STRATEGIES.length + 1 + ADVANCED_STRATEGIES.length;
      if (modelIdx < models.length - 1) currentIdx++;
      const end = currentIdx - 1;
      modelPositions.push({ model, center: (start + end) / 2 });
    });

    return {
      title: {
        text: "Advanced Discovery Strategies",
        subtext: "Comparing copilot & directory strategies against the baseline spectrum",
        left: "center",
        textStyle: { fontSize: 18, fontWeight: "bold" },
        subtextStyle: { fontSize: 12, color: "#666" },
      },
      tooltip: {
        trigger: "item",
        formatter: (params: any) => {
          const [idx, max, min, mean] = params.data;
          if (mean === null) return "";
          const d = dataPoints[idx];
          if (!d.run) return "";
          return `
            <strong>${d.model.displayName}</strong><br/>
            Strategy: ${getStrategyLabel(d.strategy)}<br/>
            Score: ${(mean * 100).toFixed(1)}%<br/>
            Range: ${(min * 100).toFixed(0)}% – ${(max * 100).toFixed(0)}%
          `;
        },
      },
      grid: {
        left: "3%",
        right: "4%",
        bottom: "20%",
        top: "15%",
        containLabel: true,
      },
      xAxis: {
        type: "category",
        data: xAxisData,
        axisLabel: {
          rotate: 45,
          interval: 0,
          fontSize: 9,
        },
        axisTick: { show: false },
      },
      yAxis: {
        type: "value",
        min: 0,
        max: 1,
        axisLabel: {
          formatter: (v: number) => `${(v * 100).toFixed(0)}%`,
        },
      },
      series: [
        {
          name: "Score",
          type: "custom",
          renderItem: (params: any, api: any) => {
            const xIdx = api.value(0);
            const high = api.value(1);
            const low = api.value(2);
            const mean = api.value(3);
            const color = api.value(4);
            const isAdvanced = api.value(5);
            
            if (high === null || low === null || mean === null) {
              return { type: "group", children: [] };
            }
            
            const highPoint = api.coord([xIdx, high]);
            const lowPoint = api.coord([xIdx, low]);
            const meanPoint = api.coord([xIdx, mean]);
            
            const halfWidth = 2;
            const radius = isAdvanced ? 8 : 6;
            
            return {
              type: "group",
              children: [
                {
                  type: "line",
                  shape: {
                    x1: highPoint[0],
                    y1: highPoint[1],
                    x2: lowPoint[0],
                    y2: lowPoint[1],
                  },
                  style: {
                    stroke: color,
                    lineWidth: isAdvanced ? 2 : 1.5,
                  },
                },
                {
                  type: "line",
                  shape: {
                    x1: highPoint[0] - halfWidth,
                    y1: highPoint[1],
                    x2: highPoint[0] + halfWidth,
                    y2: highPoint[1],
                  },
                  style: {
                    stroke: color,
                    lineWidth: isAdvanced ? 2 : 1.5,
                  },
                },
                {
                  type: "line",
                  shape: {
                    x1: lowPoint[0] - halfWidth,
                    y1: lowPoint[1],
                    x2: lowPoint[0] + halfWidth,
                    y2: lowPoint[1],
                  },
                  style: {
                    stroke: color,
                    lineWidth: isAdvanced ? 2 : 1.5,
                  },
                },
                {
                  type: isAdvanced ? "rect" : "circle",
                  shape: isAdvanced ? {
                    x: meanPoint[0] - radius / 2,
                    y: meanPoint[1] - radius / 2,
                    width: radius,
                    height: radius,
                    r: 2,
                  } : {
                    cx: meanPoint[0],
                    cy: meanPoint[1],
                    r: radius,
                  },
                  style: {
                    fill: color,
                  },
                },
              ],
            };
          },
          data: customSeriesData,
          z: 10,
        },
      ],
      graphic: modelPositions.map(({ model, center }) => ({
        type: "text",
        left: `${(center / xAxisData.length) * 100 + 3}%`,
        bottom: 5,
        style: {
          text: model.displayName,
          fontSize: 11,
          fontWeight: "bold",
          fill: modelColorMap().get(model.id) || "#333",
          textAlign: "center",
        },
      })),
    };
  };

  const updateChart = () => {
    if (chartInstance) {
      chartInstance.setOption(getChartOptions(), { notMerge: true });
    }
  };

  onMount(() => {
    if (chartContainer) {
      chartInstance = echarts.init(chartContainer);
      
      setTimeout(() => {
        updateChart();
      }, 0);

      const handleResize = () => chartInstance?.resize();
      window.addEventListener("resize", handleResize);
      onCleanup(() => {
        window.removeEventListener("resize", handleResize);
        chartInstance?.dispose();
      });
    }
  });

  const toggleModel = (modelId: string) => {
    setSelectedModels(prev => {
      const next = new Set(prev);
      if (next.has(modelId)) {
        next.delete(modelId);
      } else {
        next.add(modelId);
      }
      return next;
    });
    setTimeout(updateChart, 0);
  };

  return (
    <div style={{ "margin-bottom": "48px" }}>
      <div
        ref={chartContainer}
        style={{
          width: "100%",
          height: "450px",
          background: "#fafafa",
          "border-radius": "8px",
        }}
      />
      <div
        style={{
          display: "flex",
          gap: "8px",
          "margin-top": "16px",
          "flex-wrap": "wrap",
          "align-items": "center",
        }}
      >
        <span style={{ "font-size": "12px", color: "#666", "margin-right": "4px" }}>
          Select models:
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
                background: selectedModels().has(model.id) ? "#fff" : "#f5f5f5",
                opacity: selectedModels().has(model.id) ? 1 : 0.5,
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
      <div style={{ "margin-top": "12px", "font-size": "11px", color: "#888" }}>
        <span style={{ "margin-right": "16px" }}>● Circle = baseline strategies</span>
        <span>■ Square = advanced discovery strategies</span>
      </div>
    </div>
  );
}
