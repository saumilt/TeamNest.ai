import { Star, CheckSquare, AlertTriangle, HelpCircle, ListChecks } from "lucide-react";

export const HL_STYLES = {
  decision: { icon: Star, color: "text-yellow-300", bg: "bg-yellow-500/[0.08]", border: "border-yellow-500/40", label: "DECISION" },
  action_item: { icon: CheckSquare, color: "text-green-300", bg: "bg-green-500/[0.08]", border: "border-green-500/40", label: "ACTION" },
  risk: { icon: AlertTriangle, color: "text-red-300", bg: "bg-red-500/[0.08]", border: "border-red-500/40", label: "RISK" },
  question: { icon: HelpCircle, color: "text-blue-300", bg: "bg-blue-500/[0.08]", border: "border-blue-500/40", label: "QUESTION" },
};

export function HlChip({ kind, count }) {
  const s = HL_STYLES[kind];
  if (!s) return null;
  return (
    <span
      data-testid={`hl-chip-${kind}`}
      className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-mono uppercase tracking-widest rounded-sm border ${s.bg} ${s.border} ${s.color}`}
    >
      <s.icon className="w-3 h-3" />
      {count} {s.label}{count === 1 ? "" : "S"}
    </span>
  );
}

/** Top yellow highlights chip bar — shows decision/action/risk/question counts. */
export default function MeetingHighlightsBar({
  highlights,
  segmentsCount,
  generating,
  onGenerate,
  onRegenerate,
}) {
  if (highlights.length === 0 && segmentsCount === 0) return null;
  const hlByKind = highlights.reduce((acc, h) => {
    acc[h.kind] = (acc[h.kind] || 0) + 1;
    return acc;
  }, {});

  return (
    <div
      className="border border-yellow-500/30 bg-yellow-500/[0.03] rounded-sm px-3 py-2 flex items-center gap-2 flex-wrap"
      data-testid="highlights-bar"
    >
      <span className="label-mono text-yellow-300 flex items-center gap-1.5">
        <Star className="w-3 h-3" /> AI HIGHLIGHTS
      </span>
      {highlights.length === 0 ? (
        <>
          <span className="text-[10px] font-mono text-zinc-500">
            {segmentsCount} transcript segment{segmentsCount === 1 ? "" : "s"} ·
          </span>
          <button
            data-testid="highlights-generate"
            onClick={onGenerate}
            disabled={generating}
            className="text-[10px] font-mono uppercase tracking-widest text-yellow-300 hover:text-yellow-200 border border-yellow-500/30 hover:bg-yellow-500/10 px-2 py-0.5 rounded-sm disabled:opacity-50"
          >
            {generating ? "Analyzing…" : "Find notable moments"}
          </button>
        </>
      ) : (
        <>
          {hlByKind.decision > 0 && <HlChip kind="decision" count={hlByKind.decision} />}
          {hlByKind.action_item > 0 && <HlChip kind="action_item" count={hlByKind.action_item} />}
          {hlByKind.risk > 0 && <HlChip kind="risk" count={hlByKind.risk} />}
          {hlByKind.question > 0 && <HlChip kind="question" count={hlByKind.question} />}
          <button
            data-testid="highlights-regen"
            onClick={onRegenerate}
            disabled={generating}
            title="Re-analyze the transcript"
            className="ml-auto text-[10px] font-mono uppercase tracking-widest text-zinc-400 hover:text-yellow-200 border border-white/10 hover:bg-white/5 px-2 py-0.5 rounded-sm disabled:opacity-50"
          >
            {generating ? "…" : "Re-analyze"}
          </button>
        </>
      )}
    </div>
  );
}

/** Annotated transcript view — each segment can be highlighted + create-task. */
export function AnnotatedTranscript({ segments, hlBySegment, onCreateTaskFromSegment }) {
  return (
    <div
      className="border border-white/10 bg-[#121214] rounded-sm p-3 max-h-[60vh] overflow-y-auto space-y-1.5"
      data-testid="mtg-transcript-annotated"
    >
      {segments.map((seg) => {
        const hl = hlBySegment[seg.id];
        const style = hl ? HL_STYLES[hl.kind] : null;
        const isActionItem = hl?.kind === "action_item";
        const wrapperCls = style
          ? `border-l-2 ${style.border} ${style.bg} pl-3 pr-2 py-2 rounded-r-sm`
          : "pl-3 pr-2 py-1";
        return (
          <div key={seg.id} data-testid={`transcript-row-${seg.id}`} className={wrapperCls}>
            {style && (
              <div className={`flex items-center gap-1.5 mb-1 ${style.color}`}>
                <style.icon className="w-3 h-3" />
                <span className="label-mono text-[9px]">{style.label}</span>
                {hl.note && <span className="text-[10px] text-zinc-300 normal-case">— {hl.note}</span>}
                {isActionItem && onCreateTaskFromSegment && (
                  <button
                    data-testid={`hl-create-task-${seg.id}`}
                    onClick={() => onCreateTaskFromSegment(seg)}
                    className="ml-auto inline-flex items-center gap-1 px-2 py-0.5 text-[9px] font-mono uppercase tracking-widest rounded-sm bg-green-500/20 hover:bg-green-500/30 border border-green-500/40 text-green-200 transition-colors"
                    title="Create task from this action item"
                  >
                    <ListChecks className="w-2.5 h-2.5" />
                    + Task
                  </button>
                )}
              </div>
            )}
            <div className="text-sm leading-snug">
              <span className="text-yellow-300 font-medium">{seg.speaker_name}</span>
              <span className="text-zinc-500 text-[9px] font-mono ml-1.5">
                {new Date(seg.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
              <div className="text-zinc-200">{seg.text}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
