/* Shared constants for AIComposer & its sub-components. */
export const ALL_MODELS = [
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

export const MEMORY_MODES = [
        { key: "none", label: "No Memory", hint: "Answer the current question only" },
        { key: "chat", label: "This Chat", hint: "Use prior messages and AI answers in this chat" },
        { key: "project", label: "This Project", hint: "Use chat memory + linked project folder memory" },
        { key: "workspace", label: "Full Workspace", hint: "Use approved knowledge across the workspace" },
];

export const FALLBACK_FAVORITE = "gpt-4o-mini";
