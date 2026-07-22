import { forwardRef } from "react";
import MessageBubble from "@/components/MessageBubble";

/** Centered Today/Yesterday/date pill between message clusters. */
function DaySeparator({ label }) {
        return (
                <div className="flex justify-center my-3">
                        <span className="bg-surface-2 text-ink-mute text-[11px] font-medium px-2.5 py-1 rounded-full">
                                {label}
                        </span>
                </div>
        );
}

function labelForDay(d) {
        const today = new Date();
        const yest = new Date();
        yest.setDate(today.getDate() - 1);
        if (d.toDateString() === today.toDateString()) return "Today";
        if (d.toDateString() === yest.toDateString()) return "Yesterday";
        return d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}

/**
 * MessageList — vertically scrollable message stream with author-clustering
 * and day separators. Pure presentational; receives the full ordered list.
 */
const MessageList = forwardRef(function MessageList(
        { messages, memberMap, userId, typingUsers, onOpenThread, onCreateTask, onPickIdea, topSlot, bottomSlot, comparisonAllowed = true, onFollowUp, onRouteChoice, onAiAction, onReply, pendingAI = false, onStopAI },
        scrollRef,
) {
        // The "AI question" bubble echoes the user's own message verbatim (redundant —
        // the AI answer bubble already links to "Show all comparisons"), so hide it.
        const visible = messages.filter((m) => m.message_type !== "ai_question");
        // Index every message by id so replies can render a quoted preview of
        // their parent (resolved client-side from the loaded list).
        const msgById = {};
        for (const m of messages) msgById[m.id] = m;
        const out = [];
        let lastDayKey = null;
        let prevSender = null;

        for (let i = 0; i < visible.length; i++) {
                const m = visible[i];
                const d = new Date(m.created_at);
                const dayKey = d.toDateString();

                if (dayKey !== lastDayKey) {
                        out.push(<DaySeparator key={`day-${dayKey}`} label={labelForDay(d)} />);
                        lastDayKey = dayKey;
                        prevSender = null;
                }

                const nextMsg = visible[i + 1];
                const sameNextDay =
                        nextMsg && new Date(nextMsg.created_at).toDateString() === dayKey;
                const sameNextSender =
                        sameNextDay && nextMsg && nextMsg.sender_id === m.sender_id;

                const showAvatar = prevSender !== m.sender_id;
                const showTimestamp = !sameNextSender;
                prevSender = m.sender_id;

                // Quoted-reply preview: only user text replies carry a visible
                // quote (AI answers / task confirmations use parent_message_id
                // internally and shouldn't render a quote bubble).
                let parentPreview = null;
                if (m.message_type === "text" && m.parent_message_id && msgById[m.parent_message_id]) {
                        const p = msgById[m.parent_message_id];
                        const pName =
                                p.sender_id === userId
                                        ? "You"
                                        : (typeof p.sender_id === "string" && p.sender_id.startsWith("ai"))
                                                ? "AI"
                                                : memberMap[p.sender_id]?.name || "Member";
                        parentPreview = {
                                name: pName,
                                body: (p.body || "").replace(/[*#`>]/g, "").slice(0, 120),
                        };
                }

                out.push(
                        <MessageBubble
                                key={m.id}
                                message={m}
                                sender={
                                        m.sender_id === "ai-system"
                                                ? { name: "AI System", avatar: null }
                                                : m.sender_id?.startsWith?.("ai-agent-")
                                                        ? { name: m.metadata?.role_label || "AI Agent", avatar: null, is_ai_agent: true }
                                                        : memberMap[m.sender_id] || { name: "Unknown" }
                                }
                                isMe={m.sender_id === userId}
                                showAvatar={showAvatar}
                                showTimestamp={showTimestamp}
                                onOpenThread={onOpenThread}
                                onCreateTask={onCreateTask}
                                onPickIdea={onPickIdea}
                                comparisonAllowed={comparisonAllowed}
                                onFollowUp={onFollowUp}
                                onRouteChoice={onRouteChoice}
                                onAiAction={onAiAction}
                                onReply={onReply}
                                parentPreview={parentPreview}
                        />,
                );
        }

        return (
                <div
                        ref={scrollRef}
                        className="flex-1 overflow-y-auto px-3 md:px-6 py-4 space-y-2"
                        data-testid="messages-list"
                >
                        {topSlot}
                        {messages.length === 0 && (
                                <div className="text-center text-ink-dim py-12">
                                        <div className="text-base font-semibold mb-2 text-ink">
                                                Start the conversation
                                        </div>
                                        <div className="text-sm">
                                                Type a message or use{" "}
                                                <span className="text-ai">@AI</span> to query models.
                                        </div>
                                </div>
                        )}
                        {out}
                        {(() => {
                                const ids = Object.entries(typingUsers || {})
                                        .filter(([k, v]) => v && k !== userId)
                                        .map(([k]) => k);
                                if (ids.length === 0) return null;
                                const aiWorking = ids.some((id) => id.startsWith("ai-agent-") || id === "ai-system");
                                return (
                                        <div
                                                data-testid="typing-indicator"
                                                className={
                                                        "inline-flex items-center gap-2 mx-3 px-3 py-1.5 rounded-2xl rounded-bl-md text-xs " +
                                                        (aiWorking
                                                                ? "bg-amber-400/[0.08] text-amber-200 ring-1 ring-amber-400/20"
                                                                : "bg-surface-2 text-ink-mute ring-1 ring-hairline")
                                                }
                                        >
                                                <span className="flex gap-1">
                                                        <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce" style={{ animationDelay: "0ms" }} />
                                                        <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce" style={{ animationDelay: "150ms" }} />
                                                        <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce" style={{ animationDelay: "300ms" }} />
                                                </span>
                                                {aiWorking ? (
                                                        <span>🎯 <span className="font-medium">@devmanager</span> is working…</span>
                                                ) : (
                                                        <span className="italic">Typing…</span>
                                                )}
                                        </div>
                                );
                        })()}
                        {pendingAI && (
                                <div
                                        data-testid="ai-thinking-indicator"
                                        className="inline-flex items-center gap-2 mx-3 px-3 py-1.5 rounded-2xl rounded-bl-md text-xs bg-ai-tint text-ai ring-1 ring-ai/25"
                                >
                                        <span className="flex gap-1">
                                                <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce" style={{ animationDelay: "0ms" }} />
                                                <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce" style={{ animationDelay: "150ms" }} />
                                                <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce" style={{ animationDelay: "300ms" }} />
                                        </span>
                                        <span className="font-medium">AI is thinking…</span>
                                        <button
                                                type="button"
                                                data-testid="stop-ai-btn"
                                                onClick={onStopAI}
                                                className="ml-1 inline-flex items-center gap-1 h-6 px-2.5 rounded-full bg-tn-red/15 text-tn-red hover:bg-tn-red/25 font-semibold"
                                        >
                                                <span className="w-2 h-2 rounded-[2px] bg-current" />
                                                Stop
                                        </button>
                                </div>
                        )}
                        {bottomSlot}
                </div>
        );
});

export default MessageList;
