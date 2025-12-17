import { createSignal, createMemo, For } from "solid-js";
import type { RunSummary, ModelConfig, StrategyConfig } from "../types/report";
import BaselineChart from "./BaselineChart";
import StrategyProgressionChart from "./StrategyProgressionChart";
import AdvancedStrategiesChart from "./AdvancedStrategiesChart";
import TokenEfficiencyChart from "./TokenEfficiencyChart";

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

export default function ChartsContainer(props: Props) {
  const sortedModels = createMemo(() => {
    return [...props.models].sort((a, b) => a.order - b.order);
  });

  const [selectedModels, setSelectedModels] = createSignal<Set<string>>(
    new Set(props.models.map(m => m.id))
  );

  const modelColorMap = createMemo(() => {
    const map = new Map<string, string>();
    sortedModels().forEach((m, i) => {
      map.set(m.id, MODEL_COLORS[i % MODEL_COLORS.length]);
    });
    return map;
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
  };

  const selectAll = () => {
    setSelectedModels(new Set(props.models.map(m => m.id)));
  };

  const selectNone = () => {
    setSelectedModels(new Set());
  };

  const filteredRuns = createMemo(() => {
    return props.runs.filter(r => selectedModels().has(r.modelId));
  });

  const filteredModels = createMemo(() => {
    return sortedModels().filter(m => selectedModels().has(m.id));
  });

  return (
    <div>
      <section>
        <h2>1. Baseline Tool Calling Ability</h2>
        <p class="section-intro">
          Each model's performance on the <strong>minimal-tools</strong> strategy, 
          where only the exact tools needed for each task are provided. This measures 
          the model's fundamental ability to understand and correctly invoke tools 
          without distractions or discovery overhead.
        </p>
        <BaselineChart
          runs={filteredRuns()}
          models={filteredModels()}
        />
      </section>

      <div
        style={{
          display: "flex",
          gap: "8px",
          "margin-bottom": "32px",
          "flex-wrap": "wrap",
          "align-items": "center",
          padding: "16px",
          background: "#f5f5f5",
          "border-radius": "8px",
        }}
      >
        <span style={{ "font-size": "12px", color: "#666", "margin-right": "4px" }}>
          Select models:
        </span>
        <button
          onClick={selectAll}
          style={{
            padding: "4px 8px",
            border: "1px solid #ddd",
            "border-radius": "4px",
            background: "#fff",
            cursor: "pointer",
            "font-size": "11px",
          }}
        >
          All
        </button>
        <button
          onClick={selectNone}
          style={{
            padding: "4px 8px",
            border: "1px solid #ddd",
            "border-radius": "4px",
            background: "#fff",
            cursor: "pointer",
            "font-size": "11px",
            "margin-right": "8px",
          }}
        >
          None
        </button>
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

      <section>
        <h2>2. Strategy Impact on Accuracy</h2>
        <p class="section-intro">
          How accuracy degrades as we introduce more tools and require discovery.
          From left to right: minimal-tools (best case), minimal-servers (some extra tools), 
          distraction-64 (64 irrelevant tools), distraction-128 (128 irrelevant tools).
        </p>
        <StrategyProgressionChart
          runs={filteredRuns()}
          models={filteredModels()}
          strategies={props.strategies}
        />
      </section>

      <section>
        <h2>3. Advanced Discovery Strategies</h2>
        <p class="section-intro">
          How do intelligent discovery mechanisms (copilot routing, directory lookup) 
          compare to the baseline spectrum? The four baseline strategies show the range 
          from best to worst case, while copilot and directory show where smarter 
          discovery lands within that range.
        </p>
        <AdvancedStrategiesChart
          runs={filteredRuns()}
          models={filteredModels()}
          strategies={props.strategies}
        />
      </section>

      <section>
        <h2>4. Token Efficiency</h2>
        <p class="section-intro">
          Accuracy vs total token usage for practical strategies. The ideal position 
          is upper-left (high accuracy, low tokens). Directory strategy should show 
          significantly lower token usage while maintaining competitive accuracy. 
          Minimal-servers is shown at half opacity as it requires prior knowledge of 
          which servers are needed.
        </p>
        <TokenEfficiencyChart
          runs={filteredRuns()}
          models={filteredModels()}
          strategies={props.strategies}
        />
      </section>
    </div>
  );
}
