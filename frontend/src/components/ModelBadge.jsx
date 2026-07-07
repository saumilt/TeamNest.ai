import { useState } from "react";
import { Sparkles } from "lucide-react";

/** Inline pill showing which AI model answered + how many credits it cost.
 * Hover/tap reveals a tooltip with the breakdown when multiple models were used.
 */
export function ModelBadge({ modelKey, modelName, credits, modelCount }) {
  const [open, setOpen] = useState(false);
  const isFast = ["gpt-4o-mini", "claude-haiku", "gemini-flash"].includes(modelKey);
  return (
    <span
      data-testid="ai-model-badge"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onClick={() => setOpen((v) => !v)}
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm border text-[9px] cursor-help relative ${
        isFast
          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
          : "border-yellow-400/30 bg-yellow-500/10 text-yellow-200"
      }`}
    >
      <Sparkles className="w-2.5 h-2.5" />
      <span className="normal-case tracking-normal">{modelName || modelKey || "AI"}</span>
      {typeof credits === "number" && credits > 0 && (
        <span className="text-zinc-400 normal-case">· {credits} cr</span>
      )}
      {modelCount && modelCount > 1 && (
        <span className="text-zinc-400 normal-case">· {modelCount} models</span>
      )}
      {open && (
        <span
          data-testid="ai-model-tooltip"
          className="absolute bottom-full left-0 mb-1 z-20 whitespace-nowrap bg-[#0a0a0a] border border-white/10 rounded-sm px-2 py-1.5 text-[10px] text-zinc-300 normal-case tracking-normal shadow-xl"
        >
          {isFast ? "Fast model — minimal credits" : "Premium model — deeper reasoning"}
          {typeof credits === "number" && <><br />Cost: {credits} credits</>}
        </span>
      )}
    </span>
  );
}
