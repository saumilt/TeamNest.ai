/**
 * Bubble — messaging bubble for received / sent / ai messages.
 *
 * Props:
 *   variant       'received' | 'sent' | 'ai'
 *   isGroupStart  true if first bubble of a same-author cluster (full radius)
 *   isGroupEnd    true if last bubble (timestamp + tail rendered by caller)
 *   children      message content
 */
export default function Bubble({
	variant = "received",
	isGroupStart = true,
	isGroupEnd = true,
	children,
	className = "",
	...rest
}) {
	let base = "max-w-[78%] sm:max-w-[68%] px-3.5 py-2.5 text-[14px] leading-[20px] whitespace-pre-wrap break-words";
	let bg = "";
	let radius = "";

	if (variant === "sent") {
		bg = "bg-amber-400/[0.18] border border-amber-400/40 text-ink";
		radius = `rounded-[18px] ${isGroupStart ? "" : "rounded-tr-[6px]"} ${isGroupEnd ? "" : "rounded-br-[6px]"}`;
	} else if (variant === "ai") {
		bg = "bg-ai-tint text-ink";
		radius = `rounded-[18px] ${isGroupStart ? "" : "rounded-tl-[6px]"} ${isGroupEnd ? "" : "rounded-bl-[6px]"}`;
	} else {
		bg = "bg-surface text-ink";
		radius = `rounded-[18px] ${isGroupStart ? "" : "rounded-tl-[6px]"} ${isGroupEnd ? "" : "rounded-bl-[6px]"}`;
	}

	return (
		<div className={`${base} ${bg} ${radius} ${className}`} {...rest}>
			{children}
		</div>
	);
}
