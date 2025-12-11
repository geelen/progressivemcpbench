import { For, Show, createMemo } from "solid-js";
import type { RunSummary, ModelConfig, StrategyConfig } from "../types/report";

interface Props {
  runs: RunSummary[];
  models: ModelConfig[];
  strategies: StrategyConfig[];
}

function formatTime(seconds: number | null): string {
  if (seconds === null) return "—";
  if (seconds < 1) return `${(seconds * 1000).toFixed(0)}ms`;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
}

function formatTokens(count: number | null): string {
  if (count === null || count === 0) return "0";
  if (count < 1000) return count.toString();
  if (count < 1_000_000) return `${(count / 1000).toFixed(1)}K`;
  return `${(count / 1_000_000).toFixed(2)}M`;
}

function formatPercent(value: number | null): string {
  if (value === null) return "—";
  return `${(value * 100).toFixed(1)}%`;
}

function formatRelativeTime(isoDate: string): string {
  const date = new Date(isoDate);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return "yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return date.toLocaleDateString();
}

function formatScore(value: number | null): string {
  if (value === null) return "—";
  return value.toFixed(3);
}

export default function ResultsTable(props: Props) {
  const modelMap = createMemo(() => {
    const map = new Map<string, ModelConfig>();
    for (const m of props.models) map.set(m.id, m);
    return map;
  });

  const strategyMap = createMemo(() => {
    const map = new Map<string, StrategyConfig>();
    for (const s of props.strategies) map.set(s.id, s);
    return map;
  });

  const sortedRuns = createMemo(() => {
    return [...props.runs].sort((a, b) => {
      const modelA = modelMap().get(a.modelId);
      const modelB = modelMap().get(b.modelId);
      const stratA = strategyMap().get(a.strategyId);
      const stratB = strategyMap().get(b.strategyId);

      const modelOrder = (modelA?.order ?? 999) - (modelB?.order ?? 999);
      if (modelOrder !== 0) return modelOrder;

      return (stratA?.order ?? 999) - (stratB?.order ?? 999);
    });
  });

  const getModelName = (modelId: string): string => {
    return modelMap().get(modelId)?.displayName ?? modelId;
  };

  const getStrategyName = (strategyId: string): string => {
    return strategyMap().get(strategyId)?.displayName ?? strategyId;
  };

  return (
    <Show
      when={props.runs.length > 0}
      fallback={
        <p style={{ color: "#666", "font-style": "italic" }}>
          No benchmark runs found. Run <code>pnpm report:update</code> to process logs.
        </p>
      }
    >
      <div style={{ "overflow-x": "auto" }}>
        <table style={{ "border-collapse": "collapse", width: "100%", "font-size": "14px" }}>
          <thead>
            <tr style={{ "background-color": "#f5f5f5" }}>
              <th style={{ padding: "8px 12px", "text-align": "left", "border-bottom": "2px solid #ddd" }}>Model</th>
              <th style={{ padding: "8px 12px", "text-align": "left", "border-bottom": "2px solid #ddd" }}>Strategy</th>
              <th style={{ padding: "8px 12px", "text-align": "right", "border-bottom": "2px solid #ddd" }}>Run</th>
              <th style={{ padding: "8px 12px", "text-align": "right", "border-bottom": "2px solid #ddd" }}>Samples</th>
              <th style={{ padding: "8px 12px", "text-align": "right", "border-bottom": "2px solid #ddd" }}>Score</th>
              <th style={{ padding: "8px 12px", "text-align": "right", "border-bottom": "2px solid #ddd" }}>Time (mean)</th>
              <th style={{ padding: "8px 12px", "text-align": "right", "border-bottom": "2px solid #ddd" }}>Total Tokens</th>
              <th style={{ padding: "8px 12px", "text-align": "right", "border-bottom": "2px solid #ddd" }}>Model Calls</th>
              <th style={{ padding: "8px 12px", "text-align": "right", "border-bottom": "2px solid #ddd" }}>Tool Calls</th>
              <th style={{ padding: "8px 12px", "text-align": "right", "border-bottom": "2px solid #ddd" }}>Cache Hit</th>
            </tr>
          </thead>
          <tbody>
            <For each={sortedRuns()}>
              {(run, idx) => (
                <tr
                  style={{
                    "background-color": idx() % 2 === 0 ? "#fff" : "#fafafa",
                  }}
                >
                  <td style={{ padding: "8px 12px", "border-bottom": "1px solid #eee" }}>{getModelName(run.modelId)}</td>
                  <td style={{ padding: "8px 12px", "border-bottom": "1px solid #eee" }}>{getStrategyName(run.strategyId)}</td>
                  <td style={{ padding: "8px 12px", "text-align": "right", "border-bottom": "1px solid #eee", color: "#888" }}>{formatRelativeTime(run.runAt)}</td>
                  <td style={{ padding: "8px 12px", "text-align": "right", "border-bottom": "1px solid #eee" }}>{run.sampleCount}</td>
                  <td style={{ padding: "8px 12px", "text-align": "right", "border-bottom": "1px solid #eee" }}>{formatScore(run.score.mean)}</td>
                  <td style={{ padding: "8px 12px", "text-align": "right", "border-bottom": "1px solid #eee" }}>{formatTime(run.time.totalMean)}</td>
                  <td style={{ padding: "8px 12px", "text-align": "right", "border-bottom": "1px solid #eee" }}>{formatTokens(run.tokens.totalSum)}</td>
                  <td style={{ padding: "8px 12px", "text-align": "right", "border-bottom": "1px solid #eee" }}>{run.calls.modelCalls}</td>
                  <td style={{ padding: "8px 12px", "text-align": "right", "border-bottom": "1px solid #eee" }}>{run.calls.toolCalls}</td>
                  <td style={{ padding: "8px 12px", "text-align": "right", "border-bottom": "1px solid #eee" }}>{formatPercent(run.cache.openaiHitRate)}</td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </div>
    </Show>
  );
}
