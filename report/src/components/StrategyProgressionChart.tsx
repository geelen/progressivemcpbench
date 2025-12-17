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

const PROGRESSION_STRATEGIES = ["minimal-tools", "minimal-servers", "distraction-64", "distraction-128"];

export default function StrategyProgressionChart(props: Props) {
  let chartContainer: HTMLDivElement | undefined;
  let chartInstance: echarts.ECharts | null = null;

  const sortedModels = createMemo(() => {
    return [...props.models].sort((a, b) => a.order - b.order);
  });

  const defaultSelectedModels = createMemo(() => {
    const models = sortedModels();
    const topModels = models.slice(0, 5).map(m => m.id);
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

  const strategyLabels = createMemo(() => {
    return PROGRESSION_STRATEGIES.map(id => {
      const strat = props.strategies.find(s => s.id === id);
      return strat?.displayName ?? id;
    });
  });

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
      xIndex: number;
    }> = [];

    models.forEach((model, modelIdx) => {
      PROGRESSION_STRATEGIES.forEach((stratId, stratIdx) => {
        const xIndex = xAxisData.length;
        xAxisData.push(strategyLabels()[stratIdx]);
        
        const run = runsMap.get(`${model.id}::${stratId}`);
        dataPoints.push({
          model,
          strategy: stratId,
          run,
          color: colors.get(model.id) || MODEL_COLORS[0],
          xIndex,
        });
      });
      if (modelIdx < models.length - 1) {
        xAxisData.push(""); // spacer between model groups
      }
    });

    return { xAxisData, dataPoints, models };
  });

  const getChartOptions = (): echarts.EChartsOption => {
    const { xAxisData, dataPoints, models } = chartData();
    
    // Calculate positions for separator lines between model groups
    const separatorPositions: number[] = [];
    let pos = 0;
    models.forEach((model, modelIdx) => {
      pos += PROGRESSION_STRATEGIES.length;
      if (modelIdx < models.length - 1) {
        separatorPositions.push(pos - 0.5); // position at the spacer
        pos++; // account for spacer
      }
    });

    const seriesData = dataPoints.map((d) => {
      if (!d.run) return null;
      const mean = d.run.score.mean ?? 0;
      const stderr = d.run.score.stderr ?? 0;
      const ci95 = stderr * 1.96;
      return {
        value: [d.xIndex, mean],
        itemStyle: { color: d.color },
        run: d.run,
        model: d.model,
        strategy: d.strategy,
        low: Math.max(0, mean - ci95),
        high: Math.min(1, mean + ci95),
        ci95,
      };
    }).filter(Boolean);

    const customSeriesData = dataPoints.map((d) => {
      if (!d.run) return [d.xIndex, null, null, null, d.color];
      const mean = d.run.score.mean ?? 0;
      const stderr = d.run.score.stderr ?? 0;
      const ci95 = stderr * 1.96;
      return [d.xIndex, Math.min(1, mean + ci95), Math.max(0, mean - ci95), mean, d.color];
    });

    return {
      title: {
        text: "Strategy Impact on Accuracy",
        subtext: "How each model's performance changes as context complexity increases",
        left: "center",
        textStyle: { fontSize: 18, fontWeight: "bold" },
        subtextStyle: { fontSize: 12, color: "#666" },
      },
      tooltip: {
        trigger: "item",
        formatter: (params: any) => {
          const data = params.data;
          if (!data || data.value[1] === null) return "";
          const strategyName = props.strategies.find(s => s.id === data.strategy)?.displayName ?? data.strategy;
          return `
            <strong>${data.model.displayName}</strong><br/>
            Strategy: ${strategyName}<br/>
            Score: ${(data.value[1] * 100).toFixed(1)}%<br/>
            ${data.ci95 ? `± ${(data.ci95 * 100).toFixed(1)}% (95% CI)` : ""}
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
          fontSize: 10,
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
            
            if (high === null || low === null || mean === null) {
              return { type: "group", children: [] };
            }
            
            const highPoint = api.coord([xIdx, high]);
            const lowPoint = api.coord([xIdx, low]);
            const meanPoint = api.coord([xIdx, mean]);
            
            const halfWidth = 2;
            
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
                    lineWidth: 1.5,
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
                    lineWidth: 1.5,
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
                    lineWidth: 1.5,
                  },
                },
                {
                  type: "circle",
                  shape: {
                    cx: meanPoint[0],
                    cy: meanPoint[1],
                    r: 6,
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
        {
          name: "Scores",
          type: "scatter",
          symbol: "circle",
          symbolSize: 0,
          data: seriesData,
          z: 11,
        },
      ],
      markLine: {
        silent: true,
        symbol: "none",
        lineStyle: {
          color: "#ddd",
          type: "solid",
          width: 1,
        },
        data: separatorPositions.map(x => ({ xAxis: x })),
      },
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
    </div>
  );
}
