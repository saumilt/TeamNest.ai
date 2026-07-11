import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { toast } from "sonner";
import {
  Store, ArrowLeft, Loader2, Search, Download, CheckCircle2, Star,
  ShieldCheck, Wrench, AlertTriangle, BookOpen, TrendingUp, Package, X,
} from "lucide-react";

const TABS = [
  { id: "browse", label: "Browse", icon: Store },
  { id: "mine", label: "My listings", icon: TrendingUp },
  { id: "installed", label: "Installed", icon: Package },
];

/** AI Employee Marketplace — browse, install, and manage your published listings. */
export default function AIEmployeeMarketplace() {
  const nav = useNavigate();
  const [tab, setTab] = useState("browse");
  const [detail, setDetail] = useState(null);

  return (
    <div className="min-h-screen bg-bg text-ink px-5 pt-16 pb-8 md:px-10">
      <div className="max-w-5xl mx-auto">
        <button type="button" onClick={() => nav("/ai-builder")} data-testid="mkt-back"
          className="inline-flex items-center gap-1.5 text-sm text-ink-dim hover:text-ink mb-4">
          <ArrowLeft className="w-4 h-4" /> Builder
        </button>
        <div className="flex items-start gap-3 mb-6">
          <div className="w-11 h-11 rounded-xl bg-ai-tint flex items-center justify-center shrink-0">
            <Store className="w-6 h-6 text-ai" />
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-extrabold">AI Employee Marketplace</h1>
            <p className="text-sm text-ink-dim">Discover ready-to-hire AI employees, or publish and license your own.</p>
          </div>
        </div>

        <div className="flex items-center gap-1 p-1 rounded-xl bg-surface-2 border border-white/10 w-fit mb-6">
          {TABS.map((t) => {
            const Icon = t.icon; const active = tab === t.id;
            return (
              <button key={t.id} type="button" onClick={() => setTab(t.id)} data-testid={`mkt-tab-${t.id}`}
                className={`inline-flex items-center gap-2 h-9 px-3.5 rounded-lg text-sm font-semibold ${active ? "bg-ai text-black" : "text-ink-dim hover:text-ink"}`}>
                <Icon className="w-4 h-4" /> {t.label}
              </button>
            );
          })}
        </div>

        {tab === "browse" && <BrowseTab onOpen={setDetail} />}
        {tab === "mine" && <MineTab />}
        {tab === "installed" && <InstalledTab nav={nav} />}
      </div>

      {detail && <ListingModal id={detail} onClose={() => setDetail(null)} nav={nav} />}
    </div>
  );
}

