/**
 * SegmentedControl — quiet pill segmented control (iOS-style).
 *
 * options: [{ value, label, badge? }]
 * value:   active option value
 * onChange(value)
 */
export default function SegmentedControl({
	options,
	value,
	onChange,
	className = "",
	testid,
}) {
	return (
		<div
			data-testid={testid}
			className={`inline-flex bg-surface-2 rounded-full p-1 ${className}`}
		>
			{options.map((opt) => {
				const active = opt.value === value;
				return (
					<button
						key={opt.value}
						type="button"
						data-testid={`${testid}-${opt.value}`}
						onClick={() => onChange(opt.value)}
						className={`px-3 h-8 rounded-full text-sm font-medium transition-colors active:scale-[0.97] ${
							active ? "bg-ink text-black" : "text-ink-dim hover:text-ink"
						}`}
					>
						{opt.label}
						{opt.badge !== undefined && (
							<span className={`ml-1.5 text-[11px] ${active ? "text-black/60" : "text-ink-mute"}`}>
								{opt.badge}
							</span>
						)}
					</button>
				);
			})}
		</div>
	);
}
