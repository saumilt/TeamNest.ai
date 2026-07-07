/**
 * CreditRing — animated circular progress for AI credit usage.
 *
 * Props:
 *   value, max   numeric credits remaining + total
 *   size         px (default 96)
 *   stroke       ring width (default 8)
 *   color        ring color (default brand)
 *   trackColor   under-ring color (default surface-3)
 *   children     optional override content inside the ring (default = `${value} / ${max}`)
 */
export default function CreditRing({
	value,
	max,
	size = 96,
	stroke = 8,
	color = "#FFD23F",
	trackColor = "#272731",
	className = "",
	children,
}) {
	const safeMax = Math.max(1, max || 1);
	const pct = Math.min(1, Math.max(0, (value || 0) / safeMax));
	const r = (size - stroke) / 2;
	const c = 2 * Math.PI * r;
	const offset = c * (1 - pct);

	return (
		<div
			className={`relative inline-flex items-center justify-center ${className}`}
			style={{ width: size, height: size }}
		>
			<svg width={size} height={size} className="-rotate-90">
				<circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={trackColor} strokeWidth={stroke} />
				<circle
					cx={size / 2}
					cy={size / 2}
					r={r}
					fill="none"
					stroke={color}
					strokeWidth={stroke}
					strokeLinecap="round"
					strokeDasharray={c}
					strokeDashoffset={offset}
					style={{ transition: "stroke-dashoffset 600ms ease-out" }}
				/>
			</svg>
			<div className="absolute inset-0 flex flex-col items-center justify-center text-center px-2">
				{children ?? (
					<>
						<div className="text-[20px] leading-none font-bold text-ink">{(value || 0).toLocaleString()}</div>
						<div className="text-[10px] text-ink-mute mt-0.5">of {safeMax.toLocaleString()}</div>
					</>
				)}
			</div>
		</div>
	);
}
