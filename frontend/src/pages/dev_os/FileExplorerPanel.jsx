import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { FileCode, ExternalLink, GitCompare, Loader2, Save, History, Undo2 } from "lucide-react";
import DiffViewer from "@/pages/dev_os/DiffViewer";

/**
 * File explorer + inline editor for a Dev OS project.
 *
 * Sits below the 3-column build console. Left pane lists the AI-generated
 * file tree; clicking a file fetches its content and renders an editable
 * textarea on the right. Save pushes the new content to the backend, which
 * marks the file `human_edited` and the live preview picks it up on the
 * next request (no rebuild required for static files).
 *
 * Designed to be lightweight — no Monaco / CodeMirror to keep the bundle
 * slim. A monospace textarea is "good enough" for a static preview product.
 */
export default function FileExplorerPanel({ projectId, previewUrl, refreshKey = 0 }) {
  const [files, setFiles] = useState([]);
  const [selected, setSelected] = useState(null);
  const [content, setContent] = useState("");
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [snapshots, setSnapshots] = useState([]);
  const [diffSnap, setDiffSnap] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/dev-projects/${projectId}/files`);
      setFiles(data.files || []);
      // If we have an open file, re-fetch its latest content so a Talk-to-
      // Build edit shows up in the editor without a manual click.
      if (selected) {
        const fresh = (data.files || []).find((f) => f.id === selected.id);
        if (fresh) {
          const { data: full } = await api.get(`/dev-projects/${projectId}/files/${selected.id}`);
          setContent(full.content || "");
          setDirty(false);
          setSelected(fresh);
        }
      } else if ((data.files || []).length > 0) {
        // Auto-select the first file on initial load.
        await openFile(data.files[0]);
      }
    } catch { /* noop */ }
    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, refreshKey]);

  useEffect(() => { load(); }, [load]);

  const openFile = async (f) => {
    if (dirty && !window.confirm("Discard unsaved changes?")) return;
    setSelected(f);
    setBusy(true);
    try {
      const { data } = await api.get(`/dev-projects/${projectId}/files/${f.id}`);
      setContent(data.content || "");
      setDirty(false);
    } catch {
      toast.error("Could not load file");
    }
    setBusy(false);
  };

  const save = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      await api.put(
        `/dev-projects/${projectId}/files/${selected.id}`,
        { content },
      );
      setDirty(false);
      toast.success(`Saved ${selected.path}`);
      // Refresh the meta list so the size/edited badge stays accurate.
      await load();
    } catch {
      toast.error("Save failed");
    }
    setBusy(false);
  };

  const openHistory = async () => {
    if (!selected) return;
    setHistoryOpen(true);
    try {
      const { data } = await api.get(
        `/dev-projects/${projectId}/files/${selected.id}/snapshots`,
      );
      setSnapshots(data.snapshots || []);
    } catch {
      toast.error("Could not load history");
    }
  };

  const revert = async (snapshotId) => {
    if (!selected || !window.confirm("Revert this file to the selected snapshot? Your current content will be saved as its own snapshot first.")) return;
    setBusy(true);
    try {
      const { data } = await api.post(
        `/dev-projects/${projectId}/files/${selected.id}/revert/${snapshotId}`,
      );
      setContent(data.content || "");
      setDirty(false);
      setHistoryOpen(false);
      toast.success(`Reverted ${selected.path}`);
      await load();
    } catch {
      toast.error("Revert failed");
    }
    setBusy(false);
  };

  // Absolute preview URL with a refresh-key cache buster so re-clicking
  // "Open live preview" after a Talk-to-Build edit doesn't hit a stale
  // cached version.
  const previewBase = previewUrl?.startsWith("http")
    ? previewUrl
    : `${window.location.origin}${previewUrl || ""}`;
  const previewHref = previewUrl
    ? `${previewBase}${previewBase.includes("?") ? "&" : "?"}r=${refreshKey}`
    : "";

  return (
    <div data-testid="bc-files-panel" className="mt-4 rounded-2xl bg-surface overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-hairline">
        <div className="text-[12px] font-semibold uppercase tracking-wider text-ink-mute flex items-center gap-2">
          <FileCode className="w-4 h-4" /> Generated code
          {files.length > 0 && (
            <span className="text-ink-dim normal-case tracking-normal font-normal">
              · {files.length} files
            </span>
          )}
        </div>
        {previewUrl && (
          <a
            href={previewHref}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="bc-files-open-preview"
            className="text-[12px] inline-flex items-center gap-1.5 px-3 h-8 rounded-pill bg-brand text-black font-semibold hover:bg-brand-deep"
          >
            <ExternalLink className="w-3.5 h-3.5" /> Open live preview
          </a>
        )}
      </div>

      <div className="grid grid-cols-12 min-h-[420px]">
        {/* File tree */}
        <div className="col-span-3 border-r border-hairline overflow-y-auto py-2">
          {loading ? (
            <div className="px-4 py-3 text-[12px] text-ink-mute flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…
            </div>
          ) : files.length === 0 ? (
            <div className="px-4 py-3 text-[12px] text-ink-mute">
              No files yet. Run a build to generate code.
            </div>
          ) : (
            <ul>
              {files.map((f) => (
                <li key={f.id}>
                  <button
                    type="button"
                    onClick={() => openFile(f)}
                    data-testid={`bc-file-${f.id}`}
                    className={`w-full text-left px-3 py-1.5 text-[12px] font-mono truncate flex items-center justify-between hover:bg-white/5 ${
                      selected?.id === f.id ? "bg-white/[0.06] text-brand" : "text-ink-dim"
                    }`}
                    title={f.path}
                  >
                    <span className="truncate">{f.path}</span>
                    <span className={`ml-2 text-[9px] uppercase tracking-wider shrink-0 ${
                      f.llm_status === "real" ? "text-emerald-400" :
                      f.llm_status === "human_edited" ? "text-amber-300" :
                      "text-ink-mute"
                    }`}>{f.llm_status}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Editor */}
        <div className="col-span-9 flex flex-col">
          {selected ? (
            <>
              <div className="px-4 py-2.5 border-b border-hairline flex items-center justify-between gap-2 relative">
                <div className="text-[12px] font-mono text-ink-dim truncate">
                  {selected.path}
                </div>
                <div className="flex items-center gap-2">
                  {dirty && <span className="text-[11px] text-amber-300">● unsaved</span>}
                  <button
                    type="button"
                    onClick={openHistory}
                    data-testid="bc-file-history"
                    className="inline-flex items-center gap-1.5 h-8 px-3 rounded-pill bg-surface-2 hover:bg-surface-3 text-ink-dim hover:text-ink text-[12px]"
                    title="View history & revert"
                  >
                    <History className="w-3.5 h-3.5" /> History
                  </button>
                  <button
                    type="button"
                    onClick={save}
                    disabled={!dirty || busy}
                    data-testid="bc-file-save"
                    className="inline-flex items-center gap-1.5 h-8 px-3 rounded-pill bg-brand text-black text-[12px] font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-brand-deep"
                  >
                    <Save className="w-3.5 h-3.5" />
                    {busy ? "Saving…" : "Save"}
                  </button>
                </div>

                {historyOpen && (
                  <div
                    data-testid="bc-history-popover"
                    className="absolute right-3 top-full mt-1 z-30 w-[340px] max-h-[380px] overflow-y-auto rounded-xl bg-surface-2 ring-1 ring-hairline shadow-xl py-1"
                  >
                    <div className="px-3 py-2 text-[11px] text-ink-mute uppercase tracking-wider flex items-center justify-between border-b border-hairline">
                      <span>Snapshots ({snapshots.length})</span>
                      <button
                        type="button"
                        onClick={() => setHistoryOpen(false)}
                        className="text-ink-mute hover:text-ink"
                      >
                        ✕
                      </button>
                    </div>
                    {snapshots.length === 0 ? (
                      <div className="px-3 py-4 text-[12px] text-ink-mute italic">
                        No snapshots yet. They&apos;re captured automatically on every AI or human edit.
                      </div>
                    ) : snapshots.map((s) => (
                      <div key={s.id} className="px-3 py-2 hover:bg-white/[0.04] flex items-center gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="text-[12px] text-ink truncate capitalize">
                            {s.reason.replace(/_/g, " ")}
                          </div>
                          <div className="text-[10px] text-ink-mute">
                            {new Date(s.created_at).toLocaleString()} · {s.size_bytes}B
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setDiffSnap(s)}
                          data-testid={`bc-diff-${s.id}`}
                          className="inline-flex items-center gap-1 h-7 px-2 rounded-full bg-surface-3 hover:bg-white/10 text-ink-dim hover:text-ink text-[11px]"
                          title="View diff vs current"
                        >
                          <GitCompare className="w-3 h-3" /> Diff
                        </button>
                        <button
                          type="button"
                          onClick={() => revert(s.id)}
                          disabled={busy}
                          data-testid={`bc-revert-${s.id}`}
                          className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full bg-amber-300 hover:bg-amber-200 text-black text-[11px] font-semibold disabled:opacity-50"
                        >
                          <Undo2 className="w-3 h-3" /> Revert
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <textarea
                value={content}
                onChange={(e) => { setContent(e.target.value); setDirty(true); }}
                data-testid="bc-file-editor"
                spellCheck={false}
                className="flex-1 w-full p-4 bg-surface-2 text-[12px] font-mono text-ink leading-relaxed resize-none outline-none focus:bg-surface-3"
                style={{ tabSize: 2 }}
              />
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-[13px] text-ink-mute">
              Select a file to view & edit
            </div>
          )}
        </div>
      </div>
      {diffSnap && selected && (
        <DiffViewer
          projectId={projectId}
          fileId={selected.id}
          snapshot={diffSnap}
          onRevert={(sid) => { setDiffSnap(null); revert(sid); }}
          onClose={() => setDiffSnap(null)}
        />
      )}
    </div>
  );
}
