import { useEffect, useState } from "react";
import { api, API } from "@/lib/api";
import { VoiceNoteBubble } from "@/components/VoiceRecorder";
import MeetingSummaryDialog from "@/components/MeetingSummaryDialog";
import { ModelBadge } from "@/components/ModelBadge";
import { RerunPremiumButton } from "@/components/RerunPremiumButton";
import MemorySourcesPanel from "@/components/MemorySourcesPanel";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
        CornerDownRight,
        Pin,
        Trash2,
        Pencil,
        Smile,
        Sparkles,
        Paperclip,
        Download,
        Phone,
        Video,
        FileText,
        MoreHorizontal,
        Reply,
        Copy,
        Wand2,
        ListChecks,
} from "lucide-react";
import {
        DropdownMenu,
        DropdownMenuContent,
        DropdownMenuItem,
        DropdownMenuTrigger,
        DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import Avatar from "@/components/ui-v2/Avatar";
import Bubble from "@/components/ui-v2/Bubble";
import ModelChip from "@/components/ui-v2/ModelChip";
import Pill from "@/components/ui-v2/Pill";
import BuildProgressCard from "@/components/chat/BuildProgressCard";
import ApprovalActionCard from "@/components/chat/ApprovalActionCard";
import HirePromptCard from "@/components/chat/HirePromptCard";

const QUICK_REACTIONS = ["👍", "❤️", "😂", "🎉", "✅"];

/**
 * MessageBubble — single message row in a chat detail screen.
 *
 * Spec changes from v1:
 *  - Distinct visual treatments for received / sent / AI bubbles (Bubble component).
 *  - No "✦ Convert to task" chip below every message — it lives inside the
 *    long-press / overflow menu instead.
 *  - AI bubbles carry a model chip top-left + Synthesize action.
 *  - Avatar uses initials fallback (no jagged `<img alt>` strings).
 *
 * Props:
 *   message       message doc
 *   sender        sender user doc
 *   isMe          is the current user
 *   showAvatar    suppressed when this message clusters with the previous one
 *   showTimestamp shown on the last message of a cluster
 *   onOpenThread, onCreateTask  callbacks
 */
export default function MessageBubble({
        message,
        sender,
        isMe,
        showAvatar = true,
        showTimestamp = true,
        onOpenThread,
        onCreateTask,
        onPickIdea,
        comparisonAllowed = true,
        onFollowUp,
        onRouteChoice,
}) {
        const isAI =
                message.sender_id === "ai-system" ||
                message.sender_id == null ||
                message.kind === "ai" ||
                message.message_type === "ai_answer" ||
                message.message_type === "ai_question";
        const isAIQuestion = message.message_type === "ai_question";
        const isAIAnswer = message.message_type === "ai_answer" || (isAI && !isAIQuestion);
        const isSynthesized = message.metadata?.synthesized;
        const isReminder = message.metadata?.reminder;
        const isVoice = message.message_type === "voice_note";
        const isCallRecord = message.message_type === "call_started" || message.message_type === "call_ended";
        const [editing, setEditing] = useState(false);
        const [draft, setDraft] = useState(message.body);

        const submitEdit = async () => {
                try {
                        await api.patch(`/messages/${message.id}`, { body: draft });
                        setEditing(false);
                } catch {
                        toast.error("Edit failed");
                }
        };

        const onDelete = async () => api.delete(`/messages/${message.id}`);
        const onReact = async (emoji) => api.post(`/messages/${message.id}/react`, { emoji });
        const onPin = async () => {
                await api.post(`/messages/${message.id}/pin`);
                toast.success("Pinned");
        };
        const onCopy = async () => {
                try {
                        await navigator.clipboard.writeText(message.body || "");
                        toast.success("Copied");
                } catch {}
        };

        const created = new Date(message.created_at);
        const timeStr = created.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        const variant = isAI ? "ai" : isMe ? "sent" : "received";

        // Special full-width cards (calls, voice notes) — render outside the bubble grid.
        if (isCallRecord) {
                return (
                        <div className="flex justify-center" data-testid={`message-${message.id}`}>
                                <CallRecordCard message={message} />
                        </div>
                );
        }

        // Live build activity feed — full-width Emergent-style progress card.
        if (message.metadata?.build_activity_id) {
                return (
                        <div className="flex" data-testid={`message-${message.id}`}>
                                <BuildProgressCard activityId={message.metadata.build_activity_id} />
                        </div>
                );
        }

        // PM approval request — interactive approve/reject card.
        if (message.metadata?.approval_card) {
                return (
                        <div className="flex" data-testid={`message-${message.id}`}>
                                <ApprovalActionCard card={message.metadata.approval_card} />
                        </div>
                );
        }

        // @devmanager paywall — hire checkout prompt card.
        if (message.metadata?.hire_prompt) {
                return (
                        <div className="flex" data-testid={`message-${message.id}`}>
                                <HirePromptCard chatId={message.chat_id} />
                        </div>
                );
        }

        const aiDisplayName = message.metadata?.ai_display_name;
        const aiRole = message.metadata?.ai_role;
        // Use a short initial for the avatar; fall back to "AI" if no name yet.
        const aiInitial = aiDisplayName ? aiDisplayName[0]?.toUpperCase() : "AI";

        return (
                <div
                        className={`group flex gap-2.5 ${isMe ? "flex-row-reverse" : ""}`}
                        data-testid={`message-${message.id}`}
                >
                        {/* Avatar (suppressed during clustering) */}
                        <div className="w-8 shrink-0">
                                {showAvatar && !isMe && (
                                        <Avatar
                                                name={isAI ? aiInitial : sender?.name || "?"}
                                                src={sender?.avatar}
                                                size={32}
                                                ring={isAI ? "#B794F4" : undefined}
                                                className={isAI ? "bg-ai-tint" : ""}
                                        />
                                )}
                        </div>

                        <div className={`flex flex-col max-w-[78%] sm:max-w-[68%] ${isMe ? "items-end" : "items-start"}`}>
                                {showAvatar && !isMe && !isAI && sender?.name && (
                                        <span className="text-[12px] font-semibold text-ink-dim mb-1 px-1">
                                                {sender.name}
                                        </span>
                                )}
                                {showAvatar && !isMe && isAI && aiDisplayName && (
                                        <span className="text-[12px] font-semibold text-violet-300 mb-1 px-1 flex items-center gap-1.5">
                                                {aiDisplayName}
                                                {aiRole && (
                                                        <span className="text-[10px] font-mono uppercase tracking-widest text-violet-400/70">
                                                                · {aiRole}
                                                        </span>
                                                )}
                                        </span>
                                )}

                                {/* The actual bubble */}
                                <div className="relative">
                                        <Bubble variant={variant} isGroupStart={showAvatar} isGroupEnd={showTimestamp}>
                                                {/* AI metadata header */}
                                                {(isAIQuestion || isAIAnswer) && (
                                                        <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                                                                {isAIQuestion ? (
                                                                        <Pill tone="ai" size="sm">
                                                                                <Sparkles className="w-2.5 h-2.5" />
                                                                                AI question · {(message.metadata?.models || []).length} model(s)
                                                                        </Pill>
                                                                ) : isSynthesized ? (
                                                                        <Pill tone="ai" size="sm">
                                                                                <Sparkles className="w-2.5 h-2.5" />
                                                                                Synthesized
                                                                        </Pill>
                                                                ) : (
                                                                        <Pill tone="ai" size="sm">
                                                                                <Sparkles className="w-2.5 h-2.5" />
                                                                                AI answer
                                                                        </Pill>
                                                                )}
                                                                {message.metadata?.best_model_key && (
                                                                        <ModelBadge
                                                                                modelKey={message.metadata.best_model_key}
                                                                                modelName={message.metadata.best_model}
                                                                                credits={message.metadata?.credits_total}
                                                                                modelCount={message.metadata?.response_count}
                                                                        />
                                                                )}
                                                        </div>
                                                )}

                                                {isAIAnswer && message.metadata?.upgrade_required && (
                                                        <div className="mb-2 px-3 py-2 rounded-xl bg-brand-tint border border-brand/30 text-[12px] text-brand flex items-center justify-between gap-2">
                                                                <span>You&apos;ve hit your AI credits limit. Upgrade for more.</span>
                                                                <a
                                                                        href="/billing"
                                                                        data-testid="upgrade-cta"
                                                                        className="font-semibold text-[12px] underline"
                                                                >
                                                                        Upgrade →
                                                                </a>
                                                        </div>
                                                )}
                                                {isAIAnswer && !message.metadata?.upgrade_required && (
                                                        <RerunPremiumButton
                                                                question={message.metadata?.question_text || ""}
                                                                currentModelKey={message.metadata?.best_model_key}
                                                                chatId={message.chat_id}
                                                                parentMessageId={message.parent_message_id || message.id}
                                                        />
                                                )}
                                                {isReminder && (
                                                        <Pill tone="brand" size="sm" className="mb-2">
                                                                <Sparkles className="w-2.5 h-2.5" />
                                                                Personal reminder
                                                        </Pill>
                                                )}

                                                {/* Body */}
                                                {editing ? (
                                                        <div>
                                                                <textarea
                                                                        data-testid={`edit-input-${message.id}`}
                                                                        value={draft}
                                                                        onChange={(e) => setDraft(e.target.value)}
                                                                        className="w-full bg-surface-2 border border-hairline rounded-xl p-2 text-[14px] text-ink"
                                                                        rows={3}
                                                                />
                                                                <div className="flex gap-2 mt-2">
                                                                        <Button size="sm" onClick={submitEdit} className="h-7 bg-brand text-black hover:bg-brand-deep rounded-full text-xs">
                                                                                Save
                                                                        </Button>
                                                                        <Button size="sm" variant="outline" onClick={() => setEditing(false)} className="h-7 border-hairline bg-transparent rounded-full text-xs">
                                                                                Cancel
                                                                        </Button>
                                                                </div>
                                                        </div>
                                                ) : isVoice ? (
                                                        <VoiceNoteBubble message={message} currentUserId={isMe ? message.sender_id : null} onTask={onCreateTask} />
                                                ) : (
                                                        <div data-testid={`message-body-${message.id}`}>{renderBodyWithTaskMentions(message.body)}</div>
                                                )}

                                                {/* Attachments */}
                                                {(message.metadata?.attachments || []).length > 0 && (
                                                        <div className="mt-2 space-y-2" data-testid={`attachments-${message.id}`}>
                                                                {message.metadata.attachments.map((a, i) => (
                                                                        <Attachment key={a.file_id || a.url || `${message.id}-${i}`} attachment={a} />
                                                                ))}
                                                        </div>
                                                )}

                                                {/* Convert to task — visible inline on every regular text message (long-tap on mobile fires via overflow menu too) */}
                                                {!isAIAnswer && !isAIQuestion && !isVoice && message.message_type === "text" && message.body && (
                                                        <div className="mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity" data-testid={`msg-actions-${message.id}`}>
                                                                <button
                                                                        data-testid={`task-inline-${message.id}`}
                                                                        onClick={() => onCreateTask(message)}
                                                                        className="text-[10px] text-zinc-500 hover:text-brand hover:bg-brand/10 px-2 h-6 rounded-full inline-flex items-center gap-1 font-mono uppercase tracking-widest border border-transparent hover:border-brand/30"
                                                                        title="Convert this message to a task"
                                                                >
                                                                        <ListChecks className="w-2.5 h-2.5" />
                                                                        Convert to task
                                                                </button>
                                                        </div>
                                                )}

                                                {/* AI Conversation Mode — inline "Continue with AI?" choice for an
                                                    ambiguous message the sender just posted. */}
                                                {isMe && onRouteChoice && message.metadata?.pending_ai_route && (
                                                        <div className="mt-2 flex items-center flex-wrap gap-2 border border-ai/30 bg-ai/5 rounded-xl px-2.5 py-2" data-testid={`route-choice-${message.id}`}>
                                                                <span className="text-[11px] text-ink-mute">Continue with AI?</span>
                                                                <button
                                                                        data-testid={`route-ai-${message.id}`}
                                                                        onClick={() => onRouteChoice(message.id, "ai")}
                                                                        className="text-[11px] text-black bg-ai hover:opacity-90 px-2.5 h-7 rounded-full inline-flex items-center gap-1"
                                                                >
                                                                        Yes, ask AI
                                                                </button>
                                                                <button
                                                                        data-testid={`route-chat-${message.id}`}
                                                                        onClick={() => onRouteChoice(message.id, "chat")}
                                                                        className="text-[11px] text-ink-mute hover:text-ink border border-hairline px-2.5 h-7 rounded-full"
                                                                >
                                                                        Send to chat instead
                                                                </button>
                                                        </div>
                                                )}

                                                {/* AI thread peek */}
                                                {(isAIAnswer || isAIQuestion) && message.metadata?.thread_id && (
                                                        <div className="mt-2 flex flex-wrap gap-2">
                                                                <button
                                                                        data-testid={`open-thread-${message.metadata.thread_id}`}
                                                                        onClick={() => onOpenThread(message.metadata.thread_id)}
                                                                        className="text-[11px] text-ai hover:text-ai/80 hover:bg-ai/10 border border-ai/30 px-2.5 h-7 rounded-full inline-flex items-center gap-1.5"
                                                                >
                                                                        <CornerDownRight className="w-3 h-3" />
                                                                        {comparisonAllowed ? "Show all comparisons" : "Upgrade to compare"}
                                                                </button>
                                                                {isAIAnswer && (
                                                                        <button
                                                                                data-testid={`aitask-${message.id}`}
                                                                                onClick={() => onCreateTask(message)}
                                                                                className="text-[11px] text-brand hover:text-brand-deep hover:bg-brand/10 border border-brand/30 px-2.5 h-7 rounded-full inline-flex items-center gap-1.5"
                                                                                title="Create a task from this AI answer"
                                                                        >
                                                                                <Sparkles className="w-3 h-3" />
                                                                                Create task
                                                                        </button>
                                                                )}
                                                        </div>
                                                )}

                                                                                        {/* Phase 4 — Memory sources panel under AI answers */}
                                                                                        {isAIAnswer && message.metadata?.thread_id && (
                                                                                                <MemorySourcesPanel threadId={message.metadata.thread_id} />
                                                                                        )}

                                                                                        {/* AI Conversation Mode — one-tap follow-up chips */}
                                                                                        {isAIAnswer && onFollowUp && Array.isArray(message.metadata?.follow_up_suggestions) && (
                                                                                                <div className="mt-2 flex flex-wrap gap-1.5" data-testid={`followups-${message.id}`}>
                                                                                                        {message.metadata.follow_up_suggestions.map((s) => (
                                                                                                                <button
                                                                                                                        key={s}
                                                                                                                        data-testid={`followup-${s.toLowerCase().replace(/\s+/g, "-")}`}
                                                                                                                        onClick={() => onFollowUp(s, message)}
                                                                                                                        className="text-[11px] text-ink-mute hover:text-ink border border-hairline hover:border-ai/40 hover:bg-ai/5 px-2.5 h-7 rounded-full inline-flex items-center gap-1"
                                                                                                                >
                                                                                                                        {s}
                                                                                                                </button>
                                                                                                        ))}
                                                                                                </div>
                                                                                        )}
                                        </Bubble>

                                        {/* AI "Synthesize" small icon button anchored bottom-right of an AI answer bubble */}
                                        {isAIAnswer && !isSynthesized && message.metadata?.thread_id && (
                                                <button
                                                        onClick={() => onOpenThread(message.metadata.thread_id)}
                                                        className="absolute -bottom-2 right-2 w-7 h-7 rounded-full bg-ai-tint text-ai flex items-center justify-center hover:bg-ai/30 shadow-sm"
                                                        title="Synthesize best answer"
                                                        aria-label="Synthesize"
                                                >
                                                        <Sparkles className="w-3.5 h-3.5" />
                                                </button>
                                        )}
                                </div>

                                {/* System-message CTA button (e.g. "Open DevStudio →"
                                    after auto-start-project fires). Rendered as a
                                    prominent amber pill that's impossible to miss. */}
                                {message.metadata?.cta?.href && (
                                        <a
                                                href={message.metadata.cta.href}
                                                data-testid="msg-cta-link"
                                                className="mt-2 inline-flex items-center gap-1.5 h-9 px-4 rounded-pill bg-amber-300 hover:bg-amber-200 text-black font-semibold text-[13px] active:scale-[0.98]"
                                        >
                                                ⚡ {message.metadata.cta.label || "Open"}
                                                <span aria-hidden>→</span>
                                        </a>
                                )}

                                {/* End-of-build recommendation chips — tap one to drop
                                    the full @devmgr prompt into the composer. */}
                                {Array.isArray(message.metadata?.idea_chips) &&
                                        message.metadata.idea_chips.length > 0 && (
                                        <div className="flex flex-wrap gap-1.5 mt-2" data-testid="idea-chips">
                                                {message.metadata.idea_chips.map((c, i) => (
                                                        <button
                                                                key={i}
                                                                type="button"
                                                                onClick={() => onPickIdea?.(c.prompt)}
                                                                data-testid={`idea-chip-${i}`}
                                                                title={c.prompt}
                                                                className="group inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-amber-400/10 hover:bg-amber-300 hover:text-black ring-1 ring-amber-400/30 hover:ring-amber-300 text-amber-200 text-[12px] font-medium transition-colors max-w-[300px]"
                                                        >
                                                                <Sparkles className="w-3 h-3 shrink-0" />
                                                                <span className="truncate">{c.label}</span>
                                                        </button>
                                                ))}
                                        </div>
                                )}

                                {/* Reactions */}
                                {Object.keys(message.reactions || {}).length > 0 && (
                                        <div className={`flex gap-1 mt-1 flex-wrap ${isMe ? "justify-end" : ""}`}>
                                                {Object.entries(message.reactions).map(([emoji, users]) => (
                                                        <button
                                                                key={emoji}
                                                                onClick={() => onReact(emoji)}
                                                                className="bg-surface border border-hairline px-2 h-6 text-[11px] rounded-full hover:border-brand/40 inline-flex items-center gap-1"
                                                        >
                                                                <span>{emoji}</span>
                                                                <span className="text-ink-dim">{users.length}</span>
                                                        </button>
                                                ))}
                                        </div>
                                )}

                                {/* Footer: timestamp + overflow menu (no more always-visible "Convert to task") */}
                                {showTimestamp && (
                                        <div className={`flex items-center gap-1 mt-1 px-1 ${isMe ? "flex-row-reverse" : ""}`}>
                                                <span className="text-[10px] text-ink-mute">{timeStr}</span>
                                                {message.edited_at && <span className="text-[10px] text-ink-mute italic">edited</span>}
                                                {!isAI && !editing && (
                                                        <DropdownMenu>
                                                                <DropdownMenuTrigger asChild>
                                                                        <button
                                                                                data-testid={`message-menu-${message.id}`}
                                                                                className="opacity-0 group-hover:opacity-100 transition-opacity text-ink-mute hover:text-ink p-0.5 rounded-full hover:bg-white/5"
                                                                                aria-label="Message actions"
                                                                        >
                                                                                <MoreHorizontal className="w-3.5 h-3.5" />
                                                                        </button>
                                                                </DropdownMenuTrigger>
                                                                <DropdownMenuContent
                                                                        align={isMe ? "end" : "start"}
                                                                        className="bg-surface border-hairline rounded-2xl p-1 min-w-[200px]"
                                                                >
                                                                        <div className="flex gap-1 px-1.5 py-1.5">
                                                                                {QUICK_REACTIONS.map((e) => (
                                                                                        <button
                                                                                                key={e}
                                                                                                onClick={() => onReact(e)}
                                                                                                className="text-base hover:bg-white/10 w-7 h-7 rounded-full transition-colors"
                                                                                        >
                                                                                                {e}
                                                                                        </button>
                                                                                ))}
                                                                        </div>
                                                                        <DropdownMenuSeparator className="bg-hairline" />
                                                                        <DropdownMenuItem
                                                                                data-testid={`task-${message.id}`}
                                                                                onClick={() => onCreateTask(message)}
                                                                                className="rounded-xl text-[14px] cursor-pointer"
                                                                        >
                                                                                <ListChecks className="w-4 h-4 mr-2 text-brand" />
                                                                                Convert to task
                                                                        </DropdownMenuItem>
                                                                        <DropdownMenuItem
                                                                                data-testid={`save-memory-${message.id}`}
                                                                                onClick={async () => {
                                                                                        try {
                                                                                                await api.post(`/memory/save`, {
                                                                                                        source_type: "message",
                                                                                                        source_id: message.id,
                                                                                                        chat_id: message.chat_id,
                                                                                                        memory_type: "note",
                                                                                                        visibility: "chat",
                                                                                                });
                                                                                                toast.success("Saved to memory");
                                                                                        } catch (e) {
                                                                                                toast.error(e?.response?.data?.detail || "Save failed");
                                                                                        }
                                                                                }}
                                                                                className="rounded-xl text-[14px] cursor-pointer"
                                                                        >
                                                                                <Sparkles className="w-4 h-4 mr-2 text-purple-300" />
                                                                                Save to memory
                                                                        </DropdownMenuItem>
                                                                        <DropdownMenuItem onClick={onPin} className="rounded-xl text-[14px] cursor-pointer">
                                                                                <Pin className="w-4 h-4 mr-2" />
                                                                                Pin
                                                                        </DropdownMenuItem>
                                                                        <DropdownMenuItem onClick={onCopy} className="rounded-xl text-[14px] cursor-pointer">
                                                                                <Copy className="w-4 h-4 mr-2" />
                                                                                Copy
                                                                        </DropdownMenuItem>
                                                                        {isMe && (
                                                                                <>
                                                                                        <DropdownMenuItem
                                                                                                data-testid={`edit-${message.id}`}
                                                                                                onClick={() => setEditing(true)}
                                                                                                className="rounded-xl text-[14px] cursor-pointer"
                                                                                        >
                                                                                                <Pencil className="w-4 h-4 mr-2" />
                                                                                                Edit
                                                                                        </DropdownMenuItem>
                                                                                        <DropdownMenuItem
                                                                                                data-testid={`delete-${message.id}`}
                                                                                                onClick={onDelete}
                                                                                                className="rounded-xl text-[14px] cursor-pointer text-tn-red focus:text-tn-red"
                                                                                        >
                                                                                                <Trash2 className="w-4 h-4 mr-2" />
                                                                                                Delete
                                                                                        </DropdownMenuItem>
                                                                                </>
                                                                        )}
                                                                </DropdownMenuContent>
                                                        </DropdownMenu>
                                                )}
                                        </div>
                                )}
                        </div>
                </div>
        );
}

/** Highlight @task ... mentions inline as a small brand-tint chip. */
function renderBodyWithTaskMentions(body) {
        if (!body) return null;
        const parts = body.split(/(@task\b)/g);
        if (parts.length === 1) return body;
        return parts.map((p, i) =>
                p === "@task" ? (
                        <span
                                key={`task-${i}`}
                                className="inline-flex items-center gap-1 px-1.5 h-5 rounded-md bg-brand-tint text-brand text-[12px] font-semibold align-baseline"
                        >
                                <ListChecks className="w-3 h-3" />
                                @task
                        </span>
                ) : (
                        <span key={`txt-${i}-${p.slice(0, 8)}`}>{p}</span>
                ),
        );
}

function Attachment({ attachment }) {
        const [blobUrl, setBlobUrl] = useState(null);

        useEffect(() => {
                if (!attachment.is_image) return;
                let url;
                let cancelled = false;
                (async () => {
                        try {
                                const res = await fetch(`${API}/files/${attachment.id}`, {
                                        credentials: "include",
                                });
                                if (!res.ok) return;
                                const blob = await res.blob();
                                url = URL.createObjectURL(blob);
                                if (!cancelled) setBlobUrl(url);
                        } catch (err) {
                                console.warn("[attachment] failed to load preview", err);
                        }
                })();
                return () => {
                        cancelled = true;
                        if (url) URL.revokeObjectURL(url);
                };
        }, [attachment]);

        if (attachment.is_image) {
                return (
                        <a
                                href={blobUrl || "#"}
                                target="_blank"
                                rel="noreferrer"
                                data-testid={`attachment-image-${attachment.id}`}
                                className="block max-w-[320px] rounded-2xl overflow-hidden"
                        >
                                {blobUrl ? (
                                        <img src={blobUrl} alt="" className="w-full h-auto block" />
                                ) : (
                                        <div className="aspect-video bg-surface-2 animate-pulse" />
                                )}
                        </a>
                );
        }

        const download = async () => {
                const res = await fetch(`${API}/files/${attachment.id}`, {
                        credentials: "include",
                });
                const blob = await res.blob();
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = attachment.filename;
                a.click();
                URL.revokeObjectURL(url);
        };

        return (
                <button
                        onClick={download}
                        data-testid={`attachment-file-${attachment.id}`}
                        className="flex items-center gap-2 bg-surface-2 hover:bg-surface-3 px-3 py-2 rounded-xl text-[12px]"
                >
                        <Paperclip className="w-3.5 h-3.5 text-brand" />
                        <span className="font-medium truncate max-w-[260px]">{attachment.filename}</span>
                        <Download className="w-3 h-3 text-ink-mute ml-1" />
                </button>
        );
}

function fmtDuration(seconds) {
        if (!seconds && seconds !== 0) return "—";
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60).toString().padStart(2, "0");
        return `${m}:${s}`;
}

