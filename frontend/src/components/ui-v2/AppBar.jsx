/**
 * AppBar — 56h top bar with left/center/right slots.
 *
 * - Never put the teamnest.ai wordmark here.
 * - Hairline-bottom only when `scrolled` is true.
 * - Safe-area-inset-top aware.
 */
export default function AppBar({
	left,
	center,
	right,
	scrolled = true,
	className = "",
}) {
	return (
		<div
			className={`sticky top-0 z-20 bg-bg/90 backdrop-blur-md ${
				scrolled ? "border-b border-hairline" : ""
			} pt-[env(safe-area-inset-top)] ${className}`}
		>
			<div className="h-14 px-3 flex items-center gap-2">
				<div className="flex items-center min-w-0">{left}</div>
				<div className="flex-1 min-w-0 flex items-center justify-center text-center">{center}</div>
				<div className="flex items-center gap-1 shrink-0">{right}</div>
			</div>
		</div>
	);
}
