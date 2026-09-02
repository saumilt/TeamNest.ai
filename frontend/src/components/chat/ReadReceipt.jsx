import { useState } from "react";
import { Check, CheckCheck } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import Avatar from "@/components/ui-v2/Avatar";

function fmt(iso) {
        if (!iso) return "";
        try {
                return new Date(iso).toLocaleString([], {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                });
        } catch {
                return "";
        }
}

/**
 * ReadReceipt — WhatsApp-style delivery/read ticks on the current user's own
 * messages. Single grey ✓ = sent, double grey ✓✓ = delivered, double amber
 * ✓✓ = read by everyone. In group chats the tick is tappable and opens a
 * "Message info" sheet listing who read / received / is yet to receive it.
 */
export default function ReadReceipt({ message, members = [], readState = {}, myId }) {
        const [open, setOpen] = useState(false);
        const created = message?.created_at || "";
        const others = (members || []).filter(
                (m) => m.id !== myId && !String(m.id).startsWith("ai"),
        );
        if (others.length === 0) return null;

        const readAt = (id) => readState?.[id]?.read_at || "";
        const delivAt = (id) => readState?.[id]?.delivered_at || readState?.[id]?.read_at || "";
        const readers = others.filter((m) => readAt(m.id) && readAt(m.id) >= created);
        const delivered = others.filter((m) => delivAt(m.id) && delivAt(m.id) >= created);
        const allRead = readers.length === others.length && others.length > 0;
        const anyDelivered = delivered.length > 0;

        const isGroup = others.length > 1;
        let Icon = Check;
        let color = "text-ink-mute";
        let state = "sent";
        if (allRead) {
                Icon = CheckCheck;
                color = "text-amber-400";
                state = "read";
        } else if (anyDelivered) {
                Icon = CheckCheck;
                color = "text-ink-mute";
                state = "delivered";
        }

        const tick = (
                <Icon
                        className={`w-3.5 h-3.5 ${color}`}
                        strokeWidth={2.5}
                        data-testid={`receipt-${message.id}`}
                        data-state={state}
                />
        );

        if (!isGroup) return tick;

        const deliveredNotRead = delivered.filter((m) => !(readAt(m.id) && readAt(m.id) >= created));
        const notDelivered = others.filter((m) => !(delivAt(m.id) && delivAt(m.id) >= created));

        return (
                <>
                        <button
                                type="button"
                                data-testid={`receipt-btn-${message.id}`}
                                onClick={() => setOpen(true)}
                                className="inline-flex items-center hover:opacity-80"
                                aria-label="Message info"
                        >
                                {tick}
                        </button>
                        <Dialog open={open} onOpenChange={setOpen}>
                                <DialogContent className="bg-surface border-hairline max-w-sm">
                                        <DialogTitle className="text-[15px]">Message info</DialogTitle>
                                        <div className="space-y-4 mt-2" data-testid={`read-by-${message.id}`}>
                                                <Section title={`Read · ${readers.length}`} tone="amber" people={readers} readState={readState} kind="read" />
                                                <Section title={`Delivered · ${deliveredNotRead.length}`} people={deliveredNotRead} readState={readState} kind="delivered" />
                                                <Section title={`Sent · ${notDelivered.length}`} people={notDelivered} />
                                        </div>
                                </DialogContent>
                        </Dialog>
                </>
        );
}

function Section({ title, people, readState = {}, kind, tone }) {
        if (!people || people.length === 0) return null;
        return (
                <div>
                        <div
                                className={`text-[11px] font-semibold uppercase tracking-wide mb-1.5 ${
                                        tone === "amber" ? "text-amber-400" : "text-ink-mute"
                                }`}
                        >
                                {title}
                        </div>
                        <div className="space-y-1.5">
                                {people.map((m) => (
                                        <div key={m.id} className="flex items-center gap-2" data-testid={`read-by-person-${m.id}`}>
                                                <Avatar name={m.name || "?"} src={m.avatar} size={26} />
                                                <span className="text-[13px] text-ink flex-1 truncate">{m.name || m.email}</span>
                                                {kind && (
                                                        <span className="text-[11px] text-ink-mute">
                                                                {fmt(kind === "read" ? readState[m.id]?.read_at : readState[m.id]?.delivered_at)}
                                                        </span>
                                                )}
                                        </div>
                                ))}
                        </div>
                </div>
        );
}
