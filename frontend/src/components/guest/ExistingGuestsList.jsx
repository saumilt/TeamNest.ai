import { UserMinus } from "lucide-react";

/**
 * ExistingGuestsList — read-only list of current chat guests with per-row
 * "remove" affordance. Extracted from InviteGuestDialog so the parent only
 * deals with state and orchestration.
 */
export default function ExistingGuestsList({ guests, removingId, onRemove }) {
	if (!guests || guests.length === 0) return null;
	return (
		<div data-testid="invite-guest-existing-list">
			<div className="text-[12px] font-semibold text-ink-dim mb-2">
				Current guests ({guests.length})
			</div>
			<div className="border border-hairline rounded-xl divide-y divide-hairline max-h-32 overflow-y-auto">
				{guests.map((g) => (
					<div
						key={g.id}
						data-testid={`existing-guest-${g.id}`}
						className="flex items-center gap-2.5 px-3 py-2"
					>
						<div className="w-7 h-7 bg-surface-2 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0">
							{g.name?.charAt(0)?.toUpperCase() || "?"}
						</div>
						<div className="flex-1 min-w-0">
							<div className="text-[13px] text-ink truncate">{g.name}</div>
							<div className="text-[11px] text-ink-mute truncate">{g.email}</div>
						</div>
						<button
							type="button"
							data-testid={`remove-guest-${g.id}`}
							onClick={() => onRemove(g)}
							disabled={removingId === g.id}
							title="Remove from this chat"
							className="text-[11px] font-medium text-ink-mute hover:text-tn-red px-2 py-1 rounded-full hover:bg-tn-red/10 inline-flex items-center gap-1"
						>
							{removingId === g.id ? "…" : (<><UserMinus className="w-3 h-3" /> Remove</>)}
						</button>
					</div>
				))}
			</div>
		</div>
	);
}
