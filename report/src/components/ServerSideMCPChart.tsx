import { createMemo, onMount, onCleanup, createEffect, For } from "solid-js";
import type { RunSummary, ModelConfig, StrategyConfig, ToolDiscoveryMode } from "../types/report";
import * as echarts from "echarts";

interface Props {
  runs: RunSummary[];
  models: ModelConfig[];
  strategies: StrategyConfig[];
}

const PROVIDER_COLORS: Record<string, string> = {
  groq: "#f97316",
  anthropic: "#8b5cf6",
};

const TOOL_DISCOVERY_STYLES: Record<string, { symbol: string; opacity: number }> = {
  baseline: { symbol: "circle", opacity: 0.4 },
  default: { symbol: "diamond", opacity: 1 },
  directory: { symbol: "triangle", opacity: 1 },
  regex: { symbol: "rect", opacity: 1 },
  bm25: { symbol: "roundRect", opacity: 1 },
};

const SUPPORTED_PROVIDERS = ["groq", "anthropic"];

export default function ServerSideMCPChart(props: Props) {
  let chartContainer: HTMLDivElement | undefined;
  let chartInstance: echarts.ECharts | null = null;

  const remoteModels = createMemo(() => {
    return props.models.filter(m => SUPPORTED_PROVIDERS.includes(m.provider));
  });

  const hasRemoteRuns = createMemo(() => {
    return props.runs.some(r => r.strategyId === "minimal-servers-remote");
  });

  const runsByKey = createMemo(() => {
    const map = new Map<string, RunSummary>();
    for (const run of props.runs) {
      const key = `${run.modelId}::${run.strategyId}::${run.toolDiscovery ?? "default"}`;
      map.set(key, run);
    }
    return map;
  });

  const chartData = createMemo(() => {
    const models = remoteModels();
    const runsMap = runsByKey();
    
    const xAxisData: string[] = [];
    const dataPoints: Array<{
      model: ModelConfig;
      type: "baseline" | "remote";
      toolDiscovery: string;
      run: RunSummary | undefined;
      color: string;
      xIndex: number;
    }> = [];
    const modelCenters: Array<{ model: ModelConfig; center: number }> = [];

    models.forEach((model, modelIdx) => {
      const startIdx = xAxisData.length;
      const providerColor = PROVIDER_COLORS[model.provider] || "#666";

      const baselineRun = runsMap.get(`${model.id}::minimal-servers::default`);
      xAxisData.push("");
      dataPoints.push({
        model,
        type: "baseline",
        toolDiscovery: "baseline",
        run: baselineRun,
        color: providerColor,
        xIndex: xAxisData.length - 1,
      });

      const remoteDefaultRun = runsMap.get(`${model.id}::minimal-servers-remote::default`);
      xAxisData.push("");
      dataPoints.push({
        model,
        type: "remote",
        toolDiscovery: "default",
        run: remoteDefaultRun,
        color: providerColor,
        xIndex: xAxisData.length - 1,
      });

      const discoveryModes: ToolDiscoveryMode[] = model.provider === "groq"
        ? ["directory"]
        : ["regex", "bm25"];

      for (const discovery of discoveryModes) {
        const run = runsMap.get(`${model.id}::minimal-servers-remote::${discovery}`);
        xAxisData.push("");
        dataPoints.push({
          model,
          type: "remote",
          toolDiscovery: discovery,
          run,
          color: providerColor,
          xIndex: xAxisData.length - 1,
        });
      }

      const endIdx = xAxisData.length - 1;
      modelCenters.push({ model, center: (startIdx + endIdx) / 2 });

      if (modelIdx < models.length - 1) {
        xAxisData.push("");
      }
    });

    return { xAxisData, dataPoints, models, modelCenters };
  });

  const getChartOptions = (): echarts.EChartsOption => {
    const { xAxisData, dataPoints, models, modelCenters } = chartData();

    const separatorPositions: number[] = [];
    let pos = 0;
    models.forEach((model, modelIdx) => {
      const discoveryCount = model.provider === "groq" ? 3 : 4;
      pos += discoveryCount;
      if (modelIdx < models.length - 1) {
        separatorPositions.push(pos);
        pos++;
      }
    });

    const xAxisLabels = xAxisData.map((_, idx) => {
      const centerEntry = modelCenters.find(mc => Math.round(mc.center) === idx);
      return centerEntry ? centerEntry.model.displayName : "";
    });

    const seriesData = dataPoints.map((d) => {
      if (!d.run) return null;
      const mean = d.run.score.mean ?? 0;
      const stderr = d.run.score.stderr ?? 0;
      const ci95 = stderr * 1.96;
      const style = TOOL_DISCOVERY_STYLES[d.toolDiscovery] || TOOL_DISCOVERY_STYLES.default;
      return {
        value: [d.xIndex, mean],
        itemStyle: { color: d.color, opacity: style.opacity },
        symbol: style.symbol,
        symbolSize: d.toolDiscovery === "baseline" ? 10 : 14,
        run: d.run,
        model: d.model,
        toolDiscovery: d.toolDiscovery,
        type: d.type,
        low: Math.max(0, mean - ci95),
        high: Math.min(1, mean + ci95),
        ci95,
      };
    }).filter(Boolean);

    const customSeriesData = dataPoints.map((d) => {
      if (!d.run) return [d.xIndex, null, null, null, d.color, d.toolDiscovery];
      const mean = d.run.score.mean ?? 0;
      const stderr = d.run.score.stderr ?? 0;
      const ci95 = stderr * 1.96;
      const style = TOOL_DISCOVERY_STYLES[d.toolDiscovery] || TOOL_DISCOVERY_STYLES.default;
      return [d.xIndex, Math.min(1, mean + ci95), Math.max(0, mean - ci95), mean, d.color, d.toolDiscovery, style.opacity];
    });

    return {
      title: {
        text: "Server-Side MCP Performance",
        subtext: "Comparing local minimal-servers baseline with remote MCP + tool discovery strategies",
        left: "center",
        textStyle: { fontSize: 18, fontWeight: "bold" },
        subtextStyle: { fontSize: 12, color: "#666" },
      },
      tooltip: {
        trigger: "item",
        formatter: (params: any) => {
          const data = params.data;
          if (!data || data.value[1] === null) return "";
          const typeLabel = data.type === "baseline" ? "Local (minimal-servers)" : "Remote MCP";
          const discoveryLabel = data.toolDiscovery === "baseline" ? "" :
            data.toolDiscovery === "default" ? " (no tool discovery)" :
            ` (${data.toolDiscovery})`;
          return `
            <strong>${data.model.displayName}</strong><br/>
            ${typeLabel}${discoveryLabel}<br/>
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
        data: xAxisLabels,
        axisLabel: {
          interval: 0,
          fontSize: 11,
          fontWeight: "bold",
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
            const toolDiscovery = api.value(5);
            const opacity = api.value(6) ?? 1;

            if (high === null || low === null || mean === null) {
              return { type: "group", children: [] };
            }

            const highPoint = api.coord([xIdx, high]);
            const lowPoint = api.coord([xIdx, low]);
            const meanPoint = api.coord([xIdx, mean]);
            const style = TOOL_DISCOVERY_STYLES[toolDiscovery] || TOOL_DISCOVERY_STYLES.default;
            const size = toolDiscovery === "baseline" ? 5 : 7;

            const halfWidth = 2;

            const symbolShape = (() => {
              switch (style.symbol) {
                case "diamond":
                  return {
                    type: "polygon",
                    shape: {
                      points: [
                        [meanPoint[0], meanPoint[1] - size],
                        [meanPoint[0] + size, meanPoint[1]],
                        [meanPoint[0], meanPoint[1] + size],
                        [meanPoint[0] - size, meanPoint[1]],
                      ],
                    },
                    style: { fill: color, opacity },
                  };
                case "triangle":
                  return {
                    type: "polygon",
                    shape: {
                      points: [
                        [meanPoint[0], meanPoint[1] - size],
                        [meanPoint[0] + size, meanPoint[1] + size],
                        [meanPoint[0] - size, meanPoint[1] + size],
                      ],
                    },
                    style: { fill: color, opacity },
                  };
                case "rect":
                  return {
                    type: "rect",
                    shape: {
                      x: meanPoint[0] - size,
                      y: meanPoint[1] - size,
                      width: size * 2,
                      height: size * 2,
                    },
                    style: { fill: color, opacity },
                  };
                case "roundRect":
                  return {
                    type: "rect",
                    shape: {
                      x: meanPoint[0] - size,
                      y: meanPoint[1] - size,
                      width: size * 2,
                      height: size * 2,
                      r: 3,
                    },
                    style: { fill: color, opacity },
                  };
                default:
                  return {
                    type: "circle",
                    shape: {
                      cx: meanPoint[0],
                      cy: meanPoint[1],
                      r: size,
                    },
                    style: { fill: color, opacity },
                  };
              }
            })();

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
                    opacity,
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
                    opacity,
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
                    opacity,
                  },
                },
                symbolShape,
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
    if (chartContainer && hasRemoteRuns()) {
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

  createEffect(() => {
    if (!hasRemoteRuns()) return;
    const options = getChartOptions();
    if (chartInstance) {
      chartInstance.setOption(options, { notMerge: true });
    }
  });

  if (!hasRemoteRuns()) {
    return null;
  }

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
      <div style={{ "margin-top": "12px", display: "flex", gap: "24px", "flex-wrap": "wrap" }}>
        <div style={{ "font-size": "11px", color: "#888" }}>
          <strong>Providers:</strong>{" "}
          <For each={Object.entries(PROVIDER_COLORS)}>
            {([provider, color]) => (
              <span style={{ "margin-right": "12px" }}>
                <span style={{ display: "inline-block", width: "10px", height: "10px", background: color, "border-radius": "2px", "margin-right": "4px" }} />
                {provider}
              </span>
            )}
          </For>
        </div>
        <div style={{ "font-size": "11px", color: "#888" }}>
          <strong>Reading order (left to right per model):</strong> Local baseline (faded) → Remote default → Tool discovery variants
        </div>
      </div>
    </div>
  );
}
