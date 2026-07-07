import { NavLink, useLocation } from "react-router-dom";
import { MessageSquare, Sparkles, CheckSquare, Phone, User } from "lucide-react";

/**
 * Bottom TabBar — 5 primary destinations per the v2 spec:
 * Chats · AI · Tasks · Calls · You.
 *
 * Hidden on:
 *   - /chats/:chatId    (full-screen push-detail pattern)
 *   - /call/:callId     (in-call UI)
 *   - /                 (pre-auth Welcome)
 */
const TABS = [
	{ to: "/chats",    label: "Chats", icon: MessageSquare, testid: "tab-chats",    end: true },
	{ to: "/research", label: "AI",    icon: Sparkles,      testid: "tab-ai",       accent: "#B794F4" },
	{ to: "/tasks",    label: "Tasks", icon: CheckSquare,   testid: "tab-tasks" },
	{ to: "/calls",    label: "Calls", icon: Phone,         testid: "tab-calls" },
	{ to: "/you",      label: "You",   icon: User,          testid: "tab-you" },
];

export default function MobileTabBar() {
	const location = useLocation();
	const isChatDetail = /^\/chats\/[^/]+/.test(location.pathname);
	const isCall = location.pathname.startsWith("/call/");
	if (isChatDetail || isCall) return null;

	return (
		<nav
			data-testid="mobile-tab-bar"
			className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-bg/85 backdrop-blur-xl border-t border-hairline pb-[env(safe-area-inset-bottom)]"
			aria-label="Primary"
		>
			<div className="grid grid-cols-5">
				{TABS.map((t) => (
					<NavLink
						key={t.to}
						to={t.to}
						end={t.end}
						data-testid={t.testid}
						className="relative flex flex-col items-center justify-center gap-1 py-2 active:scale-95 transition-transform"
					>
						{({ isActive }) => (
							<>
								{isActive && (
									<span
										className="absolute top-0 h-[3px] w-[18px] rounded-full"
										style={{ backgroundColor: t.accent || "#FFD23F" }}
									/>
								)}
								<t.icon
									className="w-[22px] h-[22px]"
									strokeWidth={isActive ? 0 : 1.8}
									fill={isActive ? (t.accent || "#FFD23F") : "none"}
									stroke={isActive ? (t.accent || "#FFD23F") : "rgba(245,245,247,0.40)"}
								/>
								<span
									className="text-[11px] font-semibold"
									style={{
										color: isActive
											? (t.accent || "#F5F5F7")
											: "rgba(245,245,247,0.40)",
									}}
								>
									{t.label}
								</span>
							</>
						)}
					</NavLink>
				))}
			</div>
		</nav>
	);
}
