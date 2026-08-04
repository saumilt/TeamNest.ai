/* Shared constants for AIComposer & its sub-components. */
export const ALL_MODELS = [
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

export const MEMORY_MODES = [
        { key: "none", label: "No Memory", hint: "Answer the current question only" },
        { key: "chat", label: "This Chat", hint: "Use prior messages and AI answers in this chat" },
        { key: "project", label: "This Project", hint: "Use chat memory + linked project folder memory" },
        { key: "workspace", label: "Full Workspace", hint: "Use approved knowledge across the workspace" },
];

export const FALLBACK_FAVORITE = "gpt-4o-mini";
