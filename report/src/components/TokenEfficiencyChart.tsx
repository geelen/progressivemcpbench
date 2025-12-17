import { createMemo, onMount, onCleanup } from "solid-js";
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

const STRATEGIES_TO_SHOW = ["copilot", "minimal-servers", "directory"];

const STRATEGY_SHAPES: Record<string, string> = {
  copilot: "circle",
  "minimal-servers": "diamond",
  directory: "triangle",
};

export default function TokenEfficiencyChart(props: Props) {
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

  const getStrategyLabel = (id: string) => {
    const strat = props.strategies.find(s => s.id === id);
    return strat?.displayName ?? id;
  };

  const chartData = createMemo(() => {
    const colors = modelColorMap();
    const modelMap = new Map<string, ModelConfig>();
    for (const m of props.models) modelMap.set(m.id, m);

    const dataPoints: Array<{
      run: RunSummary;
      model: ModelConfig;
      strategy: string;
      tokens: number;
      accuracy: number;
      color: string;
      opacity: number;
      shape: string;
    }> = [];

    for (const run of props.runs) {
      if (!STRATEGIES_TO_SHOW.includes(run.strategyId)) continue;
      if (run.score.mean === null || run.tokens.totalSum === 0) continue;
      
      const model = modelMap.get(run.modelId);
      if (!model) continue;

      dataPoints.push({
        run,
        model,
        strategy: run.strategyId,
        tokens: run.tokens.totalSum,
        accuracy: run.score.mean,
        color: colors.get(run.modelId) || MODEL_COLORS[0],
        opacity: run.strategyId === "minimal-servers" ? 0.5 : 1,
        shape: STRATEGY_SHAPES[run.strategyId] || "circle",
      });
    }

    return dataPoints;
  });

  const getChartOptions = (): echarts.EChartsOption => {
    const data = chartData();
    
    const seriesByStrategy = new Map<string, typeof data>();
    for (const d of data) {
      if (!seriesByStrategy.has(d.strategy)) {
        seriesByStrategy.set(d.strategy, []);
      }
      seriesByStrategy.get(d.strategy)!.push(d);
    }

    const series: echarts.ScatterSeriesOption[] = [];
    
    for (const strategyId of STRATEGIES_TO_SHOW) {
      const strategyData = seriesByStrategy.get(strategyId) || [];
      
      series.push({
        name: getStrategyLabel(strategyId),
        type: "scatter",
        symbol: STRATEGY_SHAPES[strategyId],
        symbolSize: 16,
        data: strategyData.map(d => ({
          value: [d.tokens, d.accuracy],
          itemStyle: {
            color: d.color,
            opacity: d.opacity,
          },
          model: d.model,
          run: d.run,
          strategy: d.strategy,
        })),
        emphasis: {
          scale: 1.5,
        },
      });
    }

    return {
      title: {
        text: "Token Efficiency vs Accuracy",
        subtext: "Lower tokens with higher accuracy = better efficiency",
        left: "center",
        textStyle: { fontSize: 18, fontWeight: "bold" },
        subtextStyle: { fontSize: 12, color: "#666" },
      },
      tooltip: {
        trigger: "item",
        formatter: (params: any) => {
          const { model, run, strategy } = params.data;
          if (!model || !run) return "";
          const tokens = run.tokens.totalSum;
          const tokensFormatted = tokens < 1_000_000 
            ? `${(tokens / 1000).toFixed(0)}K` 
            : `${(tokens / 1_000_000).toFixed(2)}M`;
          const std = run.score.stdDev;
          return `
            <strong>${model.displayName}</strong><br/>
            Strategy: ${getStrategyLabel(strategy)}<br/>
            Accuracy: ${(run.score.mean * 100).toFixed(1)}%${std !== null ? ` ± ${(std * 100).toFixed(1)}%` : ""}<br/>
            Total Tokens: ${tokensFormatted}<br/>
            Samples: ${run.sampleCount}
          `;
        },
      },
      legend: {
        data: STRATEGIES_TO_SHOW.map(getStrategyLabel),
        bottom: 10,
        itemWidth: 14,
        itemHeight: 14,
      },
      grid: {
        left: "3%",
        right: "4%",
        bottom: "15%",
        top: "15%",
        containLabel: true,
      },
      xAxis: {
        type: "value",
        name: "Total Tokens",
        nameLocation: "middle",
        nameGap: 30,
        axisLabel: {
          formatter: (v: number) => {
            if (v < 1000) return v.toString();
            if (v < 1_000_000) return `${(v / 1000).toFixed(0)}K`;
            return `${(v / 1_000_000).toFixed(1)}M`;
          },
        },
      },
      yAxis: {
        type: "value",
        name: "Accuracy",
        nameLocation: "middle",
        nameGap: 40,
        min: 0,
        max: 1,
        axisLabel: {
          formatter: (v: number) => `${(v * 100).toFixed(0)}%`,
        },
      },
      series,
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
          height: "500px",
          background: "#fafafa",
          "border-radius": "8px",
        }}
      />
      <div style={{ "margin-top": "12px", "font-size": "11px", color: "#888" }}>
        <p style={{ margin: "4px 0" }}>
          ● <strong>Copilot</strong> — Dynamic tool discovery via copilot routing
        </p>
        <p style={{ margin: "4px 0" }}>
          ◆ <strong>Minimal Servers</strong> — Only required servers loaded (half opacity, not practical without prior knowledge)
        </p>
        <p style={{ margin: "4px 0" }}>
          ▲ <strong>Directory</strong> — Tool discovery via directory lookup
        </p>
      </div>
    </div>
  );
}
