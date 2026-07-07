import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Phone, Video, PhoneIncoming, PhoneOutgoing, PhoneMissed, Plus } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import Avatar from "@/components/ui-v2/Avatar";
import SegmentedControl from "@/components/ui-v2/SegmentedControl";
import EmptyState from "@/components/ui-v2/EmptyState";
import { toast } from "sonner";

const CALL_FILTER_OPTIONS = [
	{ value: "all", label: "All" },
	{ value: "missed", label: "Missed" },
];

/**
 * /calls — Calls inbox.
 *
 * Top: large title.
 * Below: prominent "Start new call" card with people picker + audio/video CTAs.
 * Then a segmented control (All · Missed) + the recent calls list.
 */
export default function Calls() {
	const { user } = useAuth();
	const [calls, setCalls] = useState([]);
	const [members, setMembers] = useState([]);
	const [filter, setFilter] = useState("all");
	const [selected, setSelected] = useState([]);

	useEffect(() => {
		api.get("/calls/recent")
			.then(({ data }) => setCalls(Array.isArray(data) ? data : []))
			.catch(() => setCalls([]));
		api.get("/workspace/members")
			.then(({ data }) => setMembers((data || []).filter((m) => m.id !== user?.id)))
			.catch(() => setMembers([]));
	}, [user?.id]);

	const startCall = (mode) => {
		if (selected.length === 0) {
			toast.error("Pick at least one person to call");
			return;
		}
		const chatId = "new";
		window.open(`/call/${chatId}?mode=${mode}&with=${selected.join(",")}`, "_blank", "noopener");
	};

	const filtered = filter === "missed" ? calls.filter((c) => c.missed) : calls;

	return (
		<div className="min-h-[100dvh] bg-bg pb-24 md:pb-8">
			{/* Title row */}
			<div className="px-5 pt-8 md:pt-12 pb-4">
				<h1 className="text-[28px] leading-[34px] font-bold tracking-[-0.02em]">Calls</h1>
				<p className="text-[14px] text-ink-dim mt-1">
					Audio and video calls with live transcripts.
				</p>
			</div>

			{/* Start new call card */}
			<div className="mx-4 md:mx-5 rounded-2xl bg-surface p-4 mb-6">
				<div className="text-[15px] font-semibold mb-3">Start new call</div>

				{/* People picker */}
				<div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 mb-4">
					{members.slice(0, 12).map((m) => {
						const active = selected.includes(m.id);
						return (
							<button
								key={m.id}
								type="button"
								data-testid={`call-pick-${m.id}`}
								onClick={() =>
									setSelected((s) =>
										s.includes(m.id) ? s.filter((x) => x !== m.id) : [...s, m.id],
									)
								}
								className="shrink-0 flex flex-col items-center gap-1.5 w-16 active:scale-95 transition-transform"
							>
								<div
									className="relative"
									style={{
										boxShadow: active ? "0 0 0 2px #FFD23F" : undefined,
										borderRadius: 999,
									}}
								>
									<Avatar name={m.name} src={m.avatar} size={44} />
								</div>
								<span className="text-[11px] text-ink-dim truncate w-full text-center">
									{m.name?.split(" ")[0]}
								</span>
							</button>
						);
					})}
				</div>

				<div className="grid grid-cols-2 gap-2">
					<button
						data-testid="start-audio-call"
						onClick={() => startCall("audio")}
						className="h-12 rounded-2xl bg-brand text-black font-semibold inline-flex items-center justify-center gap-2 hover:bg-brand-deep active:scale-[0.98] transition-transform"
					>
						<Phone className="w-4 h-4" />
						Audio call
					</button>
					<button
						data-testid="start-video-call"
						onClick={() => startCall("video")}
						className="h-12 rounded-2xl bg-surface-2 text-ink font-semibold inline-flex items-center justify-center gap-2 hover:bg-surface-3 active:scale-[0.98] transition-transform"
					>
						<Video className="w-4 h-4" />
						Video call
					</button>
				</div>
			</div>

			{/* Filter */}
			<div className="px-4 md:px-5 pb-3 flex items-center justify-between">
				<SegmentedControl
					testid="calls-filter"
					options={CALL_FILTER_OPTIONS}
					value={filter}
					onChange={setFilter}
				/>
				<button
					data-testid="new-call-btn"
					onClick={() => startCall("audio")}
					className="hidden md:inline-flex h-9 px-3 rounded-full bg-brand text-black text-sm font-semibold items-center gap-1.5 hover:bg-brand-deep"
				>
					<Plus className="w-4 h-4" /> New
				</button>
			</div>

			{/* Recent calls */}
			{filtered.length === 0 ? (
				<EmptyState
					icon={Phone}
					title="No calls yet."
					sub="Tap the buttons above to start an audio or video call."
				/>
			) : (
				<div className="px-2 md:px-4">
					{filtered.map((c) => (
						<CallRow key={c.id} call={c} />
					))}
				</div>
			)}
		</div>
	);
}

function CallRow({ call }) {
	const dir = call.missed
		? { Icon: PhoneMissed, color: "text-tn-red" }
		: call.direction === "outgoing"
		? { Icon: PhoneOutgoing, color: "text-tn-green" }
		: { Icon: PhoneIncoming, color: "text-ink-dim" };
	return (
		<Link
			to={`/call/${call.id}/summary`}
			data-testid={`call-item-${call.id}`}
			className="flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-white/[0.03] active:bg-white/[0.05] transition-colors"
		>
			<Avatar name={call.peer_name || "Call"} src={call.peer_avatar} size={44} />
			<div className="flex-1 min-w-0">
				<div className="flex items-center gap-1.5">
					<span className="text-[15px] font-semibold truncate">{call.peer_name || "Group call"}</span>
				</div>
				<div className="flex items-center gap-1.5 mt-0.5">
					<dir.Icon className={`w-3.5 h-3.5 ${dir.color}`} />
					<span className="text-[12px] text-ink-dim">
						{call.subtitle || formatCallTime(call.started_at)}
					</span>
				</div>
			</div>
			<button
				type="button"
				className="w-9 h-9 rounded-full bg-surface-2 text-ink-dim hover:bg-surface-3 flex items-center justify-center"
				aria-label="Call back"
			>
				<Phone className="w-4 h-4" />
			</button>
		</Link>
	);
}

function formatCallTime(ts) {
	if (!ts) return "—";
	const d = new Date(ts);
	const today = new Date();
	if (d.toDateString() === today.toDateString()) {
		return `Today, ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
	}
	const yest = new Date();
	yest.setDate(today.getDate() - 1);
	if (d.toDateString() === yest.toDateString()) {
		return `Yesterday, ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
	}
	return d.toLocaleDateString([], { month: "short", day: "numeric" });
}
