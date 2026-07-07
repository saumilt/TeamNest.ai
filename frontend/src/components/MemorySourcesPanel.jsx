import { useState } from "react";
import { api } from "@/lib/api";
import { Brain, ChevronDown, ChevronUp, CheckCircle2, Phone, Mic, Sparkles, Lightbulb, FileText } from "lucide-react";

const ICONS = {
  ai_thread: Sparkles,
  ai_response: Sparkles,
  approval: CheckCircle2,
  call_summary: Phone,
  voice_note: Mic,
  message: FileText,
  card: Lightbulb,
};

/**
 * Inline expandable panel under an AI answer bubble showing which memory items
 * were used to ground the answer (RAG sources).
 *
 * Lazy-loads on first expand to keep chat-render light.
 */
export default function MemorySourcesPanel({ threadId, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  const [sources, setSources] = useState(null);
  const [loading, setLoading] = useState(false);

  if (!threadId) return null;

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next && sources === null) {
      setLoading(true);
      try {
        const { data } = await api.get(`/ai/threads/${threadId}/memory-sources`);
        setSources(data.sources || []);
      } catch (e) {
        console.warn("[memory-sources] fetch failed", e);
        setSources([]);
      } finally {
        setLoading(false);
      }
    }
  };

  const count = sources?.length ?? null;
  // Don't render if we already loaded and there are zero sources
  if (sources !== null && sources.length === 0) return null;

  return (
    <div className="mt-2 border-t border-white/5 pt-2" data-testid={`memory-sources-${threadId}`}>
      <button
        onClick={toggle}
        data-testid={`memory-sources-toggle-${threadId}`}
        className="text-[11px] font-mono uppercase tracking-widest text-purple-300/80 hover:text-purple-200 flex items-center gap-1.5 transition-colors"
      >
        <Brain className="w-3 h-3" />
        {count !== null ? `Memory used · ${count}` : "Show memory used"}
        {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </button>
      {open && (
        <div className="mt-2 space-y-1.5">
          {loading && <div className="text-[11px] text-zinc-500">Loading…</div>}
          {sources?.map((s, i) => {
            const Icon = ICONS[s.source_type] || Lightbulb;
            const date = (s.created_at || "").slice(0, 10);
            return (
              <div
                key={s.id}
                data-testid={`memory-source-${s.id}`}
                className="text-[11px] text-zinc-300 px-2 py-1.5 rounded-sm bg-white/[0.03] border border-white/5 flex items-start gap-1.5"
              >
                <span className="text-zinc-500 font-mono shrink-0">[{i + 1}]</span>
                <Icon className="w-3 h-3 mt-0.5 text-purple-300/80 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-white truncate">{s.title}</div>
                  <div className="text-zinc-400 truncate">{s.summary?.slice(0, 200)}</div>
                  <div className="text-[10px] text-zinc-500 mt-0.5 font-mono uppercase tracking-widest">
                    {s.source_type.replace("_", " ")} · {date}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
