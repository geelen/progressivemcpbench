import { createMemo, onMount, onCleanup } from "solid-js";
import type { RunSummary, ModelConfig } from "../types/report";
import * as echarts from "echarts";

interface Props {
  runs: RunSummary[];
  models: ModelConfig[];
}

const MODEL_COLORS = [
  "#2563eb", "#dc2626", "#16a34a", "#ca8a04", "#9333ea",
  "#ea580c", "#0891b2", "#be185d", "#4f46e5", "#059669",
  "#7c3aed", "#d97706",
];

export default function BaselineChart(props: Props) {
  let chartContainer: HTMLDivElement | undefined;
  let chartInstance: echarts.ECharts | null = null;

  const sortedModels = createMemo(() => {
    return [...props.models].sort((a, b) => a.order - b.order);
  });

  const minimalToolsRuns = createMemo(() => {
    const map = new Map<string, RunSummary>();
    for (const run of props.runs) {
      if (run.strategyId === "minimal-tools") {
        map.set(run.modelId, run);
      }
    }
    return map;
  });

  const chartData = createMemo(() => {
    const models = sortedModels();
    const runsMap = minimalToolsRuns();
    
    return models.map((model, idx) => {
      const run = runsMap.get(model.id);
      return {
        model,
        run,
        color: MODEL_COLORS[idx % MODEL_COLORS.length],
        score: run?.score.mean ?? null,
        min: run?.score.min ?? null,
        max: run?.score.max ?? null,
      };
    }).filter(d => d.score !== null);
  });

  const getChartOptions = (): echarts.EChartsOption => {
    const data = chartData();
    
    return {
      title: {
        text: "Baseline Tool Calling Ability",
        subtext: "Minimal Tools strategy — model's fundamental ability to select and use tools",
        left: "center",
        textStyle: { fontSize: 18, fontWeight: "bold" },
        subtextStyle: { fontSize: 12, color: "#666" },
      },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        formatter: (params: any) => {
          const param = Array.isArray(params) ? params[0] : params;
          if (!param) return "";
          const d = data[param.dataIndex];
          if (!d || !d.run) return "";
          return `
            <strong>${d.model.displayName}</strong><br/>
            Score: ${(d.score! * 100).toFixed(1)}%<br/>
            Range: ${(d.min! * 100).toFixed(0)}% – ${(d.max! * 100).toFixed(0)}%<br/>
            Samples: ${d.run.sampleCount}
          `;
        },
      },
      grid: {
        left: "3%",
        right: "4%",
        bottom: "15%",
        top: "15%",
        containLabel: true,
      },
      xAxis: {
        type: "category",
        data: data.map(d => d.model.displayName),
        axisLabel: {
          rotate: 45,
          interval: 0,
          fontSize: 11,
        },
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
          name: "Score Range",
          type: "custom",
          renderItem: (params: any, api: any) => {
            const xValue = api.value(0);
            const high = api.value(1);
            const low = api.value(2);
            const mean = api.value(3);
            const color = api.value(4);
            
            const highPoint = api.coord([xValue, high]);
            const lowPoint = api.coord([xValue, low]);
            const meanPoint = api.coord([xValue, mean]);
            
            const halfWidth = 3;
            
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
                    lineWidth: 2,
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
                    lineWidth: 2,
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
                    lineWidth: 2,
                  },
                },
                {
                  type: "circle",
                  shape: {
                    cx: meanPoint[0],
                    cy: meanPoint[1],
                    r: 8,
                  },
                  style: {
                    fill: color,
                  },
                },
              ],
            };
          },
          encode: {
            x: 0,
          },
          data: data.map((d, idx) => [idx, d.max, d.min, d.score, d.color]),
          z: 10,
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

  return (
    <div style={{ "margin-bottom": "48px" }}>
      <div
        ref={chartContainer}
        style={{
          width: "100%",
          height: "400px",
          background: "#fafafa",
          "border-radius": "8px",
        }}
      />
    </div>
  );
}
