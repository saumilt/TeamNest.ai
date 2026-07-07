import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, ExternalLink, Eye, Maximize2, MessageSquareText, Monitor, RefreshCw, Rocket, Share2, Smartphone, UploadCloud } from "lucide-react";
import { api } from "@/lib/api";
import safeStorage from "@/lib/safeStorage";
import PublishDialog from "@/components/chat/PublishDialog";
import PreviewCommentsPanel from "@/components/chat/PreviewCommentsPanel";

/**
 * LivePreviewPane — a persistent right-rail iframe of the chat's linked
 * Dev OS project preview. Collapsed by default to a slim 40px vertical
 * strip so it stays out of the way; click expands it to a wide split-view
 * the team can poke at while talking. Collapsed/expanded state is
 * remembered per chat via safeStorage.
 *
 * Shows for ANY chat that has a linked_dev_project (not just the
 * dev-chat type). Renders nothing when no project is linked.
 */
export default function LivePreviewPane({ chatId, project, onQuickPrompt }) {
  const storageKey = `chat:live-preview:expanded:${chatId}`;
  const [expanded, setExpanded] = useState(
    () => safeStorage.get(storageKey) === "1",
  );
  const [refreshKey, setRefreshKey] = useState(0);
  const [sharing, setSharing] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [viewport, setViewport] = useState("desktop"); // desktop | mobile
  const [paneW, setPaneW] = useState(() => {
    const v = safeStorage.getNumber("chat:live-preview:width", 42);
    return v >= 25 && v <= 70 ? v : 42;
  });
  const [dragging, setDragging] = useState(false);
  const draggingRef = useRef(false);

  // Drag-to-resize: handle sits on the pane's left edge.
  useEffect(() => {
    const move = (e) => {
      if (!draggingRef.current) return;
      const pct = Math.min(70, Math.max(25, ((window.innerWidth - e.clientX) / window.innerWidth) * 100));
      setPaneW(pct);
    };
    const up = () => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      setDragging(false);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      setPaneW((w) => { safeStorage.set("chat:live-preview:width", Math.round(w)); return w; });
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
  }, []);

  // ─── Auto-refresh on talk-to-build edits ─────────────────────────────
  // When someone in the chat tells the AI to edit the build (e.g. "add a
  // status column"), the server posts an auto_continuation system message
  // with `metadata.files_changed`. We poll the recent messages while the
  // preview is expanded and bump the iframe key whenever a NEW edit lands
  // — so teammates see updates without having to click Refresh.
  const lastSeenEditIdRef = useRef(null);
  useEffect(() => {
    if (!expanded || !chatId || !project?.id) return undefined;
    let cancelled = false;
    const poll = async () => {
      try {
        const { data } = await api.get(`/chats/${chatId}/messages?limit=5`);
        const msgs = Array.isArray(data) ? data : data?.messages || [];
        // Newest-first scan for the most recent message that touched files
        // for THIS project.
        const latestEdit = msgs.find((m) => {
          const meta = m.metadata || {};
          const changed = meta.files_changed || [];
          return (
            changed.length > 0
            && (!meta.project_id || meta.project_id === project.id)
          );
        });
        if (cancelled) return;
        if (latestEdit && latestEdit.id !== lastSeenEditIdRef.current) {
          // First poll just bookmarks the latest known edit; subsequent
          // polls fire the refresh + toast.
          if (lastSeenEditIdRef.current !== null) {
            setRefreshKey((k) => k + 1);
            toast.info("Live preview refreshed — files updated");
          }
          lastSeenEditIdRef.current = latestEdit.id;
        }
      } catch { /* best-effort polling */ }
    };
    poll();
    const interval = setInterval(poll, 8_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [expanded, chatId, project?.id]);

  if (!project?.id) return null;

  const toggle = () => {
    const next = !expanded;
    setExpanded(next);
    safeStorage.set(storageKey, next ? "1" : "0");
  };

  const previewSrc = `/api/dev-projects/${project.id}/preview/index.html`;
  const studioPath = `/dev-os/projects/${project.id}/studio`;

  // Create or refresh a public share token and copy the link to clipboard.
  // The same token is re-used for the same (project, user) pair so
  // colleagues who got an earlier link still see the latest build.
  const share = async () => {
    setSharing(true);
    try {
      const { data } = await api.post(`/dev-projects/${project.id}/share-token`);
      const url = `${window.location.origin}${data.share_path}`;
      try {
        await navigator.clipboard.writeText(url);
        toast.success("Public link copied — paste it to share the build");
      } catch {
        toast.success(`Public link: ${url}`);
      }
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not create share link");
    } finally {
      setSharing(false);
    }
  };

  if (!expanded) {
    // Slim collapsed strip — full-height vertical bar with a vertical
    // label so users can spot it without it stealing layout width.
    return (
      <button
        type="button"
        onClick={toggle}
        data-testid="live-preview-collapsed"
        title={`Show live preview · ${project.name}`}
        className="hidden lg:flex flex-col items-center justify-between w-10 border-l border-hairline bg-surface hover:bg-surface-2 text-amber-200/80 hover:text-amber-200 py-4 group"
      >
        <ChevronLeft className="w-4 h-4 opacity-70 group-hover:opacity-100" />
        <div className="flex-1 flex items-center justify-center">
          <span
            className="text-[11px] font-semibold tracking-[0.18em] uppercase"
            style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
          >
            <Rocket className="w-3 h-3 inline-block mr-1.5 -mt-0.5" />
            Live preview · {project.name}
          </span>
        </div>
        <Eye className="w-4 h-4 opacity-70 group-hover:opacity-100" />
      </button>
    );
  }

  return (
    <aside
      data-testid="live-preview-expanded"
      className="hidden lg:flex flex-col border-l border-hairline bg-surface relative shrink-0"
      style={{ width: `${paneW}%` }}
    >
      {/* Drag handle — resize the preview pane */}
      <div
        data-testid="live-preview-resize-handle"
        onMouseDown={(e) => {
          e.preventDefault();
          draggingRef.current = true;
          setDragging(true);
          document.body.style.cursor = "col-resize";
          document.body.style.userSelect = "none";
        }}
        onDoubleClick={() => { setPaneW(42); safeStorage.set("chat:live-preview:width", 42); }}
        title="Drag to resize · double-click to reset"
        className="absolute left-0 inset-y-0 w-1.5 -ml-0.5 cursor-col-resize z-20 group"
      >
        <div className="absolute inset-y-0 left-0 w-[3px] bg-transparent group-hover:bg-amber-400/40 transition-colors" />
      </div>
      {/* Header */}
      <div className="h-12 border-b border-hairline flex items-center gap-2 px-3 bg-surface-2/60">
        <button
          type="button"
          onClick={toggle}
          data-testid="live-preview-collapse"
          title="Collapse"
          className="text-ink-mute hover:text-ink p-1 rounded hover:bg-white/5"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
        <Rocket className="w-3.5 h-3.5 text-amber-300 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-[12px] font-semibold text-ink truncate">{project.name}</div>
          <div className="text-[10px] text-ink-mute truncate">
            {project.status || "draft"} · v{project.version || "0.1.0"} · live preview
          </div>
        </div>
        <button
          type="button"
          onClick={() => setRefreshKey((k) => k + 1)}
          data-testid="live-preview-refresh"
          title="Refresh preview"
          className="text-ink-mute hover:text-ink p-1 rounded hover:bg-white/5"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={share}
          disabled={sharing}
          data-testid="live-preview-share"
          title="Copy a public link to demo this build"
          className="text-ink-mute hover:text-ink p-1 rounded hover:bg-white/5 disabled:opacity-50"
        >
          <Share2 className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => window.open(previewSrc, "_blank", "noopener")}
          data-testid="live-preview-fullscreen"
          title="Open full screen in a new tab"
          className="text-ink-mute hover:text-ink p-1 rounded hover:bg-white/5"
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => setPublishOpen(true)}
          data-testid="live-preview-publish"
          title="Publish to production / Vercel / Netlify"
          className="inline-flex items-center gap-1 h-7 px-2.5 rounded-pill bg-emerald-400/15 hover:bg-emerald-400/25 text-emerald-300 ring-1 ring-emerald-400/30 text-[11px] font-semibold"
        >
          <UploadCloud className="w-3 h-3" />
          Publish
        </button>
        <Link
          to={studioPath}
          data-testid="live-preview-open-studio"
          title="Open in DevStudio"
          className="ml-1 inline-flex items-center gap-1 h-7 px-2.5 rounded-pill bg-amber-300 hover:bg-amber-200 text-black text-[11px] font-semibold no-underline"
        >
          Studio <ExternalLink className="w-3 h-3" />
        </Link>
      </div>

      {/* Hint banner — same demo creds as DevStudio */}
      <div
        data-testid="live-preview-creds-hint"
        className="px-3 py-2 text-[11px] text-amber-200/90 bg-amber-400/[0.05] border-b border-amber-400/15 flex items-center gap-2"
      >
        <span className="flex-1 min-w-0 truncate">
          Sign in with <code className="text-amber-300">demo@example.com</code> /{" "}
          <code className="text-amber-300">demo</code>
        </span>
        <button
          type="button"
          onClick={() => setViewport(viewport === "mobile" ? "desktop" : "mobile")}
          data-testid="live-preview-viewport-toggle"
          title={viewport === "mobile" ? "Desktop view" : "Mobile view"}
          className="shrink-0 text-amber-300 hover:text-amber-200 p-0.5"
        >
          {viewport === "mobile" ? <Monitor className="w-3.5 h-3.5" /> : <Smartphone className="w-3.5 h-3.5" />}
        </button>
        <button
          type="button"
          onClick={() => setShowComments((v) => !v)}
          data-testid="live-preview-comments-toggle"
          title="Preview feedback & comments"
          className={`shrink-0 p-0.5 ${showComments ? "text-amber-200" : "text-amber-300 hover:text-amber-200"}`}
        >
          <MessageSquareText className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => window.open(previewSrc, "_blank", "noopener")}
          data-testid="live-preview-fullscreen-link"
          className="shrink-0 inline-flex items-center gap-1 text-amber-300 hover:text-amber-200 hover:underline font-medium"
        >
          Full screen <Maximize2 className="w-3 h-3" />
        </button>
      </div>

      {/* One-tap quick actions — drop a ready prompt into the composer */}
      <div
        data-testid="live-preview-quick-actions"
        className="px-2.5 py-1.5 border-b border-hairline flex gap-1.5 overflow-x-auto"
      >
        {[
          ["🐛 Fix bug", "fix this bug in the app: "],
          ["✨ Add feature", "add a feature: "],
          ["🎨 Improve design", "improve the visual design of the app — better spacing, colors and typography"],
          ["📱 Mobile friendly", "make the app fully mobile friendly — responsive layout down to 390px"],
        ].map(([label, prompt], i) => (
          <button
            key={label}
            type="button"
            data-testid={`quick-action-${i}`}
            onClick={() => onQuickPrompt?.(prompt)}
            className="shrink-0 h-6 px-2.5 rounded-full bg-surface-2 hover:bg-surface-3 ring-1 ring-hairline text-ink-dim hover:text-ink text-[10.5px] font-medium"
          >
            {label}
          </button>
        ))}
      </div>

      <div className={`flex-1 min-h-0 flex flex-col ${viewport === "mobile" ? "bg-zinc-900" : ""}`} style={dragging ? { pointerEvents: "none" } : undefined}>
        <div className={`flex-1 min-h-0 ${viewport === "mobile" ? "flex justify-center py-3" : ""}`}>
          <iframe
            key={`${project.id}:${refreshKey}`}
            src={previewSrc}
            data-testid="live-preview-iframe"
            title={`Live preview — ${project.name}`}
            className={viewport === "mobile"
              ? "h-full w-[390px] max-w-full bg-white rounded-xl ring-1 ring-white/20"
              : "h-full w-full bg-white"}
          />
        </div>
        {showComments && (
          <div className="h-72 border-t border-hairline shrink-0" data-testid="live-preview-comments-drawer">
            <PreviewCommentsPanel projectId={project.id} />
          </div>
        )}
      </div>

      <PublishDialog open={publishOpen} onOpenChange={setPublishOpen} project={project} />
    </aside>
  );
}