function BrowseTab({ onOpen }) {
  const [listings, setListings] = useState(null);
  const [cats, setCats] = useState([]);
  const [cat, setCat] = useState("All");
  const [q, setQ] = useState("");

  const load = () => {
    const params = {};
    if (cat !== "All") params.category = cat;
    if (q) params.q = q;
    api.get("/ai-builder/marketplace", { params }).then(({ data }) => setListings(data.listings)).catch(() => setListings([]));
  };
  useEffect(() => {
    api.get("/ai-builder/marketplace/categories").then(({ data }) => setCats(["All", ...data.categories])).catch(() => {});
  }, []);
  useEffect(load, [cat]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 text-ink-dim absolute left-3 top-1/2 -translate-y-1/2" />
          <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && load()}
            placeholder="Search AI employees…" data-testid="mkt-search"
            className="w-full h-10 pl-9 pr-3 rounded-full bg-surface-2 border border-white/10 text-sm text-ink focus:border-ai focus:outline-none" />
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5 mb-5">
        {cats.map((c) => (
          <button key={c} type="button" onClick={() => setCat(c)} data-testid={`mkt-cat-${c}`}
            className={`h-8 px-3 rounded-full text-xs font-semibold ${cat === c ? "bg-ai text-black" : "bg-surface-2 text-ink-dim hover:text-ink"}`}>{c}</button>
        ))}
      </div>

      {listings === null ? (
        <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-ai" /></div>
      ) : listings.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/10 bg-surface-2 p-8 text-center">
          <Store className="w-7 h-7 mx-auto text-ink-dim opacity-50 mb-2" />
          <p className="text-sm text-ink-dim">No listings yet. Publish one of your AI employees to get started.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {listings.map((l) => (
            <button type="button" key={l.id} onClick={() => onOpen(l.id)} data-testid={`mkt-listing-${l.id}`}
              className="text-left rounded-xl border border-white/10 bg-surface-2 p-4 hover:border-ai/40 transition-colors flex flex-col">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-bold flex-1 truncate">{l.title}</span>
                {l.installed && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />}
              </div>
              <p className="text-xs text-ink-dim flex-1 leading-relaxed line-clamp-2">{l.tagline || l.description}</p>
              <div className="flex items-center gap-2 mt-3 text-[11px] text-ink-dim">
                <span className="px-1.5 py-0.5 rounded bg-white/10">{l.category}</span>
                <span className="flex items-center gap-1"><Download className="w-3 h-3" />{l.install_count || 0}</span>
                <span className="ml-auto font-bold text-ai">{l.price_usd > 0 ? `$${l.price_usd}` : "Free"}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function MineTab() {
  const [data, setData] = useState(null);
  useEffect(() => {
    api.get("/ai-builder/marketplace/mine").then(({ data }) => setData(data)).catch(() => setData({ listings: [], summary: {} }));
  }, []);
  if (!data) return <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-ai" /></div>;
  const s = data.summary || {};
  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[["Listings", s.total_listings || 0], ["Published", s.published || 0], ["Installs", s.total_installs || 0], ["Revenue", `$${(s.total_revenue_usd || 0).toLocaleString()}`]].map(([label, val]) => (
          <div key={label} className="rounded-xl border border-white/10 bg-surface-2 p-4" data-testid={`mkt-stat-${label}`}>
            <div className="text-2xl font-extrabold tabular-nums">{val}</div>
            <div className="text-xs text-ink-dim mt-0.5">{label}</div>
          </div>
        ))}
      </div>
      {data.listings.length === 0 ? (
        <p className="text-sm text-ink-dim text-center py-8">You haven't published any AI employees yet. Open an employee → Deploy tab → Publish to Marketplace.</p>
      ) : (
        <div className="space-y-2">
          {data.listings.map((l) => (
            <div key={l.id} className="flex items-center gap-3 p-4 rounded-xl border border-white/10 bg-surface-2" data-testid={`mkt-mine-${l.id}`}>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-bold truncate">{l.title}</div>
                <div className="text-xs text-ink-dim">{l.category} · {l.price_usd > 0 ? `$${l.price_usd}` : "Free"} · {l.install_count || 0} installs</div>
              </div>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${l.status === "Published" ? "bg-emerald-500/15 text-emerald-300" : "bg-white/10 text-ink-dim"}`}>{l.status}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function InstalledTab({ nav }) {
  const [installs, setInstalls] = useState(null);
  useEffect(() => {
    api.get("/ai-builder/marketplace/installs").then(({ data }) => setInstalls(data.installs)).catch(() => setInstalls([]));
  }, []);
  if (installs === null) return <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-ai" /></div>;
  if (installs.length === 0) return <p className="text-sm text-ink-dim text-center py-8">No installed AI employees yet. Browse the marketplace to hire one.</p>;
  return (
    <div className="space-y-2">
      {installs.map((i) => (
        <button type="button" key={i.id} onClick={() => nav(`/ai-builder/${i.installed_employee_id}`)} data-testid={`mkt-install-${i.id}`}
          className="w-full text-left flex items-center gap-3 p-4 rounded-xl border border-white/10 bg-surface-2 hover:border-ai/40">
          <Package className="w-4 h-4 text-ai shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-bold truncate">{i.listing_title}</div>
            <div className="text-xs text-ink-dim">Installed · {i.price_paid > 0 ? `$${i.price_paid}` : "Free"}</div>
          </div>
          <span className="text-xs text-ai font-semibold">Open →</span>
        </button>
      ))}
    </div>
  );
}

function ListingModal({ id, onClose, nav }) {
  const [l, setL] = useState(null);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    api.get(`/ai-builder/marketplace/${id}`).then(({ data }) => setL(data)).catch(() => { toast.error("Failed to load"); onClose(); });
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const install = async () => {
    setInstalling(true);
    try {
      const { data } = await api.post(`/ai-builder/marketplace/${id}/install`);
      toast.success("Installed to your workspace");
      onClose();
      nav(`/ai-builder/${data.employee_id}`);
    } catch (e) { toast.error(e?.response?.data?.detail || "Install failed"); }
    setInstalling(false);
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl bg-surface ring-1 ring-white/10 overflow-hidden max-h-[90vh] flex flex-col">
        <div className="flex items-center px-5 py-3.5 border-b border-white/10 shrink-0">
          <div className="text-sm font-bold flex-1">Marketplace listing</div>
          <button type="button" onClick={onClose} data-testid="mkt-modal-close" className="p-1 text-ink-dim hover:text-ink"><X className="w-4 h-4" /></button>
        </div>
        {!l ? (
          <div className="flex justify-center py-16"><Loader2 className="w-5 h-5 animate-spin text-ai" /></div>
        ) : (
          <>
            <div className="p-5 overflow-y-auto space-y-4">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-extrabold flex-1">{l.title}</h2>
                  <span className="font-bold text-ai">{l.price_usd > 0 ? `$${l.price_usd}` : "Free"}</span>
                </div>
                {l.tagline && <p className="text-sm text-ink-dim mt-0.5">{l.tagline}</p>}
                <div className="flex items-center gap-2 mt-2 text-[11px] text-ink-dim">
                  <span className="px-1.5 py-0.5 rounded bg-white/10">{l.category}</span>
                  <span className="flex items-center gap-1"><Download className="w-3 h-3" />{l.install_count || 0} installs</span>
                  <span>by {l.creator_name}</span>
                </div>
              </div>
              {l.description && <p className="text-sm text-ink whitespace-pre-wrap">{l.description}</p>}
              <div className="rounded-xl border border-white/10 bg-surface-2 p-4 space-y-2 text-sm">
                <div className="text-xs font-bold uppercase tracking-wide text-ink-dim mb-1">What you get</div>
                <Row icon={ShieldCheck} label={`Permission level: ${l.preview?.permission_level || "—"}`} />
                {l.preview?.tools?.length > 0 && <Row icon={Wrench} label={`Tools: ${l.preview.tools.join(", ")}`} />}
                {l.preview?.escalation_count > 0 && <Row icon={AlertTriangle} label={`${l.preview.escalation_count} escalation rule(s)`} />}
                {l.preview?.has_style_profile && <Row icon={Star} label="Trained voice / style profile" />}
                {l.preview?.shares_knowledge ? (
                  <Row icon={BookOpen} label={`Includes ${l.preview.document_count} doc(s) + ${l.preview.example_count} example(s)`} />
                ) : (
                  <Row icon={BookOpen} label="Profile & settings only (creator's private knowledge not shared)" muted />
                )}
              </div>
              {l.preview?.responsibilities?.length > 0 && (
                <div>
                  <div className="text-xs font-bold uppercase tracking-wide text-ink-dim mb-1.5">Responsibilities</div>
                  <ul className="space-y-1">
                    {l.preview.responsibilities.slice(0, 6).map((r) => <li key={r} className="text-sm text-ink-dim flex gap-1.5"><span className="text-ai">•</span>{r}</li>)}
                  </ul>
                </div>
              )}
            </div>
            <div className="px-5 py-3.5 border-t border-white/10 shrink-0">
              {l.installed ? (
                <div className="flex items-center justify-center gap-2 h-10 rounded-full bg-emerald-500/15 text-emerald-300 font-bold text-sm"><CheckCircle2 className="w-4 h-4" /> Installed</div>
              ) : l.is_mine ? (
                <div className="text-center text-xs text-ink-dim">This is your own listing.</div>
              ) : (
                <button type="button" onClick={install} disabled={installing} data-testid="mkt-install-btn"
                  className="w-full h-10 rounded-full bg-ai text-black font-bold text-sm disabled:opacity-50 inline-flex items-center justify-center gap-2">
                  {installing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                  {l.price_usd > 0 ? `Install · $${l.price_usd}` : "Install for free"}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Row({ icon: Icon, label, muted }) {
  return (
    <div className={`flex items-center gap-2 ${muted ? "text-ink-dim" : "text-ink"}`}>
      <Icon className="w-4 h-4 text-ai shrink-0" /><span className="text-sm">{label}</span>
    </div>
  );
}
