import { useEffect, useState } from "react";
import { Loader2, Undo2, X } from "lucide-react";
import { api } from "@/lib/api";

/** DiffViewer — modal unified diff between a snapshot and the current file. */
export default function DiffViewer({ projectId, fileId, snapshot, onRevert, onClose }) {
  const [diff, setDiff] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api.get(`/dev-projects/${projectId}/files/${fileId}/diff/${snapshot.id}`)
      .then(({ data }) => { if (!cancelled) setDiff(data); })
      .catch(() => { if (!cancelled) setDiff({ error: true }); });
    return () => { cancelled = true; };
  }, [projectId, fileId, snapshot.id]);

  const lineCls = {
    add: "bg-emerald-400/10 text-emerald-300",
    del: "bg-red-400/10 text-red-300",
    hunk: "text-amber-300/80 bg-amber-400/5",
    ctx: "text-ink-mute",
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-6"
      onClick={onClose}
      data-testid="diff-viewer-overlay"
    >
      <div
        className="w-full max-w-3xl max-h-[80vh] flex flex-col rounded-xl bg-surface ring-1 ring-hairline overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-2.5 border-b border-hairline flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-semibold text-ink truncate">
              Diff · {diff?.path || "…"}
            </div>
            <div className="text-[10.5px] text-ink-mute">
              snapshot {new Date(snapshot.created_at).toLocaleString()} → current
              {diff && !diff.error && (
                <>
                  {" "}·{" "}
                  <span className="text-emerald-400">+{diff.added}</span>{" "}
                  <span className="text-red-400">−{diff.removed}</span>
                </>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={() => onRevert(snapshot.id)}
            data-testid="diff-revert-btn"
            className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full bg-amber-300 hover:bg-amber-200 text-black text-[11px] font-semibold"
          >
            <Undo2 className="w-3 h-3" /> Revert to this version
          </button>
          <button type="button" onClick={onClose} data-testid="diff-close" className="text-ink-mute hover:text-ink p-1">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto font-mono text-[11.5px] leading-relaxed">
          {!diff && (
            <div className="p-6 text-ink-mute flex items-center gap-2 text-[12px]">
              <Loader2 className="w-4 h-4 animate-spin" /> Computing diff…
            </div>
          )}
          {diff?.error && <div className="p-6 text-red-300 text-[12px]">Could not compute diff.</div>}
          {diff?.lines?.length === 0 && (
            <div className="p-6 text-ink-mute text-[12px]">No differences — file is identical to this snapshot.</div>
          )}
          {(diff?.lines || []).map((l, i) => (
            <div key={i} className={`px-4 whitespace-pre-wrap break-all ${lineCls[l.t] || "text-ink-dim"}`}>
              {l.t === "add" ? "+ " : l.t === "del" ? "− " : "  "}{l.text}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
