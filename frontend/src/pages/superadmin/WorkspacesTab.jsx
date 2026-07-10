import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Search, Loader2, Trash2, Ban, CheckCircle2, Settings2, Coins } from "lucide-react";

const PLANS = [
  { id: "free", label: "Free" },
  { id: "pro", label: "Pro" },
  { id: "team", label: "Team" },
];

/** Super Admin → Workspaces: list all workspaces + manage plan, credits, status. */
export default function WorkspacesTab() {
  const [rows, setRows] = useState(null);
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState(null);

  const load = useCallback(async (q = "") => {
    setRows(null);
    try {
      const { data } = await api.get("/superadmin/workspaces", { params: { search: q, limit: 100 } });
      setRows(data.workspaces);
    } catch {
      setRows([]);
      toast.error("Failed to load workspaces");
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const patch = async (id, body) => {
    const { data } = await api.patch(`/superadmin/workspaces/${id}`, body);
    setRows((list) => list.map((w) => (w.id === id ? { ...w, ...data } : w)));
    return data;
  };

  const changePlan = async (id, plan_id) => {
    try { await patch(id, { plan_id }); toast.success(`Plan set to ${plan_id}`); }
    catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };

  const toggleSuspend = async (w) => {
    try {
      await patch(w.id, { suspended: w.status !== "suspended" });
      toast.success(w.status === "suspended" ? "Workspace reactivated" : "Workspace suspended");
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };

  const del = async (w) => {
    if (!window.confirm(`Permanently delete "${w.name}" and ALL its data + members? This cannot be undone.`)) return;
    try {
      await api.delete(`/superadmin/workspaces/${w.id}`);
      setRows((list) => list.filter((x) => x.id !== w.id));
      toast.success("Workspace deleted");
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };

  return (
    <div>
      <SearchBar value={search} onChange={setSearch} onSubmit={() => load(search)} placeholder="Search workspaces…" testid="sa-ws-search" />
      {rows === null ? (
        <Loading />
      ) : rows.length === 0 ? (
        <Empty label="No workspaces found." />
      ) : (
        <div className="space-y-2.5 mt-4">
          {rows.map((w) => (
            <div key={w.id} className="rounded-xl border border-white/10 bg-surface-2" data-testid={`sa-ws-${w.id}`}>
              <div className="flex items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold truncate">{w.name || "Untitled"}</span>
                    {w.status === "suspended" && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-300">SUSPENDED</span>
                    )}
                  </div>
                  <div className="text-xs text-ink-dim truncate">{w.owner_email || "no owner"} · {w.members} member{w.members === 1 ? "" : "s"}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-sm font-bold tabular-nums">{w.unlimited ? "∞" : `${w.credits_remaining?.toLocaleString?.() ?? w.credits_remaining}`}</div>
                  <div className="text-[10px] text-ink-dim uppercase tracking-wide">credits left</div>
                </div>
                <select
                  value={w.plan_id}
                  onChange={(e) => changePlan(w.id, e.target.value)}
                  data-testid={`sa-ws-plan-${w.id}`}
                  className="h-8 bg-bg border border-white/10 rounded-lg px-2 text-xs text-ink focus:border-ai focus:outline-none"
                >
                  {PLANS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                </select>
                <button type="button" onClick={() => setOpenId(openId === w.id ? null : w.id)}
                  data-testid={`sa-ws-manage-${w.id}`}
                  className="p-2 rounded-lg text-ink-dim hover:text-ink hover:bg-white/5" title="Credits">
                  <Coins className="w-4 h-4" />
                </button>
                <button type="button" onClick={() => toggleSuspend(w)}
                  data-testid={`sa-ws-suspend-${w.id}`}
                  className="p-2 rounded-lg text-ink-dim hover:text-amber-300 hover:bg-white/5"
                  title={w.status === "suspended" ? "Reactivate" : "Suspend"}>
                  {w.status === "suspended" ? <CheckCircle2 className="w-4 h-4" /> : <Ban className="w-4 h-4" />}
                </button>
                <button type="button" onClick={() => del(w)}
                  data-testid={`sa-ws-delete-${w.id}`}
                  className="p-2 rounded-lg text-ink-dim hover:text-rose-400 hover:bg-white/5" title="Delete">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              {openId === w.id && <CreditsEditor w={w} onPatch={patch} />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CreditsEditor({ w, onPatch }) {
  const [monthly, setMonthly] = useState(w.monthly_credits ?? 0);
  const [topup, setTopup] = useState("");
  const [busy, setBusy] = useState(false);

  const saveMonthly = async () => {
    setBusy(true);
    try { await onPatch(w.id, { monthly_credits: Number(monthly) }); toast.success("Monthly allowance updated"); }
    catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
    setBusy(false);
  };
  const addCredits = async () => {
    const amt = Number(topup);
    if (!amt) return;
    setBusy(true);
    try {
      const { data } = await api.post(`/superadmin/workspaces/${w.id}/credits`, { amount: amt });
      toast.success(`Balance now ${data.usage.credits_remaining.toLocaleString()}`);
      setTopup("");
      await onPatch(w.id, {}); // refresh row
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
    setBusy(false);
  };

  return (
    <div className="border-t border-white/10 p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div>
        <label className="text-xs font-semibold text-ink-dim">Recurring monthly credits (override plan)</label>
        <div className="flex gap-2 mt-1.5">
          <input type="number" min="0" value={monthly} onChange={(e) => setMonthly(e.target.value)}
            data-testid={`sa-ws-monthly-${w.id}`}
            className="w-28 bg-bg border border-white/10 rounded-lg px-3 py-1.5 text-sm text-ink focus:border-ai focus:outline-none" />
          <button type="button" onClick={saveMonthly} disabled={busy}
            data-testid={`sa-ws-monthly-save-${w.id}`}
            className="h-9 px-3 rounded-lg bg-ai text-black text-xs font-bold disabled:opacity-50">Save</button>
        </div>
      </div>
      <div>
        <label className="text-xs font-semibold text-ink-dim">One-time top-up (+/- to current balance)</label>
        <div className="flex gap-2 mt-1.5">
          <input type="number" value={topup} onChange={(e) => setTopup(e.target.value)} placeholder="e.g. 500"
            data-testid={`sa-ws-topup-${w.id}`}
            className="w-28 bg-bg border border-white/10 rounded-lg px-3 py-1.5 text-sm text-ink focus:border-ai focus:outline-none" />
          <button type="button" onClick={addCredits} disabled={busy || !topup}
            data-testid={`sa-ws-topup-add-${w.id}`}
            className="h-9 px-3 rounded-lg bg-white/10 text-ink text-xs font-bold disabled:opacity-50">Add</button>
        </div>
      </div>
    </div>
  );
}

export function SearchBar({ value, onChange, onSubmit, placeholder, testid }) {
  return (
    <div className="flex items-center gap-2 h-10 px-3 rounded-xl border border-white/10 bg-surface-2 focus-within:border-ai">
      <Search className="w-4 h-4 text-ink-dim" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && onSubmit()}
        placeholder={placeholder}
        data-testid={testid}
        className="flex-1 bg-transparent text-sm text-ink placeholder:text-ink-dim focus:outline-none"
      />
    </div>
  );
}

export function Loading() {
  return <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-ai" /></div>;
}
export function Empty({ label }) {
  return (
    <div className="text-center py-12 text-ink-dim">
      <Settings2 className="w-6 h-6 mx-auto mb-2 opacity-40" />
      <p className="text-sm">{label}</p>
    </div>
  );
}
