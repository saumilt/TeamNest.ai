import { useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import Avatar from "@/components/ui-v2/Avatar";

/**
 * ReactionReceipts — renders a message's persisted emoji reactions as pills;
 * tapping any pill opens a "Reactions" sheet listing WHO reacted with which
 * emoji (avatars + names), with a one-tap "Remove" for your own reaction.
 */
export default function ReactionReceipts({ reactions = {}, members = [], myId, isMe, onReact }) {
        const [open, setOpen] = useState(false);
        const entries = Object.entries(reactions || {}).filter(([, u]) => (u || []).length > 0);
        if (entries.length === 0) return null;

        const memberFor = (id) => (members || []).find((x) => x.id === id) || null;
        const nameFor = (id) => {
                if (id === myId) return "You";
                const m = memberFor(id);
                return m?.name || m?.email || (String(id).startsWith("ai") ? "AI" : "Someone");
        };

        return (
                <>
                        <div className={`flex gap-1 mt-1 flex-wrap ${isMe ? "justify-end" : ""}`} data-testid="reactions-row">
                                {entries.map(([emoji, users]) => {
                                        const mine = (users || []).includes(myId);
                                        return (
                                                <button
                                                        key={emoji}
                                                        type="button"
                                                        data-testid={`reaction-pill-${emoji}`}
                                                        onClick={() => setOpen(true)}
                                                        className={`px-2 h-6 text-[11px] rounded-full inline-flex items-center gap-1 border transition-colors ${
                                                                mine
                                                                        ? "border-brand/50 bg-brand/10"
                                                                        : "border-hairline bg-surface hover:border-brand/40"
                                                        }`}
                                                >
                                                        <span>{emoji}</span>
                                                        <span className="text-ink-dim">{users.length}</span>
                                                </button>
                                        );
                                })}
                        </div>
                        <Dialog open={open} onOpenChange={setOpen}>
                                <DialogContent className="bg-surface border-hairline max-w-sm">
                                        <DialogTitle className="text-[15px]">Reactions</DialogTitle>
                                        <div className="space-y-4 mt-2" data-testid="reactions-info">
                                                {entries.map(([emoji, users]) => (
                                                        <div key={emoji}>
                                                                <div className="text-[13px] font-semibold text-ink mb-1.5 flex items-center gap-1.5">
                                                                        <span className="text-base">{emoji}</span>
                                                                        <span className="text-ink-mute">{users.length}</span>
                                                                </div>
                                                                <div className="space-y-1.5">
                                                                        {(users || []).map((uid) => {
                                                                                const m = memberFor(uid);
                                                                                const mine = uid === myId;
                                                                                return (
                                                                                        <div key={uid} className="flex items-center gap-2" data-testid={`reaction-user-${emoji}-${uid}`}>
                                                                                                <Avatar name={m?.name || nameFor(uid)} src={m?.avatar} size={26} />
                                                                                                <span className="text-[13px] text-ink flex-1 truncate">{nameFor(uid)}</span>
                                                                                                {mine && onReact && (
                                                                                                        <button
                                                                                                                type="button"
                                                                                                                data-testid={`reaction-remove-${emoji}`}
                                                                                                                onClick={() => { onReact(emoji); setOpen(false); }}
                                                                                                                className="text-[11px] text-tn-red hover:underline"
                                                                                                        >
                                                                                                                Remove
                                                                                                        </button>
                                                                                                )}
                                                                                        </div>
                                                                                );
                                                                        })}
                                                                </div>
                                                        </div>
                                                ))}
                                        </div>
                                </DialogContent>
                        </Dialog>
                </>
        );
}
