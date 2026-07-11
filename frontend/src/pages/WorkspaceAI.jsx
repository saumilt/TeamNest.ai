import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Building2, Users, Rocket, DollarSign, ShieldCheck, Loader2, X,
  TrendingUp, Store, Power, Settings2,
} from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

const money = (n) => `$${Number(n || 0).toFixed(2)}`;

function Stat({ label, value, testid }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-4" data-testid={testid}>
      <div className="text-[11px] uppercase tracking-widest text-ink-mute mb-1">{label}</div>
      <div className="text-2xl font-bold text-ink">{value}</div>
    </div>
  );
}

function EnableModal({ employee, onClose, onEnabled }) {
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [scope, setScope] = useState("workspace");

  useEffect(() => {
    api.get(`/workspace-ai/employees/${employee.id}/consent-preview`)
      .then((r) => setPreview(r.data))
      .catch(() => toast.error("Could not load pricing"));
  }, [employee.id]);

  const enable = async () => {
    setBusy(true);
    try {
      await api.post(`/workspace-ai/employees/${employee.id}/enable`, {
        availability_scope: scope, central_learning_allowed: false, approval_required: true,
      });
      toast.success(`${employee.name} enabled for your team`);
      onEnabled();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed to enable");
    } finally { setBusy(false); }
  };

  const p = preview?.pricing;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" data-testid="enable-modal">
      <div className="w-full max-w-lg rounded-2xl border border-line bg-bg p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-lg font-bold text-ink">Enable {employee.name}</h3>
            <p className="text-sm text-ink-dim">{employee.job_title || "AI employee"}</p>
          </div>
          <button onClick={onClose} data-testid="enable-modal-close" className="text-ink-mute hover:text-ink"><X className="w-5 h-5" /></button>
        </div>

        {!preview ? (
          <div className="py-10 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-ai" /></div>
        ) : (
          <>
            <div className="rounded-xl bg-ai-tint border border-ai/20 p-4 mb-4">
              <p className="text-sm text-ink">{preview.disclosure}</p>
            </div>
            <div className="grid grid-cols-3 gap-3 mb-4">
              <Stat label="Base / mo" value={money(p.base_monthly_fee)} testid="preview-base" />
              <Stat label="Per user / mo" value={money(p.per_user_monthly_fee)} testid="preview-peruser" />
              <Stat label="TeamNest fee" value={`${p.platform_fee_percent}%`} testid="preview-platform" />
            </div>
            <p className="text-xs text-ink-mute mb-3">
              {p.teamnest_owned ? "TeamNest owns this employee (platform keeps 100%)." : `Creator receives ${p.creator_revenue_percent}% of eligible fees.`}
              {p.free_trial_days ? ` · ${p.free_trial_days}-day free trial.` : ""}
            </p>
            <ul className="text-xs text-ink-dim space-y-1 mb-4 list-disc pl-4">
              {(preview.notes || []).map((n, i) => <li key={i}>{n}</li>)}
            </ul>
            <label className="text-[11px] uppercase tracking-widest text-ink-mute">Availability</label>
            <select value={scope} onChange={(e) => setScope(e.target.value)} data-testid="enable-scope"
              className="w-full mt-1 mb-4 h-11 rounded-xl bg-surface border border-line px-3 text-ink text-sm">
              <option value="workspace">Entire workspace</option>
              <option value="departments">Selected departments</option>
              <option value="roles">Selected roles</option>
              <option value="users">Selected users</option>
            </select>
            <button onClick={enable} disabled={busy} data-testid="enable-confirm-btn"
              className="w-full h-11 rounded-xl bg-ai text-black font-bold flex items-center justify-center gap-2 disabled:opacity-60">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Rocket className="w-4 h-4" />}
              Enable for workspace
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function TeamTab() {
  const [deployed, setDeployed] = useState([]);
  const [available, setAvailable] = useState([]);
  const [ledger, setLedger] = useState(null);
  const [enabling, setEnabling] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [d, emps, bill] = await Promise.all([
        api.get("/workspace-ai/employees"),
        api.get("/ai-builder/employees"),
        api.get("/workspace-ai/billing/workspace"),
      ]);
      const deployedList = d.data.employees || [];
      const deployedIds = new Set(deployedList.map((x) => x.employee_id));
      setDeployed(deployedList);
      setAvailable((emps.data.employees || []).filter((e) => !deployedIds.has(e.id)));
      setLedger(bill.data);
    } catch { toast.error("Failed to load workspace AI"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const disable = async (eid, name) => {
    try { await api.post(`/workspace-ai/employees/${eid}/disable`); toast.success(`${name} disabled`); load(); }
    catch { toast.error("Failed to disable"); }
  };

  if (loading) return <div className="py-16 flex justify-center"><Loader2 className="w-7 h-7 animate-spin text-ai" /></div>;

  return (
    <div className="space-y-8">
      {ledger && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="Workspace / mo" value={money(ledger.totals.workspace_total)} testid="ws-total" />
          <Stat label="Active users" value={ledger.totals.active_users} testid="ws-users" />
          <Stat label="TeamNest fee" value={money(ledger.totals.platform_fee)} testid="ws-platform" />
          <Stat label="Active employees" value={ledger.totals.active_employees} testid="ws-active" />
        </div>
      )}

      <section>
        <h2 className="text-sm font-bold text-ink mb-3 flex items-center gap-2"><Rocket className="w-4 h-4 text-ai" /> Deployed to your team</h2>
        {deployed.length === 0 ? (
          <p className="text-sm text-ink-mute rounded-2xl border border-dashed border-line p-6 text-center" data-testid="deployed-empty">
            No AI employees deployed yet. Enable one below to make it available to your team.
          </p>
        ) : (
          <div className="space-y-2">
            {deployed.map((d) => (
              <div key={d.employee_id} data-testid={`deployed-row-${d.employee_id}`}
                className="flex items-center justify-between rounded-2xl border border-line bg-surface p-4">
                <div>
                  <div className="font-semibold text-ink flex items-center gap-2">
                    {d.employee?.name}
                    <span className={`text-[10px] px-2 py-0.5 rounded-full ${d.status === "active" ? "bg-emerald-500/15 text-emerald-400" : "bg-white/10 text-ink-mute"}`}>{d.status}</span>
                  </div>
                  <div className="text-xs text-ink-dim mt-0.5">
                    {money(d.base_monthly_fee)}/mo + {money(d.per_user_monthly_fee)}/user · {d.availability_scope}
                  </div>
                </div>
                {d.status === "active" && (
                  <button onClick={() => disable(d.employee_id, d.employee?.name)} data-testid={`disable-${d.employee_id}`}
                    className="text-xs flex items-center gap-1 px-3 py-1.5 rounded-lg border border-line text-ink-dim hover:text-red-400 hover:border-red-400/40">
                    <Power className="w-3.5 h-3.5" /> Disable
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-sm font-bold text-ink mb-3 flex items-center gap-2"><Store className="w-4 h-4 text-ai" /> Available to enable</h2>
        {available.length === 0 ? (
          <p className="text-sm text-ink-mute" data-testid="available-empty">All your AI employees are already deployed.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {available.map((e) => (
              <button key={e.id} onClick={() => setEnabling(e)} data-testid={`enable-${e.id}`}
                className="text-left rounded-2xl border border-line bg-surface p-4 hover:border-ai/40 transition-colors">
                <div className="font-semibold text-ink">{e.name}</div>
                <div className="text-xs text-ink-dim">{e.job_title || "AI employee"}</div>
                <div className="text-xs text-ai mt-2 flex items-center gap-1"><Rocket className="w-3 h-3" /> Enable for team</div>
              </button>
            ))}
          </div>
        )}
      </section>

      {enabling && (
        <EnableModal employee={enabling} onClose={() => setEnabling(null)}
          onEnabled={() => { setEnabling(null); load(); }} />
      )}
    </div>
  );
}

function CreatorTab() {
  const [data, setData] = useState(null);
  useEffect(() => { api.get("/workspace-ai/billing/creator").then((r) => setData(r.data)).catch(() => {}); }, []);
  if (!data) return <div className="py-16 flex justify-center"><Loader2 className="w-7 h-7 animate-spin text-ai" /></div>;
  const t = data.totals;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Licensed workspaces" value={t.licensed_workspaces} testid="cr-ws" />
        <Stat label="Gross revenue" value={money(t.gross_revenue)} testid="cr-gross" />
        <Stat label="TeamNest 30% fee" value={money(t.platform_fee)} testid="cr-fee" />
        <Stat label="Net earnings" value={money(t.net_earnings)} testid="cr-net" />
      </div>
      {data.rows.length === 0 ? (
        <p className="text-sm text-ink-mute" data-testid="cr-empty">No workspaces have licensed your AI employees yet.</p>
      ) : (
        <div className="space-y-2">
          {data.rows.map((r, i) => (
            <div key={i} className="flex items-center justify-between rounded-xl border border-line bg-surface p-3 text-sm" data-testid={`cr-row-${i}`}>
              <span className="text-ink">{r.employee_name}</span>
              <span className="text-ink-dim">{r.active_users} users · {money(r.total_fee)} → you {money(r.creator_earnings)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AdminTab() {
  const [data, setData] = useState(null);
  const [rules, setRules] = useState(null);
  const [saving, setSaving] = useState(false);
  const load = useCallback(() => {
    api.get("/workspace-ai/billing/admin").then((r) => { setData(r.data); setRules(r.data.rules); }).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setSaving(true);
    try {
      await api.put("/workspace-ai/billing-rules", {
        min_builder_fee: Number(rules.min_builder_fee),
        per_user_fee: Number(rules.per_user_fee),
        platform_fee_percent: Number(rules.platform_fee_percent),
        free_trial_days: Number(rules.free_trial_days),
      });
      toast.success("Revenue-share rules saved");
      load();
    } catch { toast.error("Failed to save rules"); }
    finally { setSaving(false); }
  };

  if (!data) return <div className="py-16 flex justify-center"><Loader2 className="w-7 h-7 animate-spin text-ai" /></div>;
  const t = data.totals;
  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Stat label="Platform revenue" value={money(t.platform_revenue)} testid="ad-rev" />
        <Stat label="Creator payouts" value={money(t.creator_payouts)} testid="ad-payouts" />
        <Stat label="Workspace spend" value={money(t.workspace_spend)} testid="ad-spend" />
        <Stat label="Workspaces" value={t.workspaces} testid="ad-ws" />
        <Stat label="Active deployments" value={t.active_deployments} testid="ad-dep" />
        <Stat label="Active users" value={t.active_users} testid="ad-users" />
      </div>

      <section className="rounded-2xl border border-line bg-surface p-5">
        <h2 className="text-sm font-bold text-ink mb-4 flex items-center gap-2"><Settings2 className="w-4 h-4 text-ai" /> Revenue-share rules</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            ["min_builder_fee", "Min builder fee ($)"],
            ["per_user_fee", "Per-user fee ($)"],
            ["platform_fee_percent", "Platform fee (%)"],
            ["free_trial_days", "Trial days"],
          ].map(([k, label]) => (
            <div key={k}>
              <label className="text-[11px] uppercase tracking-widest text-ink-mute">{label}</label>
              <input type="number" value={rules[k]} onChange={(e) => setRules({ ...rules, [k]: e.target.value })}
                data-testid={`rule-${k}`}
                className="w-full mt-1 h-11 rounded-xl bg-bg border border-line px-3 text-ink text-sm" />
            </div>
          ))}
        </div>
        <p className="text-xs text-ink-mute mt-3">Creator share auto-adjusts to {(100 - Number(rules.platform_fee_percent || 0)).toFixed(0)}%.</p>
        <button onClick={save} disabled={saving} data-testid="rules-save-btn"
          className="mt-4 h-10 px-5 rounded-xl bg-ai text-black font-bold flex items-center gap-2 disabled:opacity-60">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />} Save rules
        </button>
      </section>

      {data.top_employees?.length > 0 && (
        <section>
          <h2 className="text-sm font-bold text-ink mb-3 flex items-center gap-2"><TrendingUp className="w-4 h-4 text-ai" /> Top employees by revenue</h2>
          <div className="space-y-2">
            {data.top_employees.map((r, i) => (
              <div key={i} className="flex items-center justify-between rounded-xl border border-line bg-surface p-3 text-sm">
                <span className="text-ink">{r.employee_name}</span>
                <span className="text-ink-dim">{money(r.total_fee)} · fee {money(r.platform_fee)}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

export default function WorkspaceAI() {
  const { user } = useAuth();
  const isAdmin = user?.is_super_admin;
  const canManage = isAdmin || user?.role === "owner" || user?.role === "admin";
  const [tab, setTab] = useState("team");

  const tabs = useMemo(() => {
    const t = [];
    if (canManage) t.push({ id: "team", label: "Team AI", icon: Building2 });
    t.push({ id: "creator", label: "Creator earnings", icon: DollarSign });
    if (isAdmin) t.push({ id: "admin", label: "Platform", icon: ShieldCheck });
    return t;
  }, [isAdmin, canManage]);

  useEffect(() => {
    if (!canManage && tab === "team") setTab("creator");
  }, [canManage, tab]);

  return (
    <div className="min-h-screen bg-bg text-ink px-5 pt-16 pb-8 md:px-10" data-testid="workspace-ai-page">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center gap-3 mb-1">
          <Building2 className="w-6 h-6 text-ai" />
          <h1 className="text-2xl font-bold">Workspace AI</h1>
        </div>
        <p className="text-sm text-ink-dim mb-6">Deploy AI employees to your team and track billing, revenue share, and usage.</p>

        <div className="flex gap-2 mb-6 border-b border-line">
          {tabs.map((tb) => {
            const Icon = tb.icon;
            return (
              <button key={tb.id} onClick={() => setTab(tb.id)} data-testid={`tab-${tb.id}`}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm border-b-2 -mb-px transition-colors ${
                  tab === tb.id ? "border-ai text-ai" : "border-transparent text-ink-dim hover:text-ink"
                }`}>
                <Icon className="w-4 h-4" /> {tb.label}
              </button>
            );
          })}
        </div>

        {tab === "team" && canManage && <TeamTab />}
        {tab === "creator" && <CreatorTab />}
        {tab === "admin" && isAdmin && <AdminTab />}
      </div>
    </div>
  );
}
