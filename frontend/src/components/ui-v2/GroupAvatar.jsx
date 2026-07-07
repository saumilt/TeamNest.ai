import Avatar from "./Avatar";

/**
 * GroupAvatar — two stacked smaller avatars used to represent a group chat
 * when no group icon is set. Defaults to 44px container, two 30px circles.
 */
export default function GroupAvatar({ members = [], size = 44 }) {
	const inner = Math.round(size * 0.68);
	const [a, b] = members;
	return (
		<div
			className="relative shrink-0"
			style={{ width: size, height: size }}
		>
			<div
				className="absolute"
				style={{ left: 0, top: 0 }}
			>
				<Avatar name={a?.name || "?"} src={a?.avatar} size={inner} />
			</div>
			<div
				className="absolute"
				style={{
					right: 0,
					bottom: 0,
					boxShadow: "0 0 0 2px var(--bg, #0A0A0E)",
					borderRadius: 999,
				}}
			>
				<Avatar name={b?.name || "·"} src={b?.avatar} size={inner} />
			</div>
		</div>
	);
}
