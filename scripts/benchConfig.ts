export interface ModelConfig {
  id: string;
  provider: string;
  displayName: string;
  order: number;
}

export interface StrategyConfig {
  id: string;
  displayName: string;
  order: number;
}

export const MODELS: ModelConfig[] = [
  { id: "groq/openai/gpt-oss-20b", provider: "groq", displayName: "GPT OSS 20B", order: 1 },
  { id: "groq/emberglow/small", provider: "groq", displayName: "Emberglow Small", order: 2 },
  { id: "groq/openai/gpt-oss-120b", provider: "groq", displayName: "GPT OSS 120B", order: 3 },
  { id: "groq/minimaxai/minimax-m2", provider: "groq", displayName: "Minimax M2", order: 4 },
  { id: "groq/moonshotai/kimi-k2-instruct-0905", provider: "groq", displayName: "Kimi K2", order: 5 },
  { id: "openai/gpt-5-nano", provider: "openai", displayName: "GPT-5 Nano", order: 6 },
  { id: "openai/gpt-5.1", provider: "openai", displayName: "GPT-5.1", order: 7 },
  { id: "anthropic/claude-haiku-4-5-20251001", provider: "anthropic", displayName: "Claude 4.5 Haiku", order: 8 },
  { id: "anthropic/claude-sonnet-4-5-20250929", provider: "anthropic", displayName: "Claude 4.5 Sonnet", order: 9 },
  { id: "google/gemini-2.5-flash", provider: "google", displayName: "Gemini 2.5 Flash", order: 10 },
  { id: "google/gemini-3-pro-preview", provider: "google", displayName: "Gemini 3 Pro", order: 11 },
];

export const STRATEGIES: StrategyConfig[] = [
  { id: "copilot", displayName: "Copilot", order: 1 },
  { id: "directory", displayName: "Directory", order: 2 },
  { id: "minimal-tools", displayName: "Minimal Tools", order: 3 },
  { id: "minimal-servers", displayName: "Minimal Servers", order: 4 },
  { id: "distraction-64", displayName: "Distraction 64", order: 5 },
  { id: "distraction-128", displayName: "Distraction 128", order: 6 },
];

export const EPOCHS = 10;
