import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { ExternalLink, MessageSquareText } from "lucide-react";
import PreviewCommentsPanel from "@/components/chat/PreviewCommentsPanel";

/**
 * SharePreviewPage — unauthenticated public route that wraps a project's
 * working SPA preview in a small frame. External stakeholders open this
 * via a share token created by the project owner from the LivePreviewPane.
 *
 * The page is intentionally minimal: a thin top banner that surfaces the
 * "this is a working prototype" context + the demo credentials, plus the
 * iframe filling the rest of the viewport. No app chrome (sidebar, auth
 * UI) so the focus stays on the build.
 */
export default function SharePreviewPage() {
  const { token } = useParams();
  const [refreshKey, setRefreshKey] = useState(0);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const previewSrc = `/api/share/preview/${token}/index.html`;

  // Track whether the iframe document looks like an active preview vs. a
  // backend 404/410 HTML stub. We can't read cross-frame content directly
  // (sandbox), so we use the response Content-Type via a GET with
  // ?probe=1 — same endpoint, sniff the status code in JS-land.
  const [status, setStatus] = useState("loading"); // loading | ok | expired | missing
  useEffect(() => {
    let cancelled = false;
    fetch(previewSrc, { method: "GET" })
      .then((r) => {
        if (cancelled) return;
        if (r.status >= 200 && r.status < 300) setStatus("ok");
        else if (r.status === 410) setStatus("expired");
        else setStatus("missing");
      })
      .catch(() => { if (!cancelled) setStatus("missing"); });
    return () => { cancelled = true; };
  }, [previewSrc, refreshKey]);

  return (
    <div className="min-h-screen flex flex-col bg-zinc-950 text-zinc-100">
      <header
        data-testid="share-preview-header"
        className="border-b border-white/10 px-4 py-3 flex items-center gap-3 bg-zinc-950"
      >
        <div className="w-7 h-7 rounded-lg bg-amber-300 text-black flex items-center justify-center font-bold text-sm">
          T
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold">Live preview · TeamNest Dev OS</div>
          <div className="text-[11px] text-zinc-400">
            Sign in inside the preview with{" "}
            <code className="text-amber-300">demo@example.com</code> /{" "}
            <code className="text-amber-300">demo</code>. Data lives in your browser only.
          </div>
        </div>
        <button
          type="button"
          onClick={() => setFeedbackOpen((v) => !v)}
          data-testid="share-feedback-toggle"
          className={`inline-flex items-center gap-1 h-8 px-3 rounded-pill text-[12px] font-semibold ring-1 ring-white/15 ${
            feedbackOpen ? "bg-white/15 text-white" : "bg-white/5 text-zinc-300 hover:bg-white/10"
          }`}
        >
          <MessageSquareText className="w-3.5 h-3.5" /> Feedback
        </button>
        <a
          href="https://teamnest.ai"
          target="_blank"
          rel="noopener noreferrer"
          data-testid="share-preview-cta"
          className="inline-flex items-center gap-1 h-8 px-3 rounded-pill bg-amber-300 hover:bg-amber-200 text-black text-[12px] font-semibold no-underline"
        >
          Build with TeamNest <ExternalLink className="w-3 h-3" />
        </a>
      </header>

      {status === "ok" && (
        <div className="flex-1 min-h-0 flex">
          <iframe
            key={refreshKey}
            src={previewSrc}
            data-testid="share-preview-iframe"
            title="Shared preview"
            className="flex-1 w-full bg-white"
          />
          {feedbackOpen && (
            <aside
              data-testid="share-feedback-panel"
              className="w-80 shrink-0 border-l border-white/10 bg-zinc-950 hidden sm:block"
            >
              <PreviewCommentsPanel token={token} dark />
            </aside>
          )}
        </div>
      )}
      {status === "loading" && (
        <div
          data-testid="share-preview-loading"
          className="flex-1 flex items-center justify-center text-sm text-zinc-400"
        >
          Loading preview…
        </div>
      )}
      {(status === "expired" || status === "missing") && (
        <div
          data-testid="share-preview-expired"
          className="flex-1 flex flex-col items-center justify-center px-4 text-center"
        >
          <div className="text-3xl mb-3">🔗</div>
          <h2 className="text-lg font-semibold">
            {status === "expired"
              ? "This share link has expired"
              : "This share link is no longer active"}
          </h2>
          <p className="text-sm text-zinc-400 mt-2 max-w-md">
            {status === "expired"
              ? "Share links stay live for 30 days. Ask the owner to send you a fresh link from their TeamNest workspace."
              : "The owner may have revoked it or the link is invalid. Ask them to send you a fresh link from their TeamNest workspace."}
          </p>
          <button
            type="button"
            onClick={() => setRefreshKey((k) => k + 1)}
            className="mt-4 text-[12px] text-zinc-400 hover:text-zinc-100 underline-offset-2 hover:underline"
          >
            Try again
          </button>
        </div>
      )}
    </div>
  );
}
