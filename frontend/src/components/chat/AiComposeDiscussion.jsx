import { useState } from "react";
import { Sparkles } from "lucide-react";
import AiModelPicker from "@/components/chat/AiModelPicker";
import { ALL_MODELS } from "@/components/ai_composer/constants";

/**
 * AiComposeDiscussion — the right-panel form shown when a user clicks "Ask AI"
 * on a specific human message. Seeds that message as context and lets the user
 * type the question that starts a NEW discussion linked to that message.
 */
export default function AiComposeDiscussion({
  contextMessage,
  senderName,
  defaultModels = [],
  onSubmit,
  onCancel,
  submitting = false,
}) {
  const [q, setQ] = useState("");
  const [models, setModels] = useState(defaultModels.length ? defaultModels : ["chatgpt"]);
  const [showPicker, setShowPicker] = useState(false);
  const names = models.map((k) => ALL_MODELS.find((m) => m.key === k)?.name || k).join(", ");

  return (
    <div className="flex flex-col h-full" data-testid="ai-compose-discussion">
      <div className="p-4 space-y-3 flex-1 overflow-y-auto">
        <div className="text-[11px] uppercase tracking-wider text-ink-mute">
          Research started from
        </div>
        <div className="border-l-2 border-ai/40 pl-3 py-1">
          <div className="text-[12px] font-semibold text-ink-dim">{senderName || "Message"}</div>
          <div className="text-[13px] text-ink line-clamp-4 whitespace-pre-wrap">
            {contextMessage?.body || "…"}
          </div>
        </div>
        <textarea
          data-testid="ai-compose-input"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="What do you want to ask AI about this?"
          rows={4}
          className="w-full rounded-xl bg-surface-2 border border-hairline p-3 text-[14px] text-ink placeholder:text-ink-mute focus:outline-none focus:border-ai/40 resize-none"
        />
        <div className="relative">
          <button
            type="button"
            data-testid="ai-compose-models"
            onClick={() => setShowPicker((v) => !v)}
            className="inline-flex items-center gap-1.5 text-[12px] text-ink-dim hover:text-ink"
          >
            <Sparkles className="w-3.5 h-3.5 text-ai" /> Models:{" "}
            <span className="text-ai font-semibold">{names}</span>
          </button>
          {showPicker && (
            <div className="absolute z-20 mt-1">
              <AiModelPicker
                initialSelected={models}
                initialRemember={false}
                onConfirm={(m) => {
                  setModels(m);
                  setShowPicker(false);
                }}
                onCancel={() => setShowPicker(false)}
              />
            </div>
          )}
        </div>
      </div>
      <div className="p-3 border-t border-hairline flex items-center justify-end gap-2 shrink-0">
        <button
          type="button"
          data-testid="ai-compose-cancel"
          onClick={onCancel}
          className="h-9 px-3 rounded-full text-[13px] text-ink-mute hover:text-ink"
        >
          Cancel
        </button>
        <button
          type="button"
          data-testid="ai-compose-submit"
          disabled={!q.trim() || submitting}
          onClick={() => onSubmit?.(q.trim(), models)}
          className="h-9 px-4 rounded-full bg-ai text-black font-semibold text-[13px] disabled:opacity-40 inline-flex items-center gap-1.5"
        >
          <Sparkles className="w-4 h-4" /> {submitting ? "Asking…" : "Ask AI"}
        </button>
      </div>
    </div>
  );
}
