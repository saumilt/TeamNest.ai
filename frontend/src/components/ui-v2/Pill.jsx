/**
 * Pill — small rounded chip / badge. Used for filter chips, status pills,
 * priority dots, etc.
 *
 * tone: 'default' | 'brand' | 'ai' | 'green' | 'red' | 'ghost'
 * size: 'sm' | 'md'
 */
const TONES = {
	default: "bg-surface-2 text-ink-dim",
	brand: "bg-brand-tint text-brand",
	ai: "bg-ai-tint text-ai",
	green: "bg-tn-green/15 text-tn-green",
	red: "bg-tn-red/15 text-tn-red",
	amber: "bg-amber-500/15 text-amber-300",
	ghost: "bg-transparent text-ink-mute border border-hairline",
};

const SIZES = {
	sm: "h-5 px-2 text-[11px]",
	md: "h-7 px-3 text-[12px]",
};

export default function Pill({
	tone = "default",
	size = "md",
	className = "",
	children,
	...rest
}) {
	return (
		<span
			className={`inline-flex items-center gap-1 rounded-full font-medium ${TONES[tone]} ${SIZES[size]} ${className}`}
			{...rest}
		>
			{children}
		</span>
	);
}
