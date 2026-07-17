import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  Building2, Users, Briefcase, ShieldAlert, Loader2, Plus, X, ArrowRight, TrendingUp,
  HardDrive, CreditCard, Package, ChevronDown, Activity, Loader,
  CheckCircle2, XCircle, Inbox, Pencil,
} from "lucide-react";
import { api } from "@/lib/api";

const RISK_COLOR = {
  Critical: "bg-red-500/15 text-red-400 border-red-500/30",
  High: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  Medium: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  Low: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
};

const BREAKDOWN_LABELS = {
  role_description_score: "Role clarity", sop_score: "SOPs", workflow_score: "Workflows",
  recurring_task_score: "Recurring tasks", relationship_score: "Relationships",
  decision_score: "Decisions", communication_score: "Communication", expertise_score: "Expertise",
  successor_score: "Successor", review_score: "Review freshness",
};

function fmtBytes(b) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 ** 2) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 ** 3) return `${(b / 1024 ** 2).toFixed(2)} MB`;
  return `${(b / 1024 ** 3).toFixed(3)} GB`;
}

export function RiskBadge({ level }) {
  return <span className={`text-[10px] px-2 py-0.5 rounded-full border ${RISK_COLOR[level] || "bg-white/10 text-ink-mute border-line"}`} data-testid="risk-badge">{level || "—"}</span>;
}

export function ContinuityBar({ score }) {
  const color = score >= 80 ? "bg-emerald-500" : score >= 60 ? "bg-amber-400" : score >= 40 ? "bg-orange-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2 min-w-[120px]">
      <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-xs text-ink-dim tabular-nums">{score}%</span>
    </div>
  );
}

function Stat({ label, value, testid }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-4" data-testid={testid}>
      <div className="text-[11px] uppercase tracking-widest text-ink-mute mb-1">{label}</div>
      <div className="text-2xl font-bold text-ink">{value}</div>
    </div>
  );
}

function AddEmployeeModal({ roles, onClose, onAdded }) {
  const [form, setForm] = useState({ employee_name: "", employee_email: "", role_id: roles[0]?.id || "", employment_status: "Active", unique_knowledge_level: "Medium" });
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!form.employee_name || !form.employee_email) return;
    setBusy(true);
    try { await api.post("/enterprise/people", form); toast.success("Employee added"); onAdded(); }
    catch (e) { toast.error(e?.response?.data?.detail || "Failed"); } finally { setBusy(false); }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" data-testid="add-employee-modal">
      <div className="w-full max-w-md rounded-2xl border border-line bg-bg p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-ink">Add employee</h3>
          <button onClick={onClose} className="text-ink-mute hover:text-ink"><X className="w-5 h-5" /></button>
        </div>
        {[["employee_name", "Full name"], ["employee_email", "Corporate email"]].map(([k, l]) => (
          <div key={k} className="mb-3">
            <label className="text-[11px] uppercase tracking-widest text-ink-mute">{l}</label>
            <input value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} data-testid={`emp-${k}`}
              className="w-full mt-1 h-11 rounded-xl bg-surface border border-line px-3 text-ink text-sm" />
          </div>
        ))}
        <label className="text-[11px] uppercase tracking-widest text-ink-mute">Role</label>
        <select value={form.role_id} onChange={(e) => setForm({ ...form, role_id: e.target.value })} data-testid="emp-role"
          className="w-full mt-1 mb-4 h-11 rounded-xl bg-surface border border-line px-3 text-ink text-sm">
          {roles.map((r) => <option key={r.id} value={r.id}>{r.role_name}</option>)}
        </select>
        <button onClick={submit} disabled={busy} data-testid="emp-submit"
          className="w-full h-11 rounded-xl bg-ai text-black font-bold flex items-center justify-center gap-2 disabled:opacity-60">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Add employee
        </button>
      </div>
    </div>
  );
}

const FLAG_COLOR = {
  "Departing": "bg-orange-500/15 text-orange-400",
  "Single-person dependency": "bg-red-500/15 text-red-400",
  "No successor": "bg-amber-500/15 text-amber-300",
  "No backup": "bg-white/10 text-ink-mute",
  "High unique knowledge": "bg-ai-tint text-ai",
};

