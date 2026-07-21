import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Gauge, Trash2, Plus } from "lucide-react";

const SCOPE_LABEL = {
  user: "Per user",
  chat: "Per chat",
  workspace: "Whole workspace",
  enterprise: "Enterprise (org-wide)",
};

export default function CreditGovernance() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [scope, setScope] = useState("workspace");
  const [targetId, setTargetId] = useState("");
  const [limit, setLimit] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const { data } = await api.get("/credit-governance/caps");
      setData(data);
    } catch (e) {
      if (e?.response?.status !== 403) toast.error("Could not load credit limits");
      setData({ forbidden: e?.response?.status === 403 });
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const addCap = async () => {
    const lim = parseInt(limit, 10);
    if (!lim || lim <= 0) return toast.error("Enter a positive credit limit");
    if ((scope === "user" || scope === "chat") && !targetId) return toast.error(`Pick a ${scope}`);
    setBusy(true);
    try {
      await api.put("/credit-governance/caps", {
        scope,
        scope_id: (scope === "user" || scope === "chat") ? targetId : undefined,
        limit_credits: lim,
      });
      toast.success("Credit limit saved");
      setLimit(""); setTargetId("");
      await load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not save limit");
    } finally { setBusy(false); }
  };

  const remove = async (c) => {
    try {
      await api.delete(`/credit-governance/caps/${c.scope}/${c.scope_id}`);
      await load();
    } catch { toast.error("Could not remove"); }
  };

  if (loading) return <div className="h-24 rounded-card bg-surface animate-pulse" />;
  if (data?.forbidden) return null;

  const caps = data?.caps || [];

  return (
    <div className="px-4 md:px-10 max-w-3xl mx-auto mt-8" data-testid="credit-governance">
      <div className="flex items-center gap-2 mb-1">
        <Gauge className="w-4 h-4 text-amber-400" />
        <div className="text-[13px] font-semibold text-ink">AI credit limits</div>
      </div>
      <p className="text-[12px] text-ink-mute mb-3">
        Set hard AI credit caps per user, chat, workspace, or enterprise-wide. Most restrictive wins.
        Limits reset every billing month.
      </p>

      {caps.length > 0 && (
        <div className="space-y-2 mb-4" data-testid="credit-caps-list">
          {caps.map((c) => (
            <div key={`${c.scope}:${c.scope_id}`} data-testid={`cap-row-${c.scope}`}
              className="rounded-xl bg-surface ring-1 ring-hairline p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[13px] font-semibold text-ink truncate">
                    {SCOPE_LABEL[c.scope]} · {c.label}
                  </div>
                  <div className="text-[11px] text-ink-mute">{c.used} / {c.limit_credits} credits used</div>
                </div>
                <button onClick={() => remove(c)} data-testid={`cap-delete-${c.scope}`}
                  className="text-ink-mute hover:text-red-400 shrink-0"><Trash2 className="w-4 h-4" /></button>
              </div>
              <div className="mt-2 h-1.5 rounded-full bg-surface-2 overflow-hidden">
                <div className={`h-full ${c.pct >= 100 ? "bg-red-500" : c.pct >= 80 ? "bg-amber-400" : "bg-emerald-500"}`}
                  style={{ width: `${Math.min(100, c.pct)}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-xl bg-surface ring-1 ring-hairline p-3 grid grid-cols-1 sm:grid-cols-4 gap-2 items-end">
        <div>
          <label className="text-[11px] text-ink-mute">Scope</label>
          <select data-testid="cap-scope-select" value={scope}
            onChange={(e) => { setScope(e.target.value); setTargetId(""); }}
            className="w-full h-9 rounded-lg bg-surface-2 ring-1 ring-hairline px-2 text-ink text-[13px]">
            {(data?.scopes || ["user", "chat", "workspace", "enterprise"]).map((s) => (
              <option key={s} value={s}>{SCOPE_LABEL[s]}</option>
            ))}
          </select>
        </div>
        {(scope === "user" || scope === "chat") && (
          <div>
            <label className="text-[11px] text-ink-mute">{scope === "user" ? "Member" : "Chat"}</label>
            <select data-testid="cap-target-select" value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
              className="w-full h-9 rounded-lg bg-surface-2 ring-1 ring-hairline px-2 text-ink text-[13px]">
              <option value="">Select…</option>
              {scope === "user"
                ? (data?.members || []).map((m) => <option key={m.id} value={m.id}>{m.name || m.email}</option>)
                : (data?.chats || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        )}
        <div>
          <label className="text-[11px] text-ink-mute">Credits / month</label>
          <input data-testid="cap-limit-input" type="number" min="1" value={limit}
            onChange={(e) => setLimit(e.target.value)} placeholder="e.g. 3000"
            className="w-full h-9 rounded-lg bg-surface-2 ring-1 ring-hairline px-2 text-ink text-[13px]" />
        </div>
        <button data-testid="cap-add-btn" disabled={busy} onClick={addCap}
          className="h-9 rounded-pill bg-amber-300 hover:bg-amber-200 text-black font-semibold text-[13px] inline-flex items-center justify-center gap-1 disabled:opacity-50">
          <Plus className="w-3.5 h-3.5" /> Set limit
        </button>
      </div>
    </div>
  );
}
