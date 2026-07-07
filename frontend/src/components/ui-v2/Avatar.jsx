import { avatarColor, initials } from "@/theme/tokens";

/**
 * Avatar — round, image-or-initials fallback.
 *
 * Props:
 *   src         optional image URL
 *   name        display name (used for initials + deterministic colour)
 *   size        px (default 44)
 *   ring        optional ring color (e.g. AI purple, brand amber for pinned)
 *   online      boolean — show a 10px green online dot bottom-right
 *   className   extra classes for the wrapper
 */
export default function Avatar({
	src,
	name = "?",
	size = 44,
	ring,
	online,
	className = "",
	...rest
}) {
	const dim = { width: size, height: size };
	const fontPx = Math.max(11, Math.round(size * 0.4));
	return (
		<div
			className={`relative shrink-0 ${className}`}
			style={dim}
			{...rest}
		>
			<div
				className="rounded-full overflow-hidden flex items-center justify-center text-white font-semibold"
				style={{
					...dim,
					backgroundColor: src ? "#27272f" : avatarColor(name),
					boxShadow: ring ? `0 0 0 2px ${ring}` : undefined,
					fontSize: fontPx,
				}}
			>
				{src ? (
					<img
						src={src}
						alt=""
						className="w-full h-full object-cover"
						draggable={false}
					/>
				) : (
					<span className="leading-none select-none">{initials(name)}</span>
				)}
			</div>
			{online && (
				<span
					className="absolute bottom-0 right-0 rounded-full bg-tn-green"
					style={{
						width: Math.max(8, size * 0.22),
						height: Math.max(8, size * 0.22),
						boxShadow: "0 0 0 2px var(--bg, #0A0A0E)",
					}}
				/>
			)}
		</div>
	);
}
