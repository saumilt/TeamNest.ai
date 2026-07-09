import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Blocks, ExternalLink, Sparkles } from "lucide-react";
import SeoHelmet from "@/components/web/SeoHelmet";
import { Pill, PrimaryButton, SectionTitle, SectionSub } from "@/components/web/atoms";
import { useAuth } from "@/context/AuthContext";

const API = process.env.REACT_APP_BACKEND_URL;

export const priceBadge = (pricing) => {
  if (!pricing || pricing.model === "free") return { label: "Free", cls: "bg-emerald-500/15 text-emerald-500 ring-emerald-500/30" };
  if (pricing.model === "one_time") return { label: `$${pricing.price_usd} one-time`, cls: "bg-amber-500/15 text-amber-500 ring-amber-500/30" };
  return { label: `$${pricing.price_usd}/mo`, cls: "bg-sky-500/15 text-sky-500 ring-sky-500/30" };
};

/** /templates — public App Store of installable templates. */
function TemplateCard({ t, goInstall, featured = false }) {
  const badge = priceBadge(t.pricing);
  return (
    <div
      data-testid={`tm-card-${t.id}`}
      className={`group rounded-[20px] border bg-[var(--w-surface)] overflow-hidden transition-colors flex flex-col ${
        featured ? "border-amber-500/40 ring-1 ring-amber-500/20" : "border-[var(--w-hairline)] hover:border-amber-500/40"
      }`}
    >
      <div className="h-44 relative overflow-hidden bg-[var(--w-bg-2)]">
        {t.has_screenshot ? (
          <img
            src={`${API}/api/market/templates/${t.id}/screenshot`}
            alt={t.name}
            loading="lazy"
            className="absolute inset-0 w-full h-full object-cover object-top"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-[var(--w-text-mute)]">
            <Sparkles className="w-8 h-8 opacity-40" />
          </div>
        )}
        {featured && (
          <span className="absolute top-3 left-3 text-[11px] font-semibold px-2.5 py-1 rounded-full ring-1 backdrop-blur bg-amber-500/20 text-amber-400 ring-amber-500/40 inline-flex items-center gap-1">
            <Sparkles className="w-3 h-3" /> Featured
          </span>
        )}
        <span className={`absolute top-3 right-3 text-[11px] font-semibold px-2.5 py-1 rounded-full ring-1 backdrop-blur ${badge.cls}`}>
          {badge.label}
        </span>
      </div>
      <div className="p-5 flex flex-col flex-1">
        <div className="flex items-center gap-2 mb-1.5">
          <h3 className="text-[16px] font-semibold text-[var(--w-text)]">{t.name}</h3>
          {t.category && (
            <span className="text-[10px] uppercase tracking-wider text-[var(--w-text-mute)]">{t.category}</span>
          )}
        </div>
        <p className="text-[13px] text-[var(--w-text-dim)] leading-relaxed flex-1">{t.tagline}</p>
        <div className="text-[11px] text-[var(--w-text-mute)] mt-2">
          by {t.creator_name || "TeamNest"}{t.installs > 0 ? ` · ${t.installs} installs` : ""}
        </div>
        <div className="flex items-center gap-2 mt-4">
          <button
            type="button"
            onClick={() => goInstall(t)}
            data-testid={`tm-use-${t.id}`}
            className="flex-1 h-10 rounded-full bg-amber-500 hover:bg-amber-400 text-black font-semibold text-[13px] inline-flex items-center justify-center gap-1.5 transition-colors"
          >
            Use this template <ArrowRight className="w-3.5 h-3.5" />
          </button>
          <a
            href={`${API}/api/market/templates/${t.id}/demo/index.html`}
            target="_blank"
            rel="noopener noreferrer"
            data-testid={`tm-demo-${t.id}`}
            className="h-10 px-3.5 rounded-full ring-1 ring-[var(--w-hairline)] text-[var(--w-text-dim)] hover:text-[var(--w-text)] text-[13px] font-medium inline-flex items-center gap-1.5"
          >
            Demo <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>
    </div>
  );
}

