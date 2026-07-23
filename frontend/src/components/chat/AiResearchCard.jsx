import { Sparkles, ChevronRight } from "lucide-react";

/**
 * AiResearchCard — compact reference to an AI discussion, shown in the Human
 * view (in place of a long AI answer) so research stays linked without pushing
 * the human conversation down. Tapping opens the full discussion.
 */
export default function AiResearchCard({ discussion, onOpen }) {
  const d = discussion || {};
  const q = d.question_count || 1;
  return (
    <div className="flex justify-start my-1.5">
      <button
        type="button"
        data-testid={`ai-research-card-${d.id}`}
        onClick={() => onOpen?.(d.id)}
        className="group w-full max-w-[440px] text-left flex items-center gap-2.5 rounded-xl border border-ai/25 bg-ai/[0.05] hover:bg-ai/10 px-3 py-2 transition-colors active:scale-[0.99]"
      >
        <span className="w-7 h-7 rounded-lg bg-ai/15 text-ai flex items-center justify-center shrink-0">
          <Sparkles className="w-4 h-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-semibold text-ink truncate">
            {d.title || "AI research"}
          </span>
          <span className="block text-[11px] text-ink-dim truncate">
            AI research · {d.creator_name || "AI"} · {q} question{q === 1 ? "" : "s"}
            {d.credits_used ? ` · ${d.credits_used} cr` : ""}
          </span>
        </span>
        <ChevronRight className="w-4 h-4 text-ink-mute group-hover:text-ai shrink-0" />
      </button>
    </div>
  );
}
