/**
 * TeamNest v2 design tokens — single source of truth for theme constants
 * referenced from JS. Tailwind classes hold the same values; this module
 * exists so JSX code can read the same numbers (motion durations,
 * deterministic avatar palette hash, etc.).
 *
 * TODO: light mode
 */
export const color = {
	bg: "#0A0A0E",
	surface: "#17171E",
	surface2: "#1F1F27",
	surface3: "#272731",
	hairline: "rgba(255,255,255,0.08)",
	ink: "#F5F5F7",
	inkDim: "rgba(245,245,247,0.62)",
	inkMute: "rgba(245,245,247,0.40)",
	brand: "#FFD23F",
	brandDeep: "#E0A800",
	brandTint: "rgba(255,210,63,0.14)",
	ai: "#B794F4",
	aiTint: "rgba(183,148,244,0.16)",
	green: "#34D399",
	red: "#F87171",
	bubbleOut: "#3A2E14",
};

export const radius = {
	bubble: 18,
	bubbleTail: 6,
	card: 16,
	pill: 22,
	avatar: 999,
};

export const motion = {
	tapPress: 40,
	tabSwitch: 160,
	rippleRow: 80,
};

/** Deterministic 8-colour palette for avatar fallbacks, hashed off the name. */
const AVATAR_PALETTE = [
	"#F87171", "#FB923C", "#FBBF24", "#34D399",
	"#22D3EE", "#60A5FA", "#A78BFA", "#F472B6",
];

export function avatarColor(name = "") {
	let h = 0;
	for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
	return AVATAR_PALETTE[h % AVATAR_PALETTE.length];
}

export function initials(name = "") {
	const parts = name.trim().split(/\s+/).filter(Boolean);
	if (parts.length === 0) return "?";
	if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
	return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}
