import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Send,
  Sparkles,
  Wand2,
  Paperclip,
  X,
  Camera,
  Image as ImageIcon,
} from "lucide-react";
import AIComposer from "@/components/AIComposer";
import VoiceRecorder from "@/components/VoiceRecorder";
import MentionPopover, { detectMention } from "@/components/chat/MentionPopover";
import SlashCommandPopover, { detectSlash } from "@/components/chat/SlashCommandPopover";

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
}) {
  const hasImageAttachment = attachments.some((a) => a.is_image);
  const textareaRef = useRef(null);
  const [caret, setCaret] = useState(-1);
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
              placeholder={`Message ${chat.name || "team"} — type @ for AI · @dev for engineers · / for Dev OS`}
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
