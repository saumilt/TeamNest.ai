import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Sparkles, RefreshCcw, Loader2, Wand2, ListChecks } from "lucide-react";

/** Lightweight markdown rendering — headings + bullets + bold + br. Safe JSX only.
 *  Pure JSX — no dangerouslySetInnerHTML, eliminates XSS surface. */
function renderInline(text) {
  if (!text) return null;
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) => {
    if (p.startsWith("**") && p.endsWith("**") && p.length > 4) {
      return <strong key={`b-${i}`} className="text-zinc-100">{p.slice(2, -2)}</strong>;
    }
    const lines = p.split("\n");
    return lines.flatMap((line, j) =>
      j === 0
        ? [<span key={`t-${i}-${j}`}>{line}</span>]
        : [<br key={`br-${i}-${j}`} />, <span key={`t-${i}-${j}`}>{line}</span>],
    );
  });
}

function renderMarkdownLite(text) {
  if (!text) return null;
  const blocks = text.split(/\n\n+/);
  return blocks.map((b, idx) => {
    const trimmed = b.trim();
    const blockKey = `mk-${idx}-${trimmed.slice(0, 24)}`;
    if (trimmed.startsWith("## ")) {
      return (
        <h3 key={blockKey} className="font-display text-lg font-bold tracking-tight text-yellow-300 mt-4 mb-2 first:mt-0">
          {trimmed.slice(3)}
        </h3>
      );
    }
    if (trimmed.startsWith("### ")) {
      return (
        <h4 key={blockKey} className="font-display text-base font-bold tracking-tight mt-3 mb-1">
          {trimmed.slice(4)}
        </h4>
      );
    }
    if (trimmed.startsWith("- ") || /^\d+\./.test(trimmed)) {
      const items = trimmed.split("\n").map((line) => line.replace(/^[-•\d.\s]+/, "").trim()).filter(Boolean);
      return (
        <ul key={blockKey} className="list-disc pl-5 space-y-1 text-sm text-zinc-300 mb-3">
          {items.map((item, j) => (
            <li key={`${blockKey}-li-${j}-${item.slice(0, 24)}`}>{renderInline(item)}</li>
          ))}
        </ul>
      );
    }
    return (
      <p key={blockKey} className="text-sm text-zinc-300 mb-2 leading-relaxed">
        {renderInline(trimmed)}
      </p>
    );
  });
}

/** Empty-state card prompting AI summary generation. */
function EmptySummaryCard({ hasTranscript, busy, onGenerate }) {
  return (
    <div className="border border-yellow-500/30 bg-yellow-500/[0.03] rounded-sm p-6 text-center" data-testid="mtg-empty-summary">
      <Wand2 className="w-6 h-6 text-yellow-400 mx-auto mb-3" />
      <div className="font-display text-base mb-2">No summary yet</div>
      <p className="text-xs text-zinc-400 mb-4">
        Generate an AI meeting summary from the {hasTranscript ? "transcript" : "chat context around this call"}.
      </p>
      <Button
        data-testid="mtg-generate"
        onClick={onGenerate}
        disabled={busy === "gen"}
        className="bg-yellow-500 text-black hover:bg-yellow-400 rounded-sm font-mono uppercase text-[10px] tracking-widest h-9"
      >
        {busy === "gen" ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Sparkles className="w-4 h-4 mr-1.5" />}
        {busy === "gen" ? "Generating…" : "Generate AI summary"}
      </Button>
    </div>
  );
}

/** Markdown editor for the summary. */
function SummaryEditor({ value, onChange, busy, onSave, onCancel }) {
  return (
    <>
      <Textarea
        data-testid="mtg-summary-edit"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={18}
        className="bg-[#121214] border-white/10 rounded-sm font-mono text-xs"
      />
      <div className="flex gap-2 mt-2">
        <Button
          data-testid="mtg-summary-save"
          onClick={onSave}
          disabled={busy === "save-summary"}
          size="sm"
          className="bg-white text-black hover:bg-zinc-200 rounded-sm font-mono uppercase text-[10px] tracking-widest h-8"
        >
          {busy === "save-summary" ? "…" : "Save"}
        </Button>
        <Button
          onClick={onCancel}
          variant="outline"
          size="sm"
          className="border-white/10 bg-transparent hover:bg-white/5 rounded-sm font-mono uppercase text-[10px] tracking-widest h-8"
        >
          Cancel
        </Button>
      </div>
    </>
  );
}

/** Action toolbar shown below a rendered summary. */
function SummaryActions({ busy, onRegen, onEdit, onCreateTasks }) {
  return (
    <div className="flex flex-wrap gap-2 mt-3">
      <Button
        data-testid="mtg-regen"
        onClick={onRegen}
        disabled={busy === "regen"}
        variant="outline"
        size="sm"
        className="border-yellow-500/30 text-yellow-300 hover:bg-yellow-500/10 rounded-sm font-mono uppercase text-[10px] tracking-widest h-8"
      >
        {busy === "regen" ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <RefreshCcw className="w-3.5 h-3.5 mr-1" />}
        Regenerate
      </Button>
      <Button
        data-testid="mtg-summary-edit-btn"
        onClick={onEdit}
        variant="outline"
        size="sm"
        className="border-white/10 bg-transparent hover:bg-white/5 rounded-sm font-mono uppercase text-[10px] tracking-widest h-8"
      >
        Edit
      </Button>
      <Button
        data-testid="mtg-create-tasks"
        onClick={onCreateTasks}
        variant="outline"
        size="sm"
        className="border-yellow-500/30 text-yellow-300 hover:bg-yellow-500/10 rounded-sm font-mono uppercase text-[10px] tracking-widest h-8"
      >
        <ListChecks className="w-3.5 h-3.5 mr-1" />
        Create tasks
      </Button>
    </div>
  );
}

/** Summary tab — either empty, editor, or rendered markdown with actions. */
export default function MeetingSummaryTab({
  summaryMd,
  hasTranscript,
  editing,
  draft,
  setDraft,
  busy,
  onGenerate,
  onRegenerate,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onCreateTasks,
}) {
  const hasSummary = !!summaryMd;

  if (!hasSummary) {
    return <EmptySummaryCard hasTranscript={hasTranscript} busy={busy} onGenerate={onGenerate} />;
  }
  if (editing) {
    return <SummaryEditor value={draft} onChange={setDraft} busy={busy} onSave={onSaveEdit} onCancel={onCancelEdit} />;
  }
  return (
    <>
      <div className="border border-white/10 bg-[#121214] rounded-sm p-4" data-testid="mtg-summary-view">
        {renderMarkdownLite(summaryMd)}
      </div>
      <SummaryActions busy={busy} onRegen={onRegenerate} onEdit={onStartEdit} onCreateTasks={onCreateTasks} />
    </>
  );
}
