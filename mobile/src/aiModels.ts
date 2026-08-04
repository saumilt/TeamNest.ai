// Shared AI model catalogue for the mobile app — mirrors the web picker
// (frontend/src/components/ai_composer/constants.js) so both surfaces offer
// the same models with the same keys.
export type AiModel = {
  key: string;
  name: string;
  fast?: boolean;
  recommended?: boolean;
};

export const AI_MODELS: AiModel[] = [
  { key: "gpt-4o-mini", name: "GPT-5.4 mini", fast: true },
  { key: "claude-haiku", name: "Claude Haiku", fast: true },
  { key: "gemini-flash", name: "Gemini 3.5 Flash", fast: true },
  { key: "chatgpt", name: "ChatGPT 5.6", recommended: true },
  { key: "claude", name: "Claude Sonnet 5" },
  { key: "claude-opus", name: "Claude Opus 4.8" },
  { key: "gemini", name: "Gemini 3.1 Pro" },
  { key: "deepseek", name: "DeepSeek" },
  { key: "perplexity", name: "Perplexity" },
  { key: "grok", name: "Grok" },
];

export const RECOMMENDED_MODEL = "chatgpt";

export const modelName = (k: string): string =>
  AI_MODELS.find((m) => m.key === k)?.name || k;
