// Shared AI model catalogue for the mobile app — mirrors the web picker
// (frontend/src/components/ai_composer/constants.js) so both surfaces offer
// the same models with the same keys.
export type AiModel = {
  key: string;
  name: string;
  fast?: boolean;
  recommended?: boolean;
  hint?: string;
};

export const AI_MODELS: AiModel[] = [
  { key: "gpt-4o-mini", name: "GPT-5.4 mini", fast: true, hint: "Fast everyday answers · cheapest" },
  { key: "claude-haiku", name: "Claude Haiku", fast: true, hint: "Quick, crisp replies" },
  { key: "gemini-flash", name: "Gemini 3.5 Flash", fast: true, hint: "Fastest · quick lookups" },
  { key: "chatgpt", name: "ChatGPT 5.6", recommended: true, hint: "Strategy & structured thinking" },
  { key: "claude", name: "Claude Sonnet 5", hint: "Nuanced, long-form writing" },
  { key: "claude-opus", name: "Claude Opus 4.8", hint: "Deepest reasoning · complex work" },
  { key: "gemini", name: "Gemini 3.1 Pro", hint: "Data & analysis with numbers" },
  { key: "deepseek", name: "DeepSeek", hint: "Technical & coding tasks" },
  { key: "perplexity", name: "Perplexity", hint: "Web research with citations" },
  { key: "grok", name: "Grok", hint: "Bold, real-time takes" },
];

export const RECOMMENDED_MODEL = "chatgpt";

export const modelName = (k: string): string =>
  AI_MODELS.find((m) => m.key === k)?.name || k;
