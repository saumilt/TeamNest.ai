import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import {
  Zap, Play, Pause, Clock, GitBranch, Wand2, X, AlertTriangle, CheckCircle2,
  Activity as ActivityIcon, Sparkles, ArrowRight, ShieldCheck, XCircle, Lightbulb,
} from "lucide-react";

const RISK = {
  low: { label: "Low risk", cls: "text-emerald-300 border-emerald-400/30 bg-emerald-500/10" },
  medium: { label: "Approval recommended", cls: "text-amber-300 border-amber-400/30 bg-amber-500/10" },
  high: { label: "Approval required", cls: "text-red-300 border-red-400/30 bg-red-500/10" },
};

const STEP_ICON = { get: GitBranch, ai: Sparkles, post: ArrowRight, app: Zap, notify: ActivityIcon, condition: AlertTriangle };

function StatCard({ label, value, tint }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#121214] p-4" data-testid={`autom-stat-${label.toLowerCase().replace(/\s+/g, "-")}`}>
      <div className={`font-display text-3xl font-bold tracking-tight ${tint || ""}`}>{value}</div>
      <div className="text-[11px] font-mono uppercase tracking-widest text-zinc-500 mt-1">{label}</div>
    </div>
  );
}

export default function Automations() {
  const [params] = useSearchParams();
  const { user } = useAuth();
  const isAdmin = ["owner", "admin"].includes(user?.role);
  const [stats, setStats] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [items, setItems] = useState([]);
  const [chats, setChats] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [pending, setPending] = useState([]);
  const [insights, setInsights] = useState({ by_automation: {}, workspace: null });
  const [prompt, setPrompt] = useState(params.get("prompt") || "");
  const [plan, setPlan] = useState(null);
  const [parsing, setParsing] = useState(false);
  const [targetChatId, setTargetChatId] = useState("");
  const [saving, setSaving] = useState(false);
  const [detail, setDetail] = useState(null);
  const [actingId, setActingId] = useState(null);

  const load = () => {
    api.get("/automations").then(({ data }) => setItems(data.items || [])).catch(() => {});
    api.get("/automations/stats").then(({ data }) => setStats(data)).catch(() => {});
    api.get("/automations/suggestions").then(({ data }) => setSuggestions(data.suggestions || [])).catch(() => {});
    api.get("/automations/pending").then(({ data }) => setPending(data.items || [])).catch(() => {});
    api.get("/automations/insights").then(({ data }) => setInsights(data || { by_automation: {}, workspace: null })).catch(() => {});
  };

  useEffect(() => {
    load();
    api.get("/automations/templates").then(({ data }) => setTemplates(data.templates || [])).catch(() => {});
    api.get("/chats").then(({ data }) => {
      setChats(data || []);
      const ai = (data || []).find((c) => c.type === "personal_ai");
      setTargetChatId(ai?.id || (data || [])[0]?.id || "");
    }).catch(() => {});
  }, []);

  const applySuggestion = (s) => {
    setPrompt(s.prompt);
    setPlan(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const decide = async (runId, action) => {
    setActingId(runId);
    try {
      const { data } = await api.post(`/automations/runs/${runId}/${action}`);
      toast.success(action === "approve" ? `Approved · run ${data.status}` : "Automation rejected");
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Couldn't update approval");
    } finally {
      setActingId(null);
    }
  };

  const generate = async () => {
    if (!prompt.trim()) return;
    setParsing(true);
    setPlan(null);
    try {
      const { data } = await api.post("/automations/parse", { prompt });
      setPlan(data);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Couldn't parse that");
    } finally {
      setParsing(false);
    }
  };

  const save = async (runNow) => {
    if (!plan) return;
    setSaving(true);
    try {
      const { data: created } = await api.post("/automations", { ...plan, target_chat_id: targetChatId || null });
      if (runNow) {
        const { data: run } = await api.post(`/automations/${created.id}/run`);
        toast.success(`Test run: ${run.status}`);
      } else {
        toast.success("Automation activated");
      }
      setPlan(null);
      setPrompt("");
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Couldn't save");
    } finally {
      setSaving(false);
    }
  };

  const runNow = async (id) => {
    try {
      const { data } = await api.post(`/automations/${id}/run`);
      toast.success(`Run finished: ${data.status}`);
      load();
      openDetail(id);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Run failed");
    }
  };

  const togglePause = async (a) => {
    const status = a.status === "active" ? "paused" : "active";
    await api.patch(`/automations/${a.id}`, { status }).catch(() => {});
    load();
  };

  const openDetail = async (id) => {
    try {
      const { data } = await api.get(`/automations/${id}`);
      setDetail(data);
    } catch { /* ignore */ }
  };

  const byCategory = useMemo(() => {
    const g = {};
    templates.forEach((t) => { (g[t.category] = g[t.category] || []).push(t); });
    return g;
  }, [templates]);

  return (
    <div className="p-6 lg:p-10 max-w-5xl" data-testid="automations-page">
      <div className="label-mono mb-2">AI / AUTOMATIONS · WATCH</div>
      <h1 className="font-display text-3xl lg:text-4xl font-bold tracking-tighter mb-1">Automations</h1>
      <p className="text-zinc-500 mb-6">Tell TeamNest what should happen automatically — in plain English.</p>

      {/* Dashboard */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-8" data-testid="automations-stats">
        <StatCard label="Running" value={stats?.running ?? "—"} tint="text-emerald-400" />
        <StatCard label="Needs Approval" value={stats?.needs_approval ?? "—"} tint="text-amber-400" />
        <StatCard label="Failed" value={stats?.failed ?? "—"} tint="text-red-400" />
        <StatCard label="Saved Hours" value={stats?.saved_hours ?? "—"} />
        <StatCard label="AI Credits" value={stats?.credits_used ?? "—"} />
      </div>

      {/* Pending approvals */}
      {pending.length > 0 && (
        <div className="rounded-2xl border border-amber-400/30 bg-amber-500/[0.06] p-5 mb-8" data-testid="automations-pending">
          <div className="flex items-center gap-2 mb-3">
            <ShieldCheck className="w-5 h-5 text-amber-400" />
            <h2 className="text-lg font-bold">Waiting for approval</h2>
            <span className="text-[11px] font-mono text-amber-300">{pending.length}</span>
          </div>
          <p className="text-zinc-500 text-sm mb-4">These higher-risk automations paused before running. {isAdmin ? "Approve to run them now." : "An owner or admin needs to approve them."}</p>
          <div className="space-y-2">
            {pending.map((p) => (
              <div key={p.id} data-testid={`pending-${p.id}`} className="rounded-xl border border-white/10 bg-[#121214] p-4 flex items-center gap-3">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-zinc-100 truncate">{p.automation_name}</div>
                  <div className="text-[11px] text-zinc-500 truncate">Triggered {p.trigger_source} · {new Date(p.started_at).toLocaleString()}</div>
                </div>
                {isAdmin ? (
                  <>
                    <button data-testid={`pending-approve-${p.id}`} disabled={actingId === p.id} onClick={() => decide(p.id, "approve")} className="inline-flex items-center gap-1.5 bg-emerald-500 text-black hover:bg-emerald-400 disabled:opacity-60 text-xs font-semibold rounded-sm px-3 py-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Approve
                    </button>
                    <button data-testid={`pending-reject-${p.id}`} disabled={actingId === p.id} onClick={() => decide(p.id, "reject")} className="inline-flex items-center gap-1.5 border border-white/10 text-zinc-300 hover:bg-white/5 disabled:opacity-60 text-xs font-semibold rounded-sm px-3 py-1.5">
                      <XCircle className="w-3.5 h-3.5" /> Reject
                    </button>
                  </>
                ) : (
                  <span className="text-[10px] font-mono uppercase tracking-widest text-amber-300 border border-amber-400/30 rounded px-2 py-1">Needs admin</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Builder */}
      <div className="rounded-2xl border border-yellow-400/30 bg-gradient-to-br from-yellow-400/[0.06] to-transparent p-5 lg:p-6 mb-8">
        <div className="flex items-center gap-2 mb-3">
          <Wand2 className="w-5 h-5 text-yellow-400" />
          <h2 className="text-lg font-bold">What would you like TeamNest to automate?</h2>
        </div>
        <textarea
          data-testid="automation-prompt"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="e.g. Every Monday at 8 AM summarize overdue tasks and post the report in Operations."
          rows={2}
          className="w-full bg-[#0a0a0a] border border-white/10 rounded-sm px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-yellow-400/40 resize-none"
        />
        <div className="flex flex-wrap gap-2 mt-3">
          <button
            data-testid="automation-generate"
            onClick={generate}
            disabled={parsing || !prompt.trim()}
            className="bg-yellow-500 text-black hover:bg-yellow-400 disabled:opacity-60 text-sm font-semibold rounded-sm px-4 py-2 inline-flex items-center gap-2"
          >
            <Sparkles className="w-4 h-4" /> {parsing ? "Thinking…" : "Generate plan"}
          </button>
        </div>

        {plan && (
          <div className="mt-5 border-t border-white/10 pt-4" data-testid="automation-plan">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="font-semibold text-zinc-100">{plan.name}</div>
              <span className={`text-[10px] font-mono uppercase tracking-widest border rounded px-2 py-1 ${RISK[plan.risk]?.cls || RISK.low.cls}`}>
                {RISK[plan.risk]?.label || plan.risk}
              </span>
            </div>

            <div className="mt-3 space-y-2">
              <PlanRow badge="WHEN" icon={Clock} text={plan.trigger?.label} />
              {plan.steps?.map((s, i) => {
                const I = STEP_ICON[s.kind] || Zap;
                return <PlanRow key={i} badge={s.kind === "get" ? "GET" : "THEN"} icon={I} text={s.label} />;
              })}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <label className="text-[11px] font-mono uppercase tracking-widest text-zinc-500">Post to</label>
              <select
                data-testid="automation-target-chat"
                value={targetChatId}
                onChange={(e) => setTargetChatId(e.target.value)}
                className="bg-[#0a0a0a] border border-white/10 rounded-sm px-2 py-1.5 text-sm text-zinc-200"
              >
                {chats.map((c) => (
                  <option key={c.id} value={c.id}>{c.name || (c.type === "personal_ai" ? "My AI Assistant" : "Chat")}</option>
                ))}
              </select>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button data-testid="automation-activate" onClick={() => save(false)} disabled={saving} className="bg-white text-black hover:bg-zinc-200 disabled:opacity-60 text-sm font-semibold rounded-sm px-4 py-2 inline-flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" /> Activate
              </button>
              <button data-testid="automation-test" onClick={() => save(true)} disabled={saving} className="border border-yellow-400/40 text-yellow-300 hover:bg-yellow-500/10 disabled:opacity-60 text-sm font-semibold rounded-sm px-4 py-2 inline-flex items-center gap-2">
                <Play className="w-4 h-4" /> Test now
              </button>
              <button data-testid="automation-discard" onClick={() => setPlan(null)} className="text-zinc-500 hover:text-white text-sm px-3 py-2">Discard</button>
            </div>
          </div>
        )}
      </div>

      {/* Suggested automations */}
      {suggestions.length > 0 && (
        <div className="mb-10" data-testid="automations-suggestions">
          <div className="flex items-center gap-2 mb-3">
            <Lightbulb className="w-4 h-4 text-yellow-400" />
            <div className="label-mono">SUGGESTED FOR YOU</div>
          </div>
          <div className="flex flex-wrap gap-2">
            {suggestions.map((s) => (
              <button
                key={s.key}
                data-testid={`suggestion-${s.key}`}
                onClick={() => applySuggestion(s)}
                className="text-left rounded-xl border border-yellow-400/20 bg-gradient-to-br from-yellow-400/[0.05] to-transparent hover:border-yellow-400/50 p-4 w-full sm:w-[320px] transition-colors"
              >
                <div className="text-sm font-semibold text-zinc-100">{s.title}</div>
                <div className="text-[12px] text-zinc-400 mt-1">{s.reason}</div>
                <div className="text-[11px] text-yellow-400 mt-2 inline-flex items-center gap-1"><Sparkles className="w-3 h-3" /> Set this up</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Templates */}
      <div className="label-mono mb-3">TEMPLATE GALLERY</div>
      <div className="space-y-4 mb-10">
        {Object.entries(byCategory).map(([cat, list]) => (
          <div key={cat}>
            <div className="text-[11px] font-mono uppercase tracking-widest text-zinc-600 mb-2">{cat}</div>
            <div className="flex flex-wrap gap-2">
              {list.map((t) => (
                <button
                  key={t.key}
                  data-testid={`template-${t.key}`}
                  onClick={() => { setPrompt(t.prompt); setPlan(null); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                  className="text-left rounded-xl border border-white/10 bg-[#121214] hover:border-yellow-400/40 hover:bg-white/[0.03] p-3 w-full sm:w-[300px] transition-colors"
                >
                  <div className="text-sm font-semibold text-zinc-100">{t.title}</div>
                  <div className="text-[11px] text-zinc-500 mt-0.5 line-clamp-2">{t.prompt}</div>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Existing automations */}
      <div className="label-mono mb-3">YOUR AUTOMATIONS</div>
      {items.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-[#121214] p-8 text-center" data-testid="automations-empty">
          <Zap className="w-8 h-8 text-zinc-600 mx-auto mb-3" />
          <div className="text-zinc-300 font-semibold">No automations yet</div>
          <div className="text-zinc-500 text-sm mt-1">Describe one above or start from a template.</div>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((a) => (
            <div key={a.id} data-testid={`automation-${a.id}`} className="rounded-xl border border-white/10 bg-[#121214] p-4 flex items-center gap-3">
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${a.status === "active" ? "bg-yellow-400 text-black" : "bg-white/5 text-zinc-400"}`}>
                <Zap className="w-4 h-4" />
              </div>
              <button className="min-w-0 flex-1 text-left" onClick={() => openDetail(a.id)} data-testid={`automation-open-${a.id}`}>
                <div className="text-sm font-semibold text-zinc-100 truncate">{a.name}</div>
                <div className="text-[11px] text-zinc-500 truncate">
                  {a.trigger?.label} · {a.status}
                  {a.status === "active" && a.next_run_at && a.trigger?.type === "scheduled" && (
                    <span className="text-zinc-600"> · next {new Date(a.next_run_at).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                  )}
                </div>
              </button>
              <span className={`hidden sm:inline text-[9px] font-mono uppercase tracking-widest border rounded px-2 py-1 ${RISK[a.risk]?.cls || RISK.low.cls}`}>{a.risk}</span>
              {insights.by_automation[a.id]?.runs > 0 && (
                <span className="hidden md:inline text-[10px] text-zinc-500 font-mono" data-testid={`autom-insight-${a.id}`}>
                  {insights.by_automation[a.id].runs} runs · {insights.by_automation[a.id].success_rate}% ok · ~{insights.by_automation[a.id].saved_hours}h
                </span>
              )}
              <button data-testid={`automation-run-${a.id}`} onClick={() => runNow(a.id)} title="Run now" className="p-2 rounded-lg hover:bg-white/10 text-yellow-300"><Play className="w-4 h-4" /></button>
              <button data-testid={`automation-toggle-${a.id}`} onClick={() => togglePause(a)} title={a.status === "active" ? "Pause" : "Activate"} className="p-2 rounded-lg hover:bg-white/10 text-zinc-300">
                {a.status === "active" ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              </button>
            </div>
          ))}
        </div>
      )}

      {detail && <DetailModal detail={detail} insight={insights.by_automation[detail.automation?.id]} onClose={() => setDetail(null)} />}
    </div>
  );
}

function PlanRow({ badge, icon: Icon, text }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-[9px] font-mono uppercase tracking-widest text-zinc-500 w-11 shrink-0">{badge}</span>
      <div className="w-7 h-7 rounded-lg bg-white/5 flex items-center justify-center shrink-0 text-zinc-300"><Icon className="w-3.5 h-3.5" /></div>
      <span className="text-sm text-zinc-200">{text}</span>
    </div>
  );
}

function Sparkline({ series = [], className = "" }) {
  const max = Math.max(1, ...series);
  return (
    <div className={`flex items-end gap-0.5 h-8 ${className}`} data-testid="autom-sparkline">
      {series.map((v, i) => (
        <div key={i} className="flex-1 bg-yellow-400/70 rounded-sm min-w-[3px]" style={{ height: `${Math.max(6, (v / max) * 100)}%` }} title={`${v} run(s)`} />
      ))}
    </div>
  );
}

function DetailModal({ detail, insight, onClose }) {
  const { automation, runs } = detail;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-6" data-testid="automation-detail" onClick={onClose}>
      <div className="bg-[#0a0a0a] border border-white/10 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-[#0a0a0a] border-b border-white/10 px-5 py-4 flex items-center justify-between">
          <div className="font-bold">{automation.name}</div>
          <button onClick={onClose} data-testid="automation-detail-close" className="text-zinc-500 hover:text-white"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5">
          {insight && insight.runs > 0 && (
            <div className="mb-5 rounded-xl border border-white/10 bg-[#121214] p-4" data-testid="automation-insights">
              <div className="label-mono mb-3">INSIGHTS</div>
              <div className="grid grid-cols-3 gap-3 mb-3">
                <div><div className="font-display text-2xl font-bold">{insight.runs}</div><div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">Runs</div></div>
                <div><div className="font-display text-2xl font-bold text-emerald-400">{insight.success_rate}%</div><div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">Success</div></div>
                <div><div className="font-display text-2xl font-bold text-yellow-400">~{insight.saved_hours}h</div><div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">Saved</div></div>
              </div>
              <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-600 mb-1">Last 7 days</div>
              <Sparkline series={insight.series} />
            </div>
          )}
          <div className="label-mono mb-2">EXECUTION HISTORY</div>
          {(!runs || runs.length === 0) && <div className="text-zinc-500 text-sm">No runs yet.</div>}
          <div className="space-y-4">
            {(runs || []).map((r) => (
              <div key={r.id} className="rounded-xl border border-white/10 p-3" data-testid={`run-${r.id}`}>
                <div className="flex items-center gap-2 mb-2">
                  <span className={`text-[9px] font-mono uppercase tracking-widest px-2 py-0.5 rounded ${
                    r.status === "success" ? "bg-emerald-500/15 text-emerald-300"
                    : r.status === "failed" ? "bg-red-500/15 text-red-300"
                    : "bg-amber-500/15 text-amber-300"}`}>{r.status}</span>
                  <span className="text-[11px] text-zinc-500">{new Date(r.started_at).toLocaleString()}</span>
                </div>
                <div className="text-[12px] text-zinc-300 mb-2 italic">{r.reasoning_summary}</div>
                <div className="space-y-1">
                  {(r.timeline || []).map((t, i) => (
                    <div key={i} className="flex items-start gap-2 text-[12px] text-zinc-400">
                      <span className="text-zinc-600 font-mono text-[10px] mt-0.5">{(t.at || "").slice(11, 16)}</span>
                      <span>{t.message}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
