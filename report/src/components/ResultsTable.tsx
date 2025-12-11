import { For, Show, createSignal, createMemo } from "solid-js";
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
  const [selectedRuns, setSelectedRuns] = createSignal<Set<string>>(new Set());
  const [copied, setCopied] = createSignal(false);

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

  const runsByModel = createMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const run of props.runs) {
      if (!map.has(run.modelId)) {
        map.set(run.modelId, new Set());
      }
      map.get(run.modelId)!.add(run.strategyId);
    }
    return map;
  });

  const rerunCommand = createMemo(() => {
    const selected = selectedRuns();
    if (selected.size === 0) return null;

    const selectedByModel = new Map<string, Set<string>>();
    for (const runId of selected) {
      const run = props.runs.find((r) => r.id === runId);
      if (!run) continue;
      if (!selectedByModel.has(run.modelId)) {
        selectedByModel.set(run.modelId, new Set());
      }
      selectedByModel.get(run.modelId)!.add(run.strategyId);
    }

    const modelFlags: string[] = [];
    const strategyFlags: string[] = [];
    let allStrategiesForAllModels = true;

    for (const [modelId, strategies] of selectedByModel) {
      modelFlags.push(`-m "${modelId}"`);
      const allStrategiesForModel = runsByModel().get(modelId);
      if (!allStrategiesForModel || strategies.size !== allStrategiesForModel.size) {
        allStrategiesForAllModels = false;
        for (const s of strategies) {
          if (!strategyFlags.includes(`-s "${s}"`)) {
            strategyFlags.push(`-s "${s}"`);
          }
        }
      }
    }

    let command = `bun run scripts/runFullBench.ts ${modelFlags.join(" ")}`;
    if (!allStrategiesForAllModels && strategyFlags.length > 0) {
      command += ` ${strategyFlags.join(" ")}`;
    }

    return command;
  });

  const getModelName = (modelId: string): string => {
    return modelMap().get(modelId)?.displayName ?? modelId;
  };

  const getStrategyName = (strategyId: string): string => {
    return strategyMap().get(strategyId)?.displayName ?? strategyId;
  };

  const toggleRun = (runId: string) => {
    setSelectedRuns((prev) => {
      const next = new Set(prev);
      if (next.has(runId)) {
        next.delete(runId);
      } else {
        next.add(runId);
      }
      return next;
    });
  };

  const clearSelection = () => {
    setSelectedRuns(new Set());
  };

  const copyCommand = async () => {
    const cmd = rerunCommand();
    if (cmd) {
      await navigator.clipboard.writeText(cmd);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const thStyle = { padding: "8px 12px", "text-align": "left" as const, "border-bottom": "2px solid #ddd" };
  const thStyleRight = { ...thStyle, "text-align": "right" as const };
  const tdStyle = { padding: "8px 12px", "border-bottom": "1px solid #eee" };
  const tdStyleRight = { ...tdStyle, "text-align": "right" as const };

  return (
    <Show
      when={props.runs.length > 0}
      fallback={
        <p style={{ color: "#666", "font-style": "italic" }}>
          No benchmark runs found. Run <code>pnpm report:update</code> to process logs.
        </p>
      }
    >
      <div style={{ "overflow-x": "auto", "padding-bottom": selectedRuns().size > 0 ? "80px" : "0" }}>
        <table style={{ "border-collapse": "collapse", width: "100%", "font-size": "14px" }}>
          <thead>
            <tr style={{ "background-color": "#f5f5f5" }}>
              <th style={{ ...thStyle, width: "40px", "text-align": "center" as const }}>
                <span style={{ "font-size": "11px", color: "#888" }}>Rerun</span>
              </th>
              <th style={thStyle}>Model</th>
              <th style={thStyle}>Strategy</th>
              <th style={thStyleRight}>Run</th>
              <th style={thStyleRight}>Samples</th>
              <th style={thStyleRight}>Score</th>
              <th style={thStyleRight}>Time (mean)</th>
              <th style={thStyleRight}>Total Tokens</th>
              <th style={thStyleRight}>Model Calls</th>
              <th style={thStyleRight}>Tool Calls</th>
              <th style={thStyleRight}>Cache Hit</th>
            </tr>
          </thead>
          <tbody>
            <For each={sortedRuns()}>
              {(run, idx) => {
                const isSelected = () => selectedRuns().has(run.id);
                return (
                  <tr
                    style={{
                      "background-color": isSelected()
                        ? "#e8f4fd"
                        : idx() % 2 === 0
                          ? "#fff"
                          : "#fafafa",
                      cursor: "pointer",
                    }}
                    onClick={() => toggleRun(run.id)}
                  >
                    <td style={{ ...tdStyle, "text-align": "center" as const }}>
                      <input
                        type="checkbox"
                        checked={isSelected()}
                        onChange={() => toggleRun(run.id)}
                        onClick={(e) => e.stopPropagation()}
                        style={{ cursor: "pointer" }}
                      />
                    </td>
                    <td style={tdStyle}>{getModelName(run.modelId)}</td>
                    <td style={tdStyle}>{getStrategyName(run.strategyId)}</td>
                    <td style={{ ...tdStyleRight, color: "#888" }}>{formatRelativeTime(run.runAt)}</td>
                    <td style={tdStyleRight}>{run.sampleCount}</td>
                    <td style={tdStyleRight}>{formatScore(run.score.mean)}</td>
                    <td style={tdStyleRight}>{formatTime(run.time.totalMean)}</td>
                    <td style={tdStyleRight}>{formatTokens(run.tokens.totalSum)}</td>
                    <td style={tdStyleRight}>{run.calls.modelCalls}</td>
                    <td style={tdStyleRight}>{run.calls.toolCalls}</td>
                    <td style={tdStyleRight}>{formatPercent(run.cache.openaiHitRate)}</td>
                  </tr>
                );
              }}
            </For>
          </tbody>
        </table>
      </div>

      <Show when={selectedRuns().size > 0}>
        <div
          style={{
            position: "fixed",
            bottom: "0",
            left: "0",
            right: "0",
            background: "#1a1a1a",
            color: "#fff",
            padding: "12px 20px",
            display: "flex",
            "align-items": "center",
            gap: "16px",
            "box-shadow": "0 -4px 12px rgba(0,0,0,0.15)",
            "z-index": "1000",
          }}
        >
          <span style={{ "font-size": "13px", color: "#aaa" }}>
            {selectedRuns().size} run{selectedRuns().size > 1 ? "s" : ""} selected
          </span>
          <code
            style={{
              flex: "1",
              background: "#333",
              padding: "8px 12px",
              "border-radius": "4px",
              "font-size": "13px",
              "overflow-x": "auto",
              "white-space": "nowrap",
            }}
          >
            {rerunCommand()}
          </code>
          <button
            onClick={copyCommand}
            style={{
              background: copied() ? "#16a34a" : "#2563eb",
              color: "#fff",
              border: "none",
              padding: "8px 16px",
              "border-radius": "4px",
              cursor: "pointer",
              "font-size": "13px",
              "white-space": "nowrap",
            }}
          >
            {copied() ? "Copied!" : "Copy"}
          </button>
          <button
            onClick={clearSelection}
            style={{
              background: "transparent",
              color: "#aaa",
              border: "1px solid #555",
              padding: "8px 12px",
              "border-radius": "4px",
              cursor: "pointer",
              "font-size": "13px",
            }}
          >
            Clear
          </button>
        </div>
      </Show>
    </Show>
  );
}
