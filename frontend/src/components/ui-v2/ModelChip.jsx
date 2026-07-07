/**
 * ModelChip — tiny pill that names a specific AI model. Uses JetBrains Mono
 * (the only sanctioned monospace use case in v2).
 */
const COLORS = {
	"gpt": { bg: "rgba(16,163,127,0.16)", fg: "#10A37F" },
	"claude": { bg: "rgba(217,119,87,0.18)", fg: "#D97757" },
	"gemini": { bg: "rgba(91,140,255,0.18)", fg: "#5B8CFF" },
	"deepseek": { bg: "rgba(56,189,248,0.18)", fg: "#38BDF8" },
	"perplexity": { bg: "rgba(34,211,238,0.16)", fg: "#22D3EE" },
	"grok": { bg: "rgba(167,139,250,0.20)", fg: "#A78BFA" },
};

function paletteFor(model) {
	const m = (model || "").toLowerCase();
	for (const key of Object.keys(COLORS)) if (m.startsWith(key)) return COLORS[key];
	return { bg: "rgba(255,210,63,0.16)", fg: "#FFD23F" };
}

export default function ModelChip({ model, className = "", ...rest }) {
	if (!model) return null;
	const { bg, fg } = paletteFor(model);
	return (
		<span
			className={`inline-flex items-center px-2 h-5 rounded-full font-mono text-[10px] tracking-tight ${className}`}
			style={{ backgroundColor: bg, color: fg }}
			{...rest}
		>
			{model}
		</span>
	);
}
