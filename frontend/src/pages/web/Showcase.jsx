import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ExternalLink, Globe, Rocket, Sparkles } from "lucide-react";
import SeoHelmet from "@/components/web/SeoHelmet";
import { Eyebrow, Pill, PrimaryButton, GhostButton, SectionTitle, SectionSub } from "@/components/web/atoms";

/** /showcase — public "Built with TeamNest" gallery of published apps. */
export default function WebShowcase() {
  const [apps, setApps] = useState(null);

  useEffect(() => {
    fetch(`${process.env.REACT_APP_BACKEND_URL}/api/showcase`)
      .then((r) => (r.ok ? r.json() : { apps: [] }))
      .then((d) => setApps(d.apps || []))
      .catch(() => setApps([]));
  }, []);

  return (
    <>
      <SeoHelmet
        title="Built with TeamNest — real apps shipped by @devmanager"
        description="A gallery of real, live applications teams built by chatting with @devmanager — TeamNest's AI engineer. Try them, then build yours."
        path="/showcase"
      />

      {/* Hero */}
      <section className="relative pt-20 pb-14 overflow-hidden">
        <div
          aria-hidden
          className="absolute -top-[200px] left-1/2 -translate-x-1/2 w-[800px] h-[500px] rounded-full pointer-events-none"
          style={{ background: "radial-gradient(circle, rgba(255,210,63,0.10), transparent 60%)" }}
        />
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 text-center relative">
          <Pill tone="ai" className="mb-5 mx-auto">
            <Rocket className="w-3.5 h-3.5" /> Built with TeamNest
          </Pill>
          <SectionTitle className="max-w-[22ch] mx-auto">
            Real apps. Built by chatting with <span className="text-amber-500">@devmanager</span>.
          </SectionTitle>
          <SectionSub className="mx-auto text-center mt-4">
            Every app below was described in plain English, built, QA'd in a real browser,
            and published — without writing code. Click any card to use the live app.
          </SectionSub>
        </div>
      </section>

      {/* Gallery */}
      <section className="pb-20" data-testid="showcase-grid">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6">
          {apps === null ? (
            <div className="text-center text-[14px] text-[var(--w-text-mute)] py-16">Loading showcase…</div>
          ) : apps.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-[15px] text-[var(--w-text-dim)] mb-6">
                The gallery is warming up — be the first to feature your app here.
              </p>
              <PrimaryButton as={Link} to="/login?demo=1">
                Build the first one <ArrowRight className="w-4 h-4" />
              </PrimaryButton>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {apps.map((app) => (
                <a
                  key={app.slug}
                  href={`/p/${app.slug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid={`showcase-app-${app.slug}`}
                  className="group rounded-[20px] border border-[var(--w-hairline)] bg-[var(--w-surface)] overflow-hidden hover:border-amber-500/40 transition-colors flex flex-col"
                >
                  <div className="h-40 relative overflow-hidden bg-[var(--w-bg-2)]">
                    <iframe
                      src={`/api/p/${app.slug}/index.html`}
                      title={app.name}
                      tabIndex={-1}
                      loading="lazy"
                      className="absolute top-0 left-0 origin-top-left pointer-events-none"
                      style={{ width: "1280px", height: "800px", transform: "scale(0.30)", border: 0 }}
                    />
                    <div className="absolute inset-0" />
                  </div>
                  <div className="p-5 flex-1 flex flex-col">
                    <div className="flex items-center gap-2 mb-1.5">
                      <h3 className="text-[17px] font-bold text-[var(--w-text)] truncate">{app.name}</h3>
                      <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 text-[10px] font-bold uppercase tracking-wider shrink-0">
                        Live
                      </span>
                    </div>
                    {app.tagline && (
                      <p className="text-[13px] leading-5 text-[var(--w-text-dim)] line-clamp-2 mb-3">{app.tagline}</p>
                    )}
                    <div className="mt-auto flex items-center gap-2 text-[12px] text-[var(--w-text-mute)]">
                      {app.custom_domain ? (
                        <span className="inline-flex items-center gap-1"><Globe className="w-3 h-3" /> {app.custom_domain}</span>
                      ) : (
                        <span className="font-mono">/p/{app.slug}</span>
                      )}
                      <span className="ml-auto inline-flex items-center gap-1 font-semibold text-[var(--w-text-dim)] group-hover:text-amber-500 transition-colors">
                        Open app <ExternalLink className="w-3 h-3" />
                      </span>
                    </div>
                  </div>
                </a>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Build yours CTA */}
      <section className="bg-[var(--w-bg-2)] py-20" data-testid="showcase-cta">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 text-center">
          <Eyebrow className="mb-3">Your turn</Eyebrow>
          <h2
            className="text-[36px] sm:text-[44px] leading-[1.1] font-bold tracking-[-0.02em] text-[var(--w-text)] mb-5 max-w-[22ch] mx-auto"
            style={{ textWrap: "balance" }}
          >
            Describe your app in chat. <span className="text-amber-500">@devmanager</span> ships it.
          </h2>
          <p className="text-[16px] leading-7 text-[var(--w-text-dim)] mb-8 max-w-[52ch] mx-auto">
            Plain English in, working app out — with a live preview, browser-tested QA,
            one-click publish and your own custom domain.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <PrimaryButton as={Link} to="/login?demo=1" data-testid="showcase-build-yours">
              <Sparkles className="w-4 h-4" /> Build yours free
            </PrimaryButton>
            <GhostButton as={Link} to="/dev-os-guide">How it works</GhostButton>
          </div>
        </div>
      </section>
    </>
  );
}
