import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { ExternalLink } from "lucide-react";

/**
 * ProductionAppPage — public route serving a PUBLISHED production release
 * of a generated app at /p/{slug}. Unlike /share/{token} (live test
 * preview), this serves an immutable snapshot that only changes when the
 * owner re-publishes.
 */
export default function ProductionAppPage({ slug: slugProp, bare = false }) {
  const params = useParams();
  const slug = slugProp || params.slug;
  const src = `/api/p/${slug}/index.html`;
  const [status, setStatus] = useState("loading"); // loading | ok | missing

  useEffect(() => {
    let cancelled = false;
    fetch(src)
      .then((r) => { if (!cancelled) setStatus(r.ok ? "ok" : "missing"); })
      .catch(() => { if (!cancelled) setStatus("missing"); });
    return () => { cancelled = true; };
  }, [src]);

  return (
    <div className="min-h-screen flex flex-col bg-zinc-950 text-zinc-100">
      {!bare && (
      <header
        data-testid="production-app-header"
        className="border-b border-white/10 px-4 py-2 flex items-center gap-3 bg-zinc-950"
      >
        <div className="w-6 h-6 rounded-md bg-emerald-400 text-black flex items-center justify-center font-bold text-[11px]">
          ●
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-semibold truncate">
            {slug} <span className="text-emerald-400 text-[11px] font-medium">· live</span>
          </div>
          <div className="text-[10.5px] text-zinc-500">
            Demo login: <code className="text-amber-300">demo@example.com</code> /{" "}
            <code className="text-amber-300">demo</code>
          </div>
        </div>
        <a
          href="https://teamnest.ai"
          target="_blank"
          rel="noopener noreferrer"
          data-testid="production-app-cta"
          className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full bg-white/10 hover:bg-white/20 text-zinc-200 text-[11px] font-medium no-underline"
        >
          Built with TeamNest <ExternalLink className="w-3 h-3" />
        </a>
      </header>
      )}

      {status === "ok" && (
        <iframe
          src={src}
          data-testid="production-app-iframe"
          title={`Production — ${slug}`}
          className="flex-1 w-full bg-white"
        />
      )}
      {status === "loading" && (
        <div className="flex-1 flex items-center justify-center text-sm text-zinc-400">
          Loading…
        </div>
      )}
      {status === "missing" && (
        <div
          data-testid="production-app-missing"
          className="flex-1 flex flex-col items-center justify-center px-4 text-center"
        >
          <div className="text-3xl mb-3">🌐</div>
          <h2 className="text-lg font-semibold">Nothing published here yet</h2>
          <p className="text-sm text-zinc-400 mt-2 max-w-md">
            No live app is published at <code className="text-amber-300">/p/{slug}</code>. The
            owner may have unpublished it or changed the app name.
          </p>
        </div>
      )}
    </div>
  );
}
