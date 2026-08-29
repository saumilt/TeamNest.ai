import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  Blocks, Search, Mail, Building2, MessageSquare, FolderOpen, Zap, Loader2,
  Check, Eye, PencilLine, X, Plug, ArrowUpRight, Copy, ShieldCheck,
} from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

const CAT_ICON = { Email: Mail, CRM: Building2, Chat: MessageSquare, Files: FolderOpen, Automation: Zap };

function PermPill({ p }) {
  const isAct = p.type === "act";
  const Icon = isAct ? PencilLine : Eye;
  return (
    <span
      title={p.plain}
      data-testid={`perm-${p.type}`}
      className={`inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider rounded px-2 py-0.5 border ${
        isAct ? "text-amber-300 border-amber-400/30 bg-amber-500/10" : "text-sky-300 border-sky-400/30 bg-sky-500/10"
      }`}
    >
      <Icon className="w-3 h-3" /> {isAct ? "Act" : "Read"}
    </span>
  );
}

export default function AppsPage() {
  const { user } = useAuth();
  const isAdmin = ["owner", "admin"].includes(user?.role);
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const [apps, setApps] = useState([]);
  const [categories, setCategories] = useState([]);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("All");
  const [loading, setLoading] = useState(true);
  const [zapier, setZapier] = useState(null);

  const load = useCallback(() => {
    api.get("/apps").then(({ data }) => {
      setApps(data.apps || []);
      setCategories(data.categories || []);
    }).catch(() => toast.error("Failed to load apps")).finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (params.get("connected")) { toast.success("App connected"); setParams({}, { replace: true }); load(); }
    if (params.get("error")) { toast.error("Connection failed or cancelled"); setParams({}, { replace: true }); }
  }, [params, setParams, load]);

  const connect = async (app) => {
    if (app.connect_via === "webhook") { setZapier({ open: true }); return; }
    if (!app.oauth_start) return;
    try {
      const startPath = app.oauth_start.replace(/^\/api(?=\/)/, "");
      const { data: d } = await api.get(startPath);
      window.location.href = d.url;
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not start connection");
    }
  };

  const manage = (app) => {
    if (app.key === "zapier") { setZapier({ open: true }); return; }
    nav("/connectors");
  };

  const filtered = useMemo(() => {
    let list = apps;
    if (cat !== "All") list = list.filter((a) => a.category === cat);
    if (q.trim()) {
      const ql = q.toLowerCase();
      list = list.filter((a) => a.name.toLowerCase().includes(ql) || a.description.toLowerCase().includes(ql));
    }
    return list;
  }, [apps, cat, q]);

  const grouped = useMemo(() => {
    const g = {};
    filtered.forEach((a) => { (g[a.category] ||= []).push(a); });
    return g;
  }, [filtered]);

  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-7 h-7 animate-spin text-yellow-400" /></div>;

  return (
    <div className="p-6 lg:p-10 max-w-5xl" data-testid="apps-page">
      <div className="label-mono mb-2">CONNECT · APPS</div>
      <div className="flex items-center gap-3 mb-1">
        <Blocks className="w-6 h-6 text-yellow-400" />
        <h1 className="font-display text-3xl lg:text-4xl font-bold tracking-tighter">Apps</h1>
      </div>
      <p className="text-zinc-500 mb-6">Connect the tools your team already uses. TeamNest asks in plain English exactly what it can <span className="text-sky-300">read</span> and <span className="text-amber-300">act</span> on — nothing more.</p>

      {/* Search + categories */}
      <div className="relative mb-4">
        <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          data-testid="apps-search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search apps…"
          className="w-full bg-[#0a0a0a] border border-white/10 rounded-lg pl-9 pr-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-yellow-400/40"
        />
      </div>
      <div className="flex flex-wrap gap-2 mb-8" data-testid="apps-categories">
        {["All", ...categories].map((c) => (
          <button
            key={c}
            data-testid={`apps-cat-${c.toLowerCase()}`}
            onClick={() => setCat(c)}
            className={`text-xs font-semibold rounded-full px-3 py-1.5 border transition-colors ${
              cat === c ? "bg-yellow-500 text-black border-yellow-500" : "border-white/10 text-zinc-400 hover:text-white hover:border-white/30"
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-[#121214] p-8 text-center" data-testid="apps-empty">
          <Blocks className="w-8 h-8 text-zinc-600 mx-auto mb-3" />
          <div className="text-zinc-300 font-semibold">No apps match that search</div>
        </div>
      ) : (
        Object.entries(grouped).map(([category, list]) => {
          const CatIcon = CAT_ICON[category] || Plug;
          return (
            <section key={category} className="mb-8">
              <h2 className="text-sm font-bold text-zinc-200 mb-3 flex items-center gap-2"><CatIcon className="w-4 h-4 text-yellow-400" /> {category}</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {list.map((app) => (
                  <div key={app.key} data-testid={`app-${app.key}`} className="rounded-2xl border border-white/10 bg-[#121214] p-4 flex flex-col">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-semibold text-zinc-100 flex items-center gap-2 flex-wrap">
                          {app.name}
                          <span className={`text-[9px] font-mono uppercase tracking-widest rounded px-1.5 py-0.5 border ${
                            app.kind === "partner" ? "text-fuchsia-300 border-fuchsia-400/30 bg-fuchsia-500/10" : "text-zinc-400 border-white/10 bg-white/5"
                          }`}>{app.kind}</span>
                          {app.connected && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 inline-flex items-center gap-1"><Check className="w-3 h-3" /> Connected</span>
                          )}
                        </div>
                        <p className="text-xs text-zinc-500 mt-1">{app.description}</p>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-1.5 mt-3">
                      {app.permissions.map((p, i) => <PermPill key={i} p={p} />)}
                    </div>

                    <div className="flex flex-wrap gap-2 mt-4 pt-3 border-t border-white/5">
                      {app.connected ? (
                        <button data-testid={`app-manage-${app.key}`} onClick={() => manage(app)} className="text-xs px-3 py-1.5 rounded-lg border border-white/10 text-zinc-300 hover:text-white hover:border-white/30">Manage</button>
                      ) : app.live ? (
                        <button data-testid={`app-connect-${app.key}`} onClick={() => connect(app)} className="text-xs px-3 py-1.5 rounded-lg bg-yellow-500 text-black font-semibold inline-flex items-center gap-1"><Plug className="w-3.5 h-3.5" /> Connect</button>
                      ) : (
                        <button disabled data-testid={`app-connect-${app.key}`} className="text-xs px-3 py-1.5 rounded-lg border border-white/10 text-zinc-500 opacity-60 cursor-not-allowed">Coming soon</button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          );
        })
      )}

      {zapier?.open && <ZapierModal isAdmin={isAdmin} onClose={() => { setZapier(null); load(); }} />}
    </div>
  );
}

function ZapierModal({ isAdmin, onClose }) {
  const [conn, setConn] = useState(null);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    api.get("/apps/zapier").then(({ data }) => { setConn(data); setUrl(data.outbound_url || ""); }).catch(() => {});
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  const save = async () => {
    setBusy(true);
    try {
      const { data } = await api.post("/apps/zapier/connect", { catch_hook_url: url || null });
      setConn(data);
      toast.success("Zapier connected");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Couldn't connect Zapier");
    } finally { setBusy(false); }
  };

  const test = async () => {
    setBusy(true);
    try {
      await api.post("/apps/zapier/test");
      toast.success("Test event sent to Zapier");
      refresh();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Test failed");
    } finally { setBusy(false); }
  };

  const disconnect = async () => {
    setBusy(true);
    try { await api.post("/apps/zapier/disconnect"); toast.success("Disconnected"); onClose(); }
    catch { toast.error("Failed to disconnect"); } finally { setBusy(false); }
  };

  const inboundAbs = conn?.inbound_path
    ? `${process.env.REACT_APP_BACKEND_URL}${conn.inbound_path}`
    : "";
  const copy = (t) => { navigator.clipboard?.writeText(t); toast.success("Copied"); };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-6" data-testid="zapier-modal" onClick={onClose}>
      <div className="bg-[#0a0a0a] border border-white/10 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[88vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-[#0a0a0a] border-b border-white/10 px-5 py-4 flex items-center justify-between">
          <div className="font-bold flex items-center gap-2"><Zap className="w-4 h-4 text-fuchsia-400" /> Zapier</div>
          <button onClick={onClose} data-testid="zapier-close" className="text-zinc-500 hover:text-white"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-5">
          <p className="text-sm text-zinc-400">Connect TeamNest to 6,000+ apps — no API keys needed, just a Zapier account. <span className="text-zinc-500">(“Webhooks by Zapier” is a Zapier premium app on Starter+.)</span></p>

          {!isAdmin && <div className="rounded-lg bg-amber-500/10 border border-amber-400/30 text-amber-200 text-xs px-3 py-2">Only an owner or admin can connect Zapier for the workspace.</div>}

          {/* Outbound */}
          <div>
            <div className="text-[11px] font-mono uppercase tracking-widest text-amber-300 mb-1 flex items-center gap-1"><PencilLine className="w-3 h-3" /> Act — send events out</div>
            <p className="text-xs text-zinc-500 mb-2">In Zapier, make a Zap with a <b>Webhooks by Zapier → Catch Hook</b> trigger, copy its URL, and paste it here.</p>
            <input
              data-testid="zapier-catch-url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={!isAdmin}
              placeholder="https://hooks.zapier.com/hooks/catch/…"
              className="w-full bg-[#121214] border border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-yellow-400/40 disabled:opacity-50"
            />
            <div className="flex gap-2 mt-2">
              <button data-testid="zapier-save" onClick={save} disabled={busy || !isAdmin} className="text-xs px-3 py-1.5 rounded-lg bg-yellow-500 text-black font-semibold disabled:opacity-60">{conn?.connected ? "Update" : "Connect"}</button>
              {conn?.has_outbound && <button data-testid="zapier-test" onClick={test} disabled={busy} className="text-xs px-3 py-1.5 rounded-lg border border-white/10 text-zinc-300 hover:text-white disabled:opacity-60">Send test event</button>}
            </div>
          </div>

          {/* Inbound */}
          {conn?.connected && conn?.inbound_path && (
            <div>
              <div className="text-[11px] font-mono uppercase tracking-widest text-sky-300 mb-1 flex items-center gap-1"><Eye className="w-3 h-3" /> Read — receive events in</div>
              <p className="text-xs text-zinc-500 mb-2">In Zapier, add a <b>Webhooks by Zapier → POST</b> action pointing at this URL (it already includes your secret). Messages land in your AI Assistant chat.</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-[11px] text-zinc-300 bg-[#121214] border border-white/10 rounded-lg px-2 py-2 truncate" data-testid="zapier-inbound-url">{inboundAbs}</code>
                <button data-testid="zapier-copy-inbound" onClick={() => copy(inboundAbs)} className="p-2 rounded-lg border border-white/10 text-zinc-300 hover:text-white"><Copy className="w-3.5 h-3.5" /></button>
              </div>
            </div>
          )}

          {conn?.connected && (
            <div className="flex items-center justify-between text-xs text-zinc-500 pt-2 border-t border-white/5" data-testid="zapier-stats">
              <span className="inline-flex items-center gap-1"><ShieldCheck className="w-3 h-3 text-emerald-400" /> Connected · {conn.events_sent} sent · {conn.events_received} received</span>
              {isAdmin && <button data-testid="zapier-disconnect" onClick={disconnect} disabled={busy} className="text-red-300 hover:text-red-200 inline-flex items-center gap-1">Disconnect <ArrowUpRight className="w-3 h-3" /></button>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
