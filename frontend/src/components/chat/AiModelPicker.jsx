import { useState } from "react";
import { Check, Zap, Sparkles } from "lucide-react";
import { ALL_MODELS } from "@/components/ai_composer/constants";
import ModelPresetBar from "@/components/ai_composer/ModelPresetBar";

const RECOMMENDED_KEY =
  ALL_MODELS.find((m) => m.recommended)?.key || ALL_MODELS[0].key;

/**
 * AiModelPicker — lets the user choose which AI model(s) should answer their
 * `@ai` message, with a "Remember for this chat" toggle. Used both inline
 * (popover as you type `@ai`) and inside the on-send dialog. Manages its own
 * draft selection and hands the final choice back via onConfirm(models[], remember).
 *
 * `bare` drops the card chrome so it can sit inside a Dialog surface.
 */
export default function AiModelPicker({
  initialSelected = [],
  initialRemember = true,
  onConfirm,
  onCancel,
  bare = false,
}) {
  const [sel, setSel] = useState(
    () => new Set(initialSelected.length ? initialSelected : [RECOMMENDED_KEY]),
  );
  const [remember, setRemember] = useState(initialRemember);
  const [hoverKey, setHoverKey] = useState(null);

  const toggle = (key) =>
    setSel((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        if (next.size > 1) next.delete(key); // keep at least one selected
      } else {
        next.add(key);
      }
      return next;
    });

  return (
    <div
      data-testid="ai-model-picker"
      className={
        bare
          ? "w-full"
          : "rounded-2xl border border-ai/30 bg-bg shadow-xl p-3 w-[300px]"
      }
    >
      <div className="flex items-center gap-1.5 mb-2">
        <Sparkles className="w-3.5 h-3.5 text-ai" />
        <span className="text-[13px] font-semibold text-ink">Ask AI with…</span>
        <span className="ml-auto text-[10px] text-ink-mute" data-testid="ai-model-count">
          {sel.size} selected
        </span>
      </div>
      <ModelPresetBar
        selected={[...sel]}
        onApply={(models) =>
          setSel(new Set(models && models.length ? models : [RECOMMENDED_KEY]))
        }
      />
      <div className="flex flex-wrap gap-1.5 mb-2">
        {ALL_MODELS.map((m) => {
          const on = sel.has(m.key);
          return (
            <button
              key={m.key}
              type="button"
              data-testid={`ai-model-option-${m.key}`}
              aria-pressed={on}
              title={m.hint}
              onMouseEnter={() => setHoverKey(m.key)}
              onMouseLeave={() => setHoverKey(null)}
              onClick={() => toggle(m.key)}
              className={`px-2.5 h-8 rounded-full border text-[12px] inline-flex items-center gap-1.5 transition-colors ${
                on
                  ? "bg-ai text-black border-ai"
                  : "border-hairline text-ink-dim hover:text-ink hover:border-ai/40"
              }`}
            >
              {m.fast && <Zap className={`w-3 h-3 ${on ? "text-black" : "text-ai"}`} />}
              {m.name}
              {on && <Check className="w-3 h-3" />}
              {m.recommended && (
                <span
                  data-testid={`ai-model-recommended-badge-${m.key}`}
                  title="Recommended"
                  className={`ml-0.5 text-[8px] font-mono uppercase tracking-wider px-1 py-0.5 rounded ${
                    on ? "bg-black/20 text-black" : "bg-ai/15 text-ai"
                  }`}
                >
                  Rec
                </span>
              )}
            </button>
          );
        })}
      </div>
      {(() => {
        const h =
          ALL_MODELS.find((x) => x.key === hoverKey) ||
          ALL_MODELS.find((x) => x.recommended) ||
          ALL_MODELS[0];
        return h?.hint ? (
          <div
            data-testid="ai-model-hint"
            className="text-[11px] text-ink-mute mb-1.5 min-h-[15px] leading-tight"
          >
            <span className="text-ink-dim font-medium">{h.name}</span> — {h.hint}
          </div>
        ) : null;
      })()}
      <label
        data-testid="ai-model-remember-toggle"
        className="flex items-center gap-2 py-1.5 cursor-pointer select-none"
      >
        <input
          type="checkbox"
          data-testid="ai-model-remember-checkbox"
          checked={remember}
          onChange={(e) => setRemember(e.target.checked)}
          className="accent-ai w-3.5 h-3.5"
        />
        <span className="text-[12px] text-ink-dim">Remember for this chat</span>
      </label>
      <div className="flex items-center justify-end gap-2 mt-1">
        <button
          type="button"
          data-testid="ai-model-cancel"
          onClick={onCancel}
          className="h-8 px-3 rounded-full text-[12px] text-ink-mute hover:text-ink hover:bg-surface-2"
        >
          Cancel
        </button>
        <button
          type="button"
          data-testid="ai-model-confirm"
          onClick={() => onConfirm?.([...sel], remember)}
          disabled={sel.size === 0}
          className="h-8 px-4 rounded-full text-[12px] font-semibold bg-ai text-black hover:opacity-90 disabled:opacity-40 inline-flex items-center gap-1.5"
        >
          <Sparkles className="w-3.5 h-3.5" /> Ask AI
        </button>
      </div>
    </div>
  );
}
