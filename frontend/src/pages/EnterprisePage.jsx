import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  Building2, Users, Briefcase, ShieldAlert, Loader2, Plus, X, ArrowRight, TrendingUp,
} from "lucide-react";
import { api } from "@/lib/api";

const RISK_COLOR = {
  Critical: "bg-red-500/15 text-red-400 border-red-500/30",
  High: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  Medium: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  Low: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
};

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

export default function EnterprisePage() {
  const nav = useNavigate();
  const [tab, setTab] = useState("overview");
  const [overview, setOverview] = useState(null);
  const [people, setPeople] = useState([]);
  const [roles, setRoles] = useState([]);
  const [adding, setAdding] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [o, p, r] = await Promise.all([
        api.get("/enterprise/overview"), api.get("/enterprise/people"), api.get("/enterprise/roles"),
      ]);
      setOverview(o.data); setPeople(p.data.people || []); setRoles(r.data.roles || []);
    } catch { toast.error("Failed to load Enterprise"); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="min-h-screen bg-bg flex items-center justify-center"><Loader2 className="w-7 h-7 animate-spin text-ai" /></div>;

  const tabs = [["overview", "Overview"], ["people", "People"], ["roles", "Roles"]];

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
              className={`px-4 py-2.5 text-sm border-b-2 -mb-px ${tab === id ? "border-ai text-ai" : "border-transparent text-ink-dim hover:text-ink"}`}>{label}</button>
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
      </div>

      {adding && <AddEmployeeModal roles={roles} onClose={() => setAdding(false)} onAdded={() => { setAdding(false); load(); }} />}
    </div>
  );
}
