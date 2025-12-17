import { createMemo, onMount, onCleanup, createEffect } from "solid-js";
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
    const models = sortedModels();
    const runsMap = runsByModelStrategy();
    const colors = modelColorMap();
    
    const xAxisData: string[] = [];
    const xAxisLabels: string[] = [];
    const dataPoints: Array<{
      model: ModelConfig;
      strategy: string;
      run: RunSummary | undefined;
      color: string;
      isAdvanced: boolean;
      xIndex: number;
    }> = [];
    const separatorPositions: number[] = [];

    models.forEach((model, modelIdx) => {
      // Baseline strategies - label with model name in center
      const baselineStart = xAxisData.length;
      BASELINE_STRATEGIES.forEach(stratId => {
        const xIndex = xAxisData.length;
        xAxisData.push("");
        const run = runsMap.get(`${model.id}::${stratId}`);
        dataPoints.push({
          model,
          strategy: stratId,
          run,
          color: colors.get(model.id) || MODEL_COLORS[0],
          isAdvanced: false,
          xIndex,
        });
      });
      const baselineEnd = xAxisData.length - 1;
      const baselineCenter = Math.round((baselineStart + baselineEnd) / 2);
      
      xAxisData.push(""); // spacer between baseline and advanced

      // Advanced strategies - label with strategy names
      ADVANCED_STRATEGIES.forEach(stratId => {
        const xIndex = xAxisData.length;
        xAxisData.push("");
        const run = runsMap.get(`${model.id}::${stratId}`);
        dataPoints.push({
          model,
          strategy: stratId,
          run,
          color: colors.get(model.id) || MODEL_COLORS[0],
          isAdvanced: true,
          xIndex,
        });
      });

      if (modelIdx < models.length - 1) {
        separatorPositions.push(xAxisData.length);
        xAxisData.push(""); // spacer between model groups
      }
      
      // Build labels - model name at baseline center, strategy names for advanced
      for (let i = baselineStart; i <= baselineEnd; i++) {
        xAxisLabels[i] = (i === baselineCenter) ? model.displayName : "";
      }
      xAxisLabels[baselineEnd + 1] = ""; // spacer
      xAxisLabels[baselineEnd + 2] = "Copilot";
      xAxisLabels[baselineEnd + 3] = "Directory";
      if (modelIdx < models.length - 1) {
        xAxisLabels[baselineEnd + 4] = ""; // spacer between models
      }
    });

    return { xAxisData, xAxisLabels, dataPoints, models, separatorPositions };
  });

  const getChartOptions = (): echarts.EChartsOption => {
    const { xAxisLabels, dataPoints, separatorPositions } = chartData();

    const customSeriesData = dataPoints.map((d, dataIdx) => {
      if (!d.run) return [d.xIndex, null, null, null, d.color, d.isAdvanced, dataIdx];
      const mean = d.run.score.mean ?? 0;
      const stderr = d.run.score.stderr ?? 0;
      const ci95 = stderr * 1.96;
      return [d.xIndex, Math.min(1, mean + ci95), Math.max(0, mean - ci95), mean, d.color, d.isAdvanced, dataIdx];
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
          const [, , , mean, , , dataIdx] = params.data;
          if (mean === null) return "";
          const d = dataPoints[dataIdx];
          if (!d || !d.run) return "";
          const stderr = d.run.score.stderr;
          const ci95 = stderr !== null ? stderr * 1.96 : null;
          return `
            <strong>${d.model.displayName}</strong><br/>
            Strategy: ${getStrategyLabel(d.strategy)}<br/>
            Score: ${(mean * 100).toFixed(1)}%<br/>
            ${ci95 !== null ? `± ${(ci95 * 100).toFixed(1)}% (95% CI)` : ""}
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
        data: xAxisLabels,
        axisLabel: {
          interval: 0,
          fontSize: 10,
        },
        axisTick: { show: false },
        axisLine: { show: false },
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
          markLine: {
            silent: true,
            symbol: "none",
            label: { show: false },
            lineStyle: {
              color: "#ccc",
              type: "solid",
              width: 1,
            },
            data: separatorPositions.map(x => ({ xAxis: x })),
          },
        },
      ],
    };
  };

  onMount(() => {
    if (chartContainer) {
      chartInstance = echarts.init(chartContainer);
      chartInstance.setOption(getChartOptions());

      const handleResize = () => chartInstance?.resize();
      window.addEventListener("resize", handleResize);
      onCleanup(() => {
        window.removeEventListener("resize", handleResize);
        chartInstance?.dispose();
      });
    }
  });

  // Update chart when props change
  createEffect(() => {
    const options = getChartOptions();
    if (chartInstance) {
      chartInstance.setOption(options, { notMerge: true });
    }
  });

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
      <div style={{ "margin-top": "12px", "font-size": "11px", color: "#888" }}>
        <span style={{ "margin-right": "16px" }}>● Circle = baseline strategies</span>
        <span>■ Square = advanced discovery strategies</span>
      </div>
    </div>
  );
}
