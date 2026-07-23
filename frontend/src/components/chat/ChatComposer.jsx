import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Send,
  Sparkles,
  Wand2,
  Paperclip,
  X,
  Camera,
  Brain,
  Users,
  CornerDownRight,
  Pencil,
  Image as ImageIcon,
} from "lucide-react";
import AIComposer from "@/components/AIComposer";
import VoiceRecorder from "@/components/VoiceRecorder";
import MentionPopover, { detectMention } from "@/components/chat/MentionPopover";
import SlashCommandPopover, { detectSlash } from "@/components/chat/SlashCommandPopover";
import AiModelPicker from "@/components/chat/AiModelPicker";
import { ALL_MODELS } from "@/components/ai_composer/constants";

// True when the draft is an `@ai` command (so we should offer the model picker).
const isAiTrigger = (text) => /^\s*@ai\b/i.test(text || "");

/**
 * ChatComposer — bottom composer area for an open chat. Holds attachment
 * chips, toolbar (attach / camera / voice / Improve / Ask AI), and the
 * textarea + send button. Pure presentational.
 */
export default function ChatComposer({
  chat,
  chatId,
  draft,
  onDraftChange,
  onSend,
  onQuickAction,
  onSendTyping,
  attachments,
  onRemoveAttachment,
  fileInputRef,
  cameraInputRef,
  onPickFile,
  onPickCamera,
  onFileChange,
  uploading,
  showAI,
  onCancelAI,
  onAIResearch,
  onOpenImprove,
  onOpenAI,
  onRefreshMessages,
  comparisonAllowed = true,
  aiSession = { active: false },
  onExitAi,
  replyTo,
  onCancelReply,
  nextToTeam = false,
  onToggleTarget,
  aiModels = [],
  onAiModelsChange,
  rememberModels = true,
  onRememberChange,
}) {
  const hasImageAttachment = attachments.some((a) => a.is_image);
  const textareaRef = useRef(null);
  const [caret, setCaret] = useState(-1);
  const [showMemory, setShowMemory] = useState(false);
  // Inline @ai model picker: opens automatically the moment the user types
  // "@ai" (until they pick or dismiss it for this compose).
  const [inlineOpen, setInlineOpen] = useState(false);
  const [inlineDismissed, setInlineDismissed] = useState(false);
  const aiTrigger = isAiTrigger(draft);
  const remembered = chat?.inline_ai_models || [];
  useEffect(() => {
    if (!aiTrigger) {
      setInlineOpen(false);
      setInlineDismissed(false);
    } else if (aiModels.length === 0 && remembered.length === 0 && !inlineDismissed) {
      // Only auto-open when there is no explicit pick and nothing remembered.
      setInlineOpen(true);
    }
  }, [aiTrigger, aiModels.length, remembered.length, inlineDismissed]);
  // What the pill shows: an explicit pick (this compose) wins; otherwise, when
  // composing an @ai message in a chat with a remembered model, surface that.
  const pillModels = aiModels.length
    ? aiModels
    : aiTrigger && remembered.length
      ? remembered
      : [];
  const pillIsRemembered = aiModels.length === 0 && remembered.length > 0;
  const modelNames = pillModels
    .map((k) => ALL_MODELS.find((m) => m.key === k)?.name || k)
    .join(", ");
  return (
    <div className="border-t border-hairline px-3 md:px-6 py-3 bg-bg pb-[calc(env(safe-area-inset-bottom)+12px)]">
      {showAI && (
        <AIComposer
          chatId={chat.id}
          defaultModels={chat.default_models}
          initialText={draft}
          imageAttachments={attachments.filter((a) => a.is_image)}
          onSubmit={onAIResearch}
          onCancel={onCancelAI}
          comparisonAllowed={comparisonAllowed}
        />
      )}
      {!showAI && (
        <>
          {replyTo && (
            <div
              className="mb-2 flex items-center gap-2 border-l-2 border-brand pl-2.5 pr-1.5 py-1.5 bg-surface-2 rounded-r-xl"
              data-testid="reply-preview"
            >
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-semibold text-brand">
                  Replying to {replyTo.name || "message"}
                </div>
                <div className="text-[12px] text-ink-dim truncate" data-testid="reply-preview-body">
                  {replyTo.body || "…"}
                </div>
              </div>
              <button
                type="button"
                data-testid="cancel-reply-btn"
                onClick={onCancelReply}
                className="w-7 h-7 rounded-full text-ink-mute hover:text-ink hover:bg-white/5 flex items-center justify-center shrink-0"
                aria-label="Cancel reply"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
          {aiSession?.active && (
            <div className="mb-2" data-testid="ai-conversation-indicator">
              <div
                className={`flex items-center justify-between gap-2 border rounded-full pl-3 pr-1.5 py-1 ${
                  nextToTeam ? "border-hairline bg-surface-2" : "border-ai/30 bg-ai/5"
                }`}
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  {nextToTeam ? (
                    <>
                      <Users className="w-3.5 h-3.5 text-ink-mute shrink-0" />
                      <span className="text-[12px] text-ink truncate" data-testid="recipient-label">
                        Next message goes to <span className="font-semibold">your team</span>
                      </span>
                    </>
                  ) : (
                    <>
                      <CornerDownRight className="w-3.5 h-3.5 text-ai shrink-0" />
                      <span className="text-[12px] text-ink truncate" data-testid="recipient-label">
                        Continuing with{" "}
                        <span className="text-ai font-semibold">{aiSession.assistant_label || "@ai"}</span>
                      </span>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {nextToTeam ? (
                    <button
                      type="button"
                      data-testid="target-continue-ai"
                      onClick={() => onToggleTarget?.(false)}
                      className="text-[10px] font-mono uppercase tracking-widest text-ai hover:text-ai border border-ai/30 hover:bg-ai/10 px-2 h-6 rounded-full inline-flex items-center gap-1"
                    >
                      <Sparkles className="w-3 h-3" /> Continue with AI
                    </button>
                  ) : (
                    <button
                      type="button"
                      data-testid="target-send-team"
                      onClick={() => onToggleTarget?.(true)}
                      className="text-[10px] font-mono uppercase tracking-widest text-ink-mute hover:text-ink border border-hairline hover:bg-surface-2 px-2 h-6 rounded-full inline-flex items-center gap-1"
                    >
                      <Users className="w-3 h-3" /> Send to team
                    </button>
                  )}
                  {aiSession.context_summary && (
                    <button
                      type="button"
                      data-testid="ai-memory-toggle"
                      onClick={() => setShowMemory((v) => !v)}
                      className="text-[10px] font-mono uppercase tracking-widest text-ink-mute hover:text-ai border border-hairline hover:bg-ai/10 px-2 h-6 rounded-full inline-flex items-center gap-1"
                    >
                      <Brain className="w-3 h-3" /> Memory
                    </button>
                  )}
                  <button
                    type="button"
                    data-testid="ai-conversation-exit"
                    onClick={onExitAi}
                    className="text-[10px] font-mono uppercase tracking-widest text-ink-mute hover:text-ink border border-hairline hover:bg-surface-2 px-2 h-6 rounded-full inline-flex items-center gap-1"
                  >
                    <X className="w-3 h-3" /> Exit AI
                  </button>
                </div>
              </div>
              {showMemory && aiSession.context_summary && (
                <div className="mt-1.5 rounded-xl border border-hairline bg-surface-2 p-3" data-testid="ai-memory-panel">
                  <p className="text-[10px] font-mono uppercase tracking-widest text-ink-mute mb-1.5 flex items-center gap-1">
                    <Brain className="w-3 h-3 text-ai" /> Conversation memory
                  </p>
                  <pre className="text-[11px] text-ink whitespace-pre-wrap font-sans leading-relaxed">{aiSession.context_summary}</pre>
                </div>
              )}
            </div>
          )}
          {!aiSession?.active && !aiTrigger && pillModels.length === 0 && (
            <div className="mb-2 flex items-center gap-2" data-testid="composer-destination">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 border border-hairline pl-2.5 pr-1 py-1">
                <Users className="w-3.5 h-3.5 text-ink-mute" />
                <span className="text-[12px] text-ink-dim">
                  To: <span className="text-ink font-semibold">Everyone</span>
                </span>
                <span className="text-[11px] text-ink-mute hidden sm:inline">· human chat</span>
                <button
                  type="button"
                  data-testid="composer-switch-ai"
                  onClick={() => onDraftChange(draft ? `@ai ${draft}` : "@ai ")}
                  className="ml-1 h-6 px-2 rounded-full text-[11px] font-semibold text-ai hover:bg-ai/10 inline-flex items-center gap-1"
                  title="Send to AI instead"
                >
                  <Sparkles className="w-3 h-3" /> Ask AI
                </button>
              </span>
            </div>
          )}
          {pillModels.length > 0 && (
            <div
              className="mb-2 flex items-center gap-2 border border-ai/30 bg-ai/5 rounded-full pl-3 pr-1.5 py-1"
              data-testid="ai-model-pill"
            >
              <Sparkles className="w-3.5 h-3.5 text-ai shrink-0" />
              <span className="text-[12px] text-ink truncate flex-1">
                {pillIsRemembered ? "Using " : "Ask AI with "}
                <span className="text-ai font-semibold">{modelNames}</span>
                {(rememberModels || pillIsRemembered) && (
                  <span className="text-ink-mute"> · remembered</span>
                )}
              </span>
              <button
                type="button"
                data-testid="ai-model-edit"
                onClick={() => setInlineOpen(true)}
                className="w-7 h-7 rounded-full text-ink-mute hover:text-ai hover:bg-white/5 flex items-center justify-center shrink-0"
                aria-label="Change AI model"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
              {!pillIsRemembered && (
                <button
                  type="button"
                  data-testid="ai-model-clear"
                  onClick={() => {
                    onAiModelsChange?.([]);
                    setInlineDismissed(true);
                  }}
                  className="w-7 h-7 rounded-full text-ink-mute hover:text-ink hover:bg-white/5 flex items-center justify-center shrink-0"
                  aria-label="Clear AI model"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}
          {attachments.length > 0 && (
            <div
              className="flex flex-wrap gap-2 mb-2"
              data-testid="attachment-chips"
            >
              {attachments.map((a, i) => (
                <div
                  key={a.id || `${a.filename}-${i}`}
                  className="flex items-center gap-1.5 bg-surface-2 px-2.5 h-7 rounded-full text-[11px]"
                >
                  {a.is_image ? (
                    <ImageIcon className="w-3 h-3 text-brand" />
                  ) : (
                    <Paperclip className="w-3 h-3 text-brand" />
                  )}
                  <span className="truncate max-w-[180px]">{a.filename}</span>
                  <button
                    type="button"
                    onClick={() => onRemoveAttachment(i)}
                    className="text-ink-mute hover:text-tn-red"
                    aria-label="Remove attachment"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
          {/* One-tap document actions — appear only when files are attached */}
          {attachments.length > 0 && onQuickAction && (
            <div className="flex flex-wrap gap-2 mb-2" data-testid="file-quick-actions">
              <button
                type="button"
                data-testid="quick-action-summarize"
                onClick={() => onQuickAction("@ai Summarize the attached file(s) in a few clear bullet points.")}
                className="h-7 px-3 rounded-full bg-ai-tint text-ai hover:bg-ai/30 inline-flex items-center gap-1.5 text-[12px] font-medium active:scale-95"
              >
                <Sparkles className="w-3.5 h-3.5" />
                Summarize
              </button>
              <button
                type="button"
                data-testid="quick-action-action-items"
                onClick={() => onQuickAction("@ai Extract the action items, owners and key decisions from the attached file(s) as a checklist.")}
                className="h-7 px-3 rounded-full bg-ai-tint text-ai hover:bg-ai/30 inline-flex items-center gap-1.5 text-[12px] font-medium active:scale-95"
              >
                <Wand2 className="w-3.5 h-3.5" />
                Extract action items
              </button>
            </div>
          )}
          {/* Toolbar */}
          <div className="flex items-center gap-1 mb-2 flex-wrap">
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={onFileChange}
              data-testid="file-input"
            />
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={onFileChange}
              data-testid="camera-input"
            />
            <button
              data-testid="attach-btn"
              type="button"
              onClick={onPickFile}
              disabled={uploading}
              className="h-8 w-8 rounded-full bg-surface-2 hover:bg-surface-3 text-ink-dim hover:text-ink flex items-center justify-center active:scale-95"
              title="Attach"
              aria-label="Attach"
            >
              <Paperclip className="w-4 h-4" />
            </button>
            <button
              data-testid="camera-btn"
              type="button"
              onClick={onPickCamera}
              disabled={uploading}
              className="h-8 w-8 rounded-full bg-surface-2 hover:bg-surface-3 text-ink-dim hover:text-ink flex items-center justify-center active:scale-95"
              title="Take photo"
              aria-label="Take photo"
            >
              <Camera className="w-4 h-4" />
            </button>
            <VoiceRecorder chatId={chatId} onSent={onRefreshMessages} />
            <button
              data-testid="ask-ai-before-posting"
              type="button"
              onClick={onOpenImprove}
              disabled={!draft.trim()}
              className="h-8 px-3 rounded-full bg-ai-tint text-ai hover:bg-ai/30 disabled:opacity-40 inline-flex items-center gap-1.5 text-[12px] font-medium"
              title="Improve with AI"
            >
              <Wand2 className="w-3.5 h-3.5" />
              Improve
            </button>
            <button
              data-testid="open-ai-composer"
              type="button"
              onClick={onOpenAI}
              className="h-8 px-3 rounded-full bg-ai text-black hover:opacity-90 inline-flex items-center gap-1.5 text-[12px] font-semibold"
            >
              <Sparkles className="w-3.5 h-3.5" />
              {hasImageAttachment ? "Ask AI about photo" : "Ask AI"}
            </button>
            {uploading && (
              <span className="text-[11px] text-brand ml-1">Uploading…</span>
            )}
          </div>
          <div className="flex items-end gap-2 relative">
            {inlineOpen && (
              <div
                className="absolute bottom-full left-0 mb-2 z-30"
                data-testid="ai-model-inline-popover"
              >
                <AiModelPicker
                  initialSelected={pillModels}
                  initialRemember={rememberModels}
                  onConfirm={(models, remember) => {
                    onAiModelsChange?.(models);
                    onRememberChange?.(remember);
                    setInlineOpen(false);
                    setInlineDismissed(true);
                  }}
                  onCancel={() => {
                    setInlineOpen(false);
                    setInlineDismissed(true);
                  }}
                />
              </div>
            )}
            <MentionPopover
              draft={draft}
              caret={caret}
              members={chat?.members || []}
              chatKind={chat?.kind}
              onPick={(newText, newCaret) => {
                onDraftChange(newText);
                // restore caret after React updates the textarea value.
                requestAnimationFrame(() => {
                  const el = textareaRef.current;
                  if (el) {
                    el.focus();
                    try {
                      el.setSelectionRange(newCaret, newCaret);
                    } catch {
                      /* ignore on browsers that don't support */
                    }
                    setCaret(newCaret);
                  }
                });
              }}
              onClose={() => setCaret(-1)}
            />
            <SlashCommandPopover
              draft={draft}
              caret={caret}
              onPick={(newText, newCaret) => {
                onDraftChange(newText);
                requestAnimationFrame(() => {
                  const el = textareaRef.current;
                  if (el) {
                    el.focus();
                    try {
                      el.setSelectionRange(newCaret, newCaret);
                    } catch {
                      /* ignore */
                    }
                    setCaret(newCaret);
                  }
                });
              }}
              onClose={() => setCaret(-1)}
            />
            <Textarea
              ref={textareaRef}
              data-testid="message-input"
              value={draft}
              onChange={(e) => {
                onDraftChange(e.target.value);
                setCaret(e.target.selectionStart);
              }}
              onSelect={(e) => setCaret(e.target.selectionStart)}
              onKeyDown={(e) => {
                // Let the mention/slash popovers intercept arrows/enter when active.
                const mention = detectMention(draft, caret);
                const slash = detectSlash(draft, caret);
                if (mention.active || slash.active) {
                  if (["ArrowUp", "ArrowDown", "Enter", "Tab", "Escape"].includes(e.key)) {
                    return;
                  }
                }
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  onSend();
                }
                onSendTyping?.();
              }}
              placeholder={
                aiSession?.active
                  ? nextToTeam
                    ? `Message your team…`
                    : "Ask a follow-up… (or tap Send to team to message the team)"
                  : `Message ${chat.name || "team"} — type @ for AI · @dev for engineers · / for Dev OS`}
              className="bg-surface-2 border-hairline rounded-2xl min-h-[44px] max-h-[160px] resize-none text-[14px] px-4 py-2.5"
              rows={1}
            />
            <Button
              data-testid="send-message-btn"
              onClick={onSend}
              disabled={!draft.trim() && attachments.length === 0}
              className="h-11 w-11 p-0 bg-brand text-black hover:bg-brand-deep rounded-full shrink-0 disabled:opacity-50"
              aria-label="Send"
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