function CallRecordCard({ message }) {
        const meta = message.metadata || {};
        const isActive = meta.status === "active" || message.message_type === "call_started";
        const isVideo = meta.mode === "video";
        const [showNotes, setShowNotes] = useState(false);

        const join = () => {
                if (!meta.call_id) return;
                window.open(`/call/${meta.call_id}`, "_blank", "noopener");
        };

        return (
                <>
                        <div
                                data-testid={`call-card-${meta.call_id}`}
                                className={`rounded-2xl px-4 py-3 text-[13px] inline-flex items-center gap-3 ${
                                        isActive
                                                ? "bg-tn-green/10 text-tn-green border border-tn-green/30"
                                                : "bg-surface text-ink-dim border border-hairline"
                                }`}
                        >
                                {isVideo ? <Video className="w-4 h-4" /> : <Phone className="w-4 h-4" />}
                                <span className="font-medium">
                                        {isActive ? `Live ${meta.mode || "audio"} call` : `${meta.mode || "audio"} call · ${fmtDuration(meta.duration_seconds)}`}
                                </span>
                                {isActive ? (
                                        <button
                                                onClick={join}
                                                data-testid={`call-join-${meta.call_id}`}
                                                className="h-7 px-3 rounded-full bg-tn-green text-black font-semibold text-[12px]"
                                        >
                                                Join
                                        </button>
                                ) : (
                                        <button
                                                onClick={() => setShowNotes(true)}
                                                data-testid={`call-notes-${meta.call_id}`}
                                                className="h-7 px-3 rounded-full bg-surface-2 hover:bg-surface-3 text-ink text-[12px] inline-flex items-center gap-1"
                                        >
                                                <FileText className="w-3 h-3" />
                                                Notes
                                        </button>
                                )}
                        </div>
                        {meta.call_id && (
                                <MeetingSummaryDialog open={showNotes} onOpenChange={setShowNotes} callId={meta.call_id} />
                        )}
                </>
        );
}