/** /templates — public App Store of installable templates. */
export default function TemplatesMarket() {
  const [templates, setTemplates] = useState(null);
  const [categories, setCategories] = useState([]);
  const [category, setCategory] = useState("all");
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    fetch(`${API}/api/market/templates`)
      .then((r) => (r.ok ? r.json() : { templates: [] }))
      .then((d) => setTemplates(d.templates || []))
      .catch(() => setTemplates([]));
    fetch(`${API}/api/market/categories`)
      .then((r) => (r.ok ? r.json() : { categories: [] }))
      .then((d) => setCategories(d.categories || []))
      .catch(() => setCategories([]));
  }, []);

  const goInstall = (t) => {
    const path = `/market/install/${t.id}`;
    if (user) return navigate(path);
    try { localStorage.setItem("tn-next-path", path); } catch { /* noop */ }
    navigate("/signup");
  };

  const labelBySlug = Object.fromEntries(categories.map((c) => [c.slug, c.label]));
  const labelFor = (slug) => (slug === "all" ? "All" : labelBySlug[slug] || slug);
  // Only surface category tabs that actually have templates.
  const present = new Set((templates || []).map((t) => t.category).filter(Boolean));
  const cats = ["all", ...categories.map((c) => c.slug).filter((s) => present.has(s))];
  const shown = (templates || []).filter((t) => category === "all" || t.category === category);
  const featured = (templates || []).filter((t) => t.featured);
  const rest = category === "all" ? shown.filter((t) => !t.featured) : shown;

  return (
    <>
      <SeoHelmet
        title="TeamNest Templates — install a working app in one click"
        description="Browse the TeamNest App Store: complete working apps built by @devmanager and the community. Install free templates instantly, or buy premium ones. Sell your own and earn 70%."
        path="/templates"
      />

      <section className="relative pt-20 pb-12 overflow-hidden">
        <div
          aria-hidden
          className="absolute -top-[200px] left-1/2 -translate-x-1/2 w-[800px] h-[500px] rounded-full pointer-events-none"
          style={{ background: "radial-gradient(circle, rgba(255,210,63,0.10), transparent 60%)" }}
        />
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 text-center relative">
          <Pill tone="ai" className="mb-5 mx-auto">
            <Blocks className="w-3.5 h-3.5" /> Template App Store
          </Pill>
          <SectionTitle className="max-w-[24ch] mx-auto">
            Working apps, one click away. Built by <span className="text-amber-500">@devmanager</span>.
          </SectionTitle>
          <SectionSub className="mx-auto text-center mt-4">
            Every template is a complete, tested app — try the live demo, then install it
            into your workspace and remix it in plain English. Built one yourself?{" "}
            Sell it here and keep <span className="text-amber-500 font-semibold">70%</span>.
          </SectionSub>
        </div>
      </section>

      <section className="pb-20" data-testid="templates-market-grid">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6">
          {cats.length > 2 && (
            <div className="flex flex-wrap gap-2 mb-6 justify-center">
              {cats.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCategory(c)}
                  data-testid={`tm-cat-${c}`}
                  className={`h-8 px-3.5 rounded-full text-[12px] font-medium capitalize ring-1 transition-colors ${
                    category === c
                      ? "bg-amber-500/15 text-amber-500 ring-amber-500/40"
                      : "text-[var(--w-text-dim)] ring-[var(--w-hairline)] hover:text-[var(--w-text)]"
                  }`}
                >
                  {labelFor(c)}
                </button>
              ))}
            </div>
          )}

          {templates === null ? (
            <div className="text-center text-[14px] text-[var(--w-text-mute)] py-16">Loading templates…</div>
          ) : shown.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-[15px] text-[var(--w-text-dim)] mb-6">No templates here yet — be the first to publish one.</p>
              <PrimaryButton as={Link} to="/login?demo=1">
                Build one with @devmanager <ArrowRight className="w-4 h-4" />
              </PrimaryButton>
            </div>
          ) : (
            <>
              {category === "all" && featured.length > 0 && (
                <div className="mb-10" data-testid="tm-featured-section">
                  <div className="flex items-center gap-2 mb-4">
                    <Sparkles className="w-4 h-4 text-amber-500" />
                    <h2 className="text-[15px] font-semibold text-[var(--w-text)]">Featured</h2>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                    {featured.map((t) => (
                      <TemplateCard key={t.id} t={t} goInstall={goInstall} featured />
                    ))}
                  </div>
                </div>
              )}
              {rest.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                  {rest.map((t) => (
                    <TemplateCard key={t.id} t={t} goInstall={goInstall} />
                  ))}
                </div>
              )}
            </>
          )}

          <div className="mt-14 rounded-[20px] border border-[var(--w-hairline)] bg-[var(--w-surface)] p-8 text-center">
            <h3 className="text-[18px] font-semibold text-[var(--w-text)] mb-2">Sell your app as a template</h3>
            <p className="text-[13px] text-[var(--w-text-dim)] max-w-[52ch] mx-auto mb-5">
              Build anything with @devmanager, set a one-time or monthly price, and submit it for review.
              Once approved by TeamNest, it goes live here — you keep 70% of every sale.
            </p>
            <PrimaryButton as={Link} to={user ? "/market/mine" : "/signup"} data-testid="tm-sell-cta">
              Start selling <ArrowRight className="w-4 h-4" />
            </PrimaryButton>
          </div>
        </div>
      </section>
    </>
  );
}
