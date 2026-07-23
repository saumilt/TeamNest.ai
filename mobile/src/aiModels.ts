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
  { key: "gpt-4o-mini", name: "ChatGPT mini", fast: true },
  { key: "claude-haiku", name: "Claude Haiku", fast: true },
  { key: "gemini-flash", name: "Gemini Flash", fast: true },
  { key: "chatgpt", name: "ChatGPT 4o", recommended: true },
  { key: "claude", name: "Claude Sonnet" },
  { key: "gemini", name: "Gemini Pro" },
  { key: "deepseek", name: "DeepSeek" },
  { key: "perplexity", name: "Perplexity" },
  { key: "grok", name: "Grok" },
];

export const RECOMMENDED_MODEL = "chatgpt";

export const modelName = (k: string): string =>
  AI_MODELS.find((m) => m.key === k)?.name || k;
