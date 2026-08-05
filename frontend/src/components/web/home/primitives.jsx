/* Shared building blocks for the broadened TeamNest marketing homepage.
   Dark, premium SaaS identity preserved (brand #FFD23F, AI #B794F4). */

/** Faint node-grid + brand glow backdrop reused across sections. */
export function EngineBackdrop({ tone = "brand" }) {
  const glow = tone === "ai" ? "var(--w-ai)" : "var(--w-brand)";
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div
        className="absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage:
            "radial-gradient(circle at center, var(--w-hairline) 1px, transparent 1px)",
          backgroundSize: "26px 26px",
          maskImage: "radial-gradient(ellipse 80% 60% at 50% 40%, black, transparent 75%)",
          WebkitMaskImage: "radial-gradient(ellipse 80% 60% at 50% 40%, black, transparent 75%)",
        }}
      />
      <div
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[720px] h-[720px] rounded-full opacity-[0.12] blur-[80px]"
        style={{ background: `radial-gradient(circle, ${glow}, transparent 60%)` }}
      />
    </div>
  );
}

/** Browser-chrome frame for product surfaces. */
export function BrowserFrame({ children, className = "", url = "teamnest.ai" }) {
  return (
    <div className={`rounded-[16px] border border-[var(--w-hairline)] bg-[var(--w-surface)] overflow-hidden shadow-[0_40px_120px_-40px_rgba(0,0,0,0.7)] ${className}`}>
      <div className="h-9 px-4 flex items-center gap-2 border-b border-[var(--w-hairline)] bg-[var(--w-bg2)]">
        <span className="w-3 h-3 rounded-full bg-[#FF5F57]" />
        <span className="w-3 h-3 rounded-full bg-[#FEBC2E]" />
        <span className="w-3 h-3 rounded-full bg-[#28C840]" />
        <div className="ml-3 h-5 px-3 flex items-center rounded-md bg-[var(--w-surface2)] text-[11px] text-[var(--w-text-mute)]">
          {url}
        </div>
      </div>
      {children}
    </div>
  );
}

/** Staggered entrance animation — CSS-only (see App.css .tn-reveal).
    Always settles to the visible end-state; respects prefers-reduced-motion. */
export function Reveal({ children, delay = 0, className = "", as: Tag = "div" }) {
  return (
    <Tag className={`tn-reveal ${className}`} style={{ animationDelay: `${delay}ms` }}>
      {children}
    </Tag>
  );
}

/** Lightweight analytics: pushes to window.dataLayer if present, else no-op. */
export function trackHomeEvent(name, props = {}) {
  try {
    if (typeof window === "undefined") return;
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ event: name, ...props });
  } catch {
    /* analytics is best-effort; never break UX */
  }
}
