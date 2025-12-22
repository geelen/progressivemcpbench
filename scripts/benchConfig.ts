export interface ModelConfig {
  id: string;
  provider: string;
  displayName: string;
}

export interface StrategyConfig {
  id: string;
  displayName: string;
}

export type ToolDiscoveryMode = "directory" | "regex" | "bm25";

export interface RemoteRunConfig {
  modelId: string;
  provider: string;
  toolDiscovery?: ToolDiscoveryMode;
  displayName: string;
}

export const MODELS: ModelConfig[] = [
  { id: "groq/openai/gpt-oss-20b", provider: "groq", displayName: "GPT OSS 20B" },
  // { id: "groq/emberglow/large", provider: "groq", displayName: "Emberglow Large" },
  { id: "groq/openai/gpt-oss-120b", provider: "groq", displayName: "GPT OSS 120B" },
  { id: "groq/minimaxai/minimax-m2", provider: "groq", displayName: "Minimax M2" },
  { id: "groq/moonshotai/kimi-k2-instruct-0905", provider: "groq", displayName: "Kimi K2" },
  { id: "openai/gpt-5-nano", provider: "openai", displayName: "GPT-5 Nano" },
  { id: "openai/gpt-5.1", provider: "openai", displayName: "GPT-5.1" },
  { id: "anthropic/claude-haiku-4-5-20251001", provider: "anthropic", displayName: "Claude 4.5 Haiku" },
  { id: "anthropic/claude-sonnet-4-5-20250929", provider: "anthropic", displayName: "Claude 4.5 Sonnet" },
  { id: "google/gemini-2.5-flash", provider: "google", displayName: "Gemini 2.5 Flash" },
  { id: "google/gemini-3-pro-preview", provider: "google", displayName: "Gemini 3 Pro" },
  { id: "google/gemini-3-flash-preview", provider: "google", displayName: "Gemini 3 Flash" },
  // { id: "groq/emberglow/small", provider: "groq", displayName: "Emberglow Small" },
];

export const STRATEGIES: StrategyConfig[] = [
  { id: "copilot", displayName: "Copilot" },
  { id: "directory", displayName: "Directory" },
  { id: "minimal-tools", displayName: "Minimal Tools" },
  { id: "minimal-servers", displayName: "Minimal Servers" },
  { id: "distraction-64", displayName: "Distraction 64" },
  { id: "distraction-128", displayName: "Distraction 128" },
];

export const REMOTE_STRATEGY = "minimal-servers-remote";

export const TOOL_DISCOVERY_BY_PROVIDER: Record<string, (ToolDiscoveryMode | undefined)[]> = {
  groq: [undefined, "directory"],
  anthropic: [undefined, "regex", "bm25"],
};

export function getRemoteRunConfigs(): RemoteRunConfig[] {
  const configs: RemoteRunConfig[] = [];

  for (const model of MODELS) {
    const toolDiscoveryModes = TOOL_DISCOVERY_BY_PROVIDER[model.provider];
    if (!toolDiscoveryModes) continue;

    for (const toolDiscovery of toolDiscoveryModes) {
      const suffix = toolDiscovery ? ` (${toolDiscovery})` : "";
      configs.push({
        modelId: model.id,
        provider: model.provider,
        toolDiscovery,
        displayName: `${model.displayName}${suffix}`,
      });
    }
  }

  return configs;
}

export const REMOTE_RUN_CONFIGS = getRemoteRunConfigs();

export const EPOCHS = 10;