function ReviewQueue({ onDecided }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [edit, setEdit] = useState({});
  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await api.get("/enterprise/memories/review"); setItems(r.data.memories || []); onDecided?.(r.data.pending_count || 0); }
    catch { toast.error("Failed to load review queue"); } finally { setLoading(false); }
  }, [onDecided]);
  useEffect(() => { load(); }, [load]);

  const decide = async (m, decision) => {
    const e = edit[m.id] || {};
    try {
      await api.post(`/enterprise/memories/${m.id}/decide`, {
        decision, title: e.title, content: e.content,
      });
      toast.success(decision === "approve" ? "Approved — now in role knowledge" : "Rejected");
      setItems((xs) => {
        const next = xs.filter((x) => x.id !== m.id);
        onDecided?.(next.length);
        return next;
      });
    } catch { toast.error("Failed"); }
  };

  if (loading) return <div className="py-10 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-ai" /></div>;
  if (items.length === 0) return (
    <div className="text-center py-16" data-testid="review-empty">
      <Inbox className="w-10 h-10 text-ink-mute mx-auto mb-3" />
      <p className="text-sm text-ink-dim">No proposed knowledge to review.</p>
      <p className="text-xs text-ink-mute mt-1">Capture knowledge from a chat or paste notes on a person&apos;s Knowledge tab.</p>
    </div>
  );

  return (
    <div className="space-y-3" data-testid="review-queue">
      <p className="text-xs text-ink-mute mb-2">Approve to add to the role&apos;s grounded knowledge (feeds Ask Role + handoffs). Content is anonymized on capture.</p>
      {items.map((m) => {
        const e = edit[m.id] || { title: m.title, content: m.content };
        return (
          <div key={m.id} className="rounded-2xl border border-line bg-surface p-4" data-testid={`review-${m.id}`}>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-ai-tint text-ai font-semibold">{m.role_name}</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 text-ink-dim">{m.memory_type}</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 text-ink-mute">{m.source_type}</span>
              <span className="text-[10px] text-ink-mute ml-auto">confidence {Math.round((m.confidence || 0) * 100)}%</span>
            </div>
            <input value={e.title} onChange={(ev) => setEdit({ ...edit, [m.id]: { ...e, title: ev.target.value } })}
              data-testid={`review-title-${m.id}`}
              className="w-full mb-2 h-9 rounded-lg bg-bg border border-line px-3 text-ink text-sm font-semibold" />
            <textarea value={e.content} onChange={(ev) => setEdit({ ...edit, [m.id]: { ...e, content: ev.target.value } })}
              data-testid={`review-content-${m.id}`} rows={3}
              className="w-full mb-3 rounded-lg bg-bg border border-line px-3 py-2 text-ink text-sm" />
            <div className="flex gap-2 justify-end">
              <button onClick={() => decide(m, "reject")} data-testid={`review-reject-${m.id}`}
                className="text-xs px-3 py-1.5 rounded-lg border border-red-500/40 text-red-400 hover:bg-red-500/10 flex items-center gap-1">
                <XCircle className="w-3.5 h-3.5" /> Reject</button>
              <button onClick={() => decide(m, "approve")} data-testid={`review-approve-${m.id}`}
                className="text-xs px-3 py-1.5 rounded-lg bg-ai text-black font-semibold flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> Approve</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function RiskDashboard() {
  const nav = useNavigate();
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(null);
  useEffect(() => { api.get("/enterprise/risk-dashboard").then((r) => setData(r.data)).catch(() => toast.error("Failed to load risk dashboard")); }, []);
  if (!data) return <div className="py-10 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-ai" /></div>;

  const distTotal = Object.values(data.distribution).reduce((a, b) => a + b, 0) || 1;
  const DIST_BAR = { Critical: "bg-red-500", High: "bg-orange-500", Medium: "bg-amber-400", Low: "bg-emerald-500" };

  return (
    <div className="space-y-6" data-testid="risk-dashboard">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Stat label="Roles mapped" value={data.summary.roles} testid="rd-roles" />
        <Stat label="At risk" value={data.summary.at_risk} testid="rd-atrisk" />
        <Stat label="Critical" value={data.summary.critical} testid="rd-critical" />
        <Stat label="Single-person deps" value={data.summary.single_person_deps} testid="rd-deps" />
        <Stat label="Avg continuity" value={`${data.summary.avg_continuity}%`} testid="rd-avg" />
      </div>

      <section>
        <h2 className="text-sm font-bold text-ink mb-3 flex items-center gap-2"><Activity className="w-4 h-4 text-ai" /> Risk distribution</h2>
        <div className="rounded-2xl border border-line bg-surface p-4">
          <div className="flex h-3 rounded-full overflow-hidden mb-3">
            {["Critical", "High", "Medium", "Low"].map((k) => (
              <div key={k} className={DIST_BAR[k]} style={{ width: `${(data.distribution[k] / distTotal) * 100}%` }} title={`${k}: ${data.distribution[k]}`} />
            ))}
          </div>
          <div className="flex flex-wrap gap-3 text-xs">
            {["Critical", "High", "Medium", "Low"].map((k) => (
              <span key={k} className="flex items-center gap-1.5 text-ink-dim"><span className={`w-2.5 h-2.5 rounded-full ${DIST_BAR[k]}`} /> {k} · {data.distribution[k]}</span>
            ))}
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-sm font-bold text-ink mb-3 flex items-center gap-2"><ShieldAlert className="w-4 h-4 text-ai" /> Expertise map</h2>
        <div className="space-y-2">
          {data.roles.map((r) => (
            <div key={r.role_id} className="rounded-2xl border border-line bg-surface" data-testid={`rd-role-${r.role_id}`}>
              <button onClick={() => setOpen(open === r.role_id ? null : r.role_id)} className="w-full text-left p-4 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-ink text-sm flex items-center gap-2"><Briefcase className="w-4 h-4 text-ai shrink-0" /> {r.role_name}</div>
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {r.flags.length === 0 && <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400">No dependency flags</span>}
                    {r.flags.map((f) => <span key={f} className={`text-[10px] px-2 py-0.5 rounded-full ${FLAG_COLOR[f] || "bg-white/10 text-ink-mute"}`}>{f}</span>)}
                  </div>
                </div>
                <ContinuityBar score={r.continuity_score} />
                <RiskBadge level={r.risk_level} />
                <ChevronDown className={`w-4 h-4 text-ink-mute transition-transform ${open === r.role_id ? "rotate-180" : ""}`} />
              </button>
              {open === r.role_id && (
                <div className="px-4 pb-4 border-t border-line pt-3" data-testid={`rd-breakdown-${r.role_id}`}>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
                    {Object.entries(r.breakdown).map(([k, v]) => (
                      <div key={k} className="flex items-center gap-2">
                        <span className="text-xs text-ink-dim w-28 shrink-0">{BREAKDOWN_LABELS[k] || k}</span>
                        <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
                          <div className={`h-full ${v >= 60 ? "bg-emerald-500" : v >= 40 ? "bg-amber-400" : "bg-red-500"}`} style={{ width: `${v}%` }} />
                        </div>
                        <span className="text-[10px] text-ink-mute tabular-nums w-8 text-right">{v}%</span>
                      </div>
                    ))}
                  </div>
                  {r.person_id && (
                    <button onClick={() => nav(`/enterprise/people/${r.person_id}`)} data-testid={`rd-view-${r.role_id}`}
                      className="mt-4 text-xs px-3 py-1.5 rounded-lg bg-ai text-black font-semibold flex items-center gap-1">
                      View {r.person_name || "profile"} <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function BillingDashboard() {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState("");
  const load = useCallback(() => { api.get("/enterprise/billing").then((r) => setData(r.data)).catch(() => toast.error("Failed to load billing")); }, []);
  useEffect(() => { load(); }, [load]);
  if (!data) return <div className="py-10 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-ai" /></div>;

  const st = data.storage;
  const maxBytes = Math.max(1, ...st.usage.breakdown.map((b) => b.bytes));
  const buyPack = async (pack) => {
    setBusy(pack.id);
    try { await api.post("/enterprise/storage/packs/purchase", { pack_id: pack.id }); toast.success(`${pack.name} added`); load(); }
    catch (e) { toast.error(e?.response?.data?.detail || "Failed"); } finally { setBusy(""); }
  };

  return (
    <div className="space-y-6" data-testid="billing-dashboard">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Stat label="Seat licenses / mo" value={`$${data.seats.monthly_seat_cost.toFixed(2)}`} testid="bl-seats" />
        <Stat label="Storage / mo" value={`$${st.pricing.monthly_storage_cost.toFixed(2)}`} testid="bl-storage" />
        <div className="rounded-2xl border border-ai/40 bg-ai-tint p-4" data-testid="bl-total">
          <div className="text-[11px] uppercase tracking-widest text-ai mb-1">Total monthly estimate</div>
          <div className="text-2xl font-bold text-ink">${data.total_monthly_estimate.toFixed(2)}</div>
        </div>
      </div>

      <section>
        <h2 className="text-sm font-bold text-ink mb-3 flex items-center gap-2"><CreditCard className="w-4 h-4 text-ai" /> Seat licenses</h2>
        <div className="rounded-2xl border border-line bg-surface p-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div><div className="text-ink-mute text-xs">Purchased</div><div className="text-ink font-semibold">{data.seats.seats_purchased}</div></div>
          <div><div className="text-ink-mute text-xs">Assigned</div><div className="text-ink font-semibold">{data.seats.seats_assigned}</div></div>
          <div><div className="text-ink-mute text-xs">Price / seat</div><div className="text-ink font-semibold">${data.seats.price_per_seat.toFixed(2)}/mo</div></div>
          <div><div className="text-ink-mute text-xs">Seat total</div><div className="text-ink font-semibold">${data.seats.monthly_seat_cost.toFixed(2)}/mo</div></div>
        </div>
      </section>

      <section>
        <h2 className="text-sm font-bold text-ink mb-3 flex items-center gap-2"><HardDrive className="w-4 h-4 text-ai" /> Storage metering</h2>
        <div className="rounded-2xl border border-line bg-surface p-4">
          <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 mb-4">
            <div><span className="text-2xl font-bold text-ink" data-testid="bl-usage">{fmtBytes(st.usage.total_bytes)}</span> <span className="text-xs text-ink-mute">used</span></div>
            <div className="text-xs text-ink-dim">Included: <span className="text-ink">{st.pricing.included_gb} GB</span></div>
            <div className="text-xs text-ink-dim">Rate: <span className="text-ink">${st.pricing.effective_rate_per_gb}/GB·mo</span> <span className="text-ink-mute">(R2 ${st.pricing.base_rate_per_gb} + {st.pricing.markup_pct}%)</span></div>
          </div>
          <div className="space-y-2 mb-4">
            {st.usage.breakdown.map((b) => (
              <div key={b.label} className="flex items-center gap-2">
                <span className="text-xs text-ink-dim w-40 shrink-0">{b.label} <span className="text-ink-mute">({b.count})</span></span>
                <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden"><div className="h-full bg-ai" style={{ width: `${(b.bytes / maxBytes) * 100}%` }} /></div>
                <span className="text-[10px] text-ink-mute tabular-nums w-20 text-right">{fmtBytes(b.bytes)}</span>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-ink-mute">{st.note}</p>
        </div>
      </section>

      <section>
        <h2 className="text-sm font-bold text-ink mb-3 flex items-center gap-2"><Package className="w-4 h-4 text-ai" /> Storage packs</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {st.packs_available.map((p) => (
            <div key={p.id} className="rounded-2xl border border-line bg-surface p-4 flex flex-col" data-testid={`pack-${p.id}`}>
              <div className="text-lg font-bold text-ink">{p.gb} GB</div>
              <div className="text-xs text-ink-dim mb-3">${p.price_usd}/mo add-on allowance</div>
              <button onClick={() => buyPack(p)} disabled={busy === p.id} data-testid={`buy-${p.id}`}
                className="mt-auto h-9 rounded-lg bg-ai text-black text-xs font-bold flex items-center justify-center gap-1 disabled:opacity-60">
                {busy === p.id ? <Loader className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Add pack
              </button>
            </div>
          ))}
        </div>
        {st.packs_purchased.length > 0 && (
          <p className="text-xs text-ink-dim mt-3">Active packs: {st.packs_purchased.map((p) => p.name).join(", ")} · +{st.packs_purchased.reduce((a, b) => a + b.gb, 0)} GB allowance</p>
        )}
      </section>
    </div>
  );
}

export default function EnterprisePage() {
  const nav = useNavigate();
  const [tab, setTab] = useState("overview");
  const [overview, setOverview] = useState(null);
  const [people, setPeople] = useState([]);
  const [roles, setRoles] = useState([]);
  const [adding, setAdding] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pendingReview, setPendingReview] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [o, p, r, rev] = await Promise.all([
        api.get("/enterprise/overview"), api.get("/enterprise/people"), api.get("/enterprise/roles"),
        api.get("/enterprise/memories/review"),
      ]);
      setOverview(o.data); setPeople(p.data.people || []); setRoles(r.data.roles || []);
      setPendingReview(rev.data.pending_count || 0);
    } catch { toast.error("Failed to load Enterprise"); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="min-h-screen bg-bg flex items-center justify-center"><Loader2 className="w-7 h-7 animate-spin text-ai" /></div>;

  const tabs = [["overview", "Overview"], ["people", "People"], ["roles", "Roles"], ["risk", "Risk"], ["review", "Review"], ["billing", "Billing"]];

  return (
    <div className="min-h-screen bg-bg text-ink px-5 pt-16 pb-8 md:px-10" data-testid="enterprise-page">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center gap-3 mb-1">
          <Building2 className="w-6 h-6 text-ai" />
          <h1 className="text-2xl font-bold">Role Intelligence</h1>
        </div>
        <p className="text-sm text-ink-dim mb-1">Preserve how work gets done, even when employees change.</p>
        <p className="text-xs text-ink-mute mb-6">Transfer the role knowledge, not the person · Enterprise User $29.99/licensed user/mo</p>

        <div className="flex gap-2 mb-6 border-b border-line">
          {tabs.map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)} data-testid={`ent-tab-${id}`}
              className={`px-4 py-2.5 text-sm border-b-2 -mb-px flex items-center gap-1.5 ${tab === id ? "border-ai text-ai" : "border-transparent text-ink-dim hover:text-ink"}`}>{label}
              {id === "review" && pendingReview > 0 && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-ai text-black font-bold" data-testid="review-badge">{pendingReview}</span>
              )}
            </button>
          ))}
        </div>

        {tab === "overview" && overview && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Stat label="Licensed employees" value={overview.counts.employees} testid="ov-emp" />
              <Stat label="Roles" value={overview.counts.roles} testid="ov-roles" />
              <Stat label="At risk" value={overview.counts.at_risk} testid="ov-risk" />
              <Stat label="Seat cost / mo" value={`$${overview.licenses.monthly_seat_cost.toFixed(2)}`} testid="ov-cost" />
            </div>
            <section>
              <h2 className="text-sm font-bold text-ink mb-3 flex items-center gap-2"><ShieldAlert className="w-4 h-4 text-ai" /> Knowledge risk</h2>
              <div className="rounded-2xl border border-line bg-surface divide-y divide-line">
                {overview.risk_preview.map((r, i) => (
                  <div key={i} className="flex items-center gap-4 p-3" data-testid={`risk-row-${i}`}>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-ink text-sm">{r.employee_name}</div>
                      <div className="text-xs text-ink-dim">{r.role} · {r.unique_knowledge} unique knowledge</div>
                    </div>
                    <ContinuityBar score={r.continuity_score} />
                    <RiskBadge level={r.risk_level} />
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}

        {tab === "people" && (
          <div>
            <div className="flex justify-end mb-3">
              <button onClick={() => setAdding(true)} data-testid="add-employee-btn"
                className="text-xs px-3 py-2 rounded-lg bg-ai text-black font-semibold flex items-center gap-1"><Plus className="w-4 h-4" /> Add employee</button>
            </div>
            <div className="space-y-2">
              {people.map((p) => (
                <button key={p.id} onClick={() => nav(`/enterprise/people/${p.id}`)} data-testid={`person-${p.id}`}
                  className="w-full text-left flex items-center gap-4 rounded-2xl border border-line bg-surface p-4 hover:border-ai/40">
                  <div className="w-9 h-9 rounded-full bg-ai-tint text-ai flex items-center justify-center text-sm font-bold">{p.employee_name[0]}</div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-ink text-sm flex items-center gap-2">{p.employee_name}
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 text-ink-mute">{p.employment_status}</span>
                    </div>
                    <div className="text-xs text-ink-dim">{p.role_name} · {p.department}</div>
                  </div>
                  <ContinuityBar score={p.continuity_score} />
                  <RiskBadge level={p.risk_level} />
                  <ArrowRight className="w-4 h-4 text-ink-mute" />
                </button>
              ))}
            </div>
          </div>
        )}

        {tab === "roles" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {roles.map((r) => (
              <div key={r.id} className="rounded-2xl border border-line bg-surface p-4" data-testid={`role-${r.id}`}>
                <div className="flex items-center justify-between">
                  <div className="font-semibold text-ink flex items-center gap-2"><Briefcase className="w-4 h-4 text-ai" /> {r.role_name}</div>
                  <RiskBadge level={r.risk_level} />
                </div>
                <div className="text-xs text-ink-dim mt-1 line-clamp-2">{r.description}</div>
                <div className="mt-3"><ContinuityBar score={r.continuity_score} /></div>
                <div className="flex flex-wrap gap-1 mt-3">
                  {(r.responsibilities || []).slice(0, 3).map((x, i) => (
                    <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 text-ink-dim">{x}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
        {tab === "risk" && <RiskDashboard />}
        {tab === "review" && <ReviewQueue onDecided={setPendingReview} />}
        {tab === "billing" && <BillingDashboard />}
      </div>

      {adding && <AddEmployeeModal roles={roles} onClose={() => setAdding(false)} onAdded={() => { setAdding(false); load(); }} />}
    </div>
  );
}
