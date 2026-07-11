import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Rocket, ArrowLeft, Loader2, Bot, AtSign, MessageSquare, Power, ShieldAlert } from "lucide-react";

/** Workspace-wide directory of deployed AI employees (admins only). */
export default function DeployedDirectory() {
  const nav = useNavigate();
  const [rows, setRows] = useState(null);
  const [denied, setDenied] = useState(false);
  const [busy, setBusy] = useState("");

  const load = () => {
    api.get("/ai-builder/deployments")
      .then(({ data }) => setRows(data.deployments))
      .catch((e) => { if (e?.response?.status === 403) setDenied(true); setRows([]); });
  };
  useEffect(load, []);

  const undeploy = async (eid) => {
    setBusy(eid);
    try { await api.post(`/ai-builder/employees/${eid}/undeploy`); toast.success("Undeployed"); load(); }
    catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
    setBusy("");
  };

  return (
    <div className="min-h-screen bg-bg text-ink px-5 py-8 md:px-10">
      <div className="max-w-3xl mx-auto">
        <button type="button" onClick={() => nav("/ai-builder")} data-testid="dd-back" className="inline-flex items-center gap-1.5 text-sm text-ink-dim hover:text-ink mb-4">
          <ArrowLeft className="w-4 h-4" /> Builder
        </button>
        <div className="flex items-start gap-3 mb-6">
          <div className="w-11 h-11 rounded-xl bg-ai-tint flex items-center justify-center shrink-0"><Rocket className="w-6 h-6 text-ai" /></div>
          <div className="flex-1">
            <h1 className="text-2xl font-extrabold">Deployed AI Employees</h1>
            <p className="text-sm text-ink-dim">Everything live across your workspace. Undeploy any employee here.</p>
          </div>
        </div>

        {denied ? (
          <div className="rounded-xl border border-white/10 bg-surface-2 p-8 text-center" data-testid="dd-denied">
            <ShieldAlert className="w-7 h-7 mx-auto text-ink-dim opacity-60 mb-2" />
            <p className="text-sm text-ink-dim">Only workspace owners/admins can view the deployed directory.</p>
          </div>
        ) : rows === null ? (
          <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-ai" /></div>
        ) : rows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/10 bg-surface-2 p-8 text-center" data-testid="dd-empty">
            <Bot className="w-7 h-7 mx-auto text-ink-dim opacity-50 mb-2" />
            <p className="text-sm text-ink-dim">No AI employees are deployed yet.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {rows.map((d) => (
              <div key={d.id} className="flex items-center gap-3 p-4 rounded-xl border border-white/10 bg-surface-2" data-testid={`dd-row-${d.employee_id}`}>
                <div className="w-9 h-9 rounded-lg bg-ai-tint flex items-center justify-center shrink-0"><Bot className="w-4 h-4 text-ai" /></div>
                <button type="button" onClick={() => nav(`/ai-builder/${d.employee_id}`)} className="min-w-0 flex-1 text-left">
                  <div className="text-sm font-bold truncate">{d.employee?.name || "(deleted)"}</div>
                  <div className="flex items-center gap-2 text-[11px] text-ink-dim mt-0.5">
                    <span className="inline-flex items-center gap-0.5"><AtSign className="w-3 h-3" />{d.handle}</span>
                    <span className="inline-flex items-center gap-0.5">
                      {d.channel === "chat" ? <MessageSquare className="w-3 h-3" /> : <AtSign className="w-3 h-3" />}
                      {d.channel === "chat" ? (d.chat_name || "a chat") : "@mention (any chat)"}
                    </span>
                  </div>
                </button>
                <button type="button" onClick={() => undeploy(d.employee_id)} disabled={busy === d.employee_id} data-testid={`dd-undeploy-${d.employee_id}`}
                  className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-white/10 hover:bg-rose-500/20 hover:text-rose-300 text-ink-dim text-xs font-bold disabled:opacity-50">
                  {busy === d.employee_id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Power className="w-3.5 h-3.5" />} Undeploy
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
