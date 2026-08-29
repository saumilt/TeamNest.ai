import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { Inbox, ShieldCheck, CheckCircle2, XCircle, AlertTriangle, Loader2, ArrowRight } from "lucide-react";

export default function ApprovalInbox() {
  const { user } = useAuth();
  const nav = useNavigate();
  const isAdmin = ["owner", "admin"].includes(user?.role);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState(null);

  const load = useCallback(() => {
    api.get("/automations/pending")
      .then(({ data }) => setItems(data.items || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const decide = async (runId, action) => {
    setActingId(runId);
    try {
      const { data } = await api.post(`/automations/runs/${runId}/${action}`);
      toast.success(action === "approve" ? `Approved · run ${data.status}` : "Rejected");
      load();
      window.dispatchEvent(new CustomEvent("tn:approvals-changed"));
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Couldn't update");
    } finally { setActingId(null); }
  };

  return (
    <div className="p-6 lg:p-10 max-w-3xl" data-testid="approval-inbox-page">
      <div className="label-mono mb-2">AI / AUTOMATIONS · APPROVALS</div>
      <div className="flex items-center gap-3 mb-1">
        <Inbox className="w-6 h-6 text-amber-400" />
        <h1 className="font-display text-3xl lg:text-4xl font-bold tracking-tighter">Approval Inbox</h1>
        {items.length > 0 && <span className="text-sm font-mono text-amber-300 bg-amber-500/10 border border-amber-400/30 rounded-full px-2.5 py-0.5">{items.length}</span>}
      </div>
      <p className="text-zinc-500 mb-8">Every automation run waiting on a decision, in one place. {isAdmin ? "Approve to run it now, or reject to cancel." : "An owner or admin approves these."}</p>

      {loading ? (
        <div className="py-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-amber-400" /></div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-[#121214] p-10 text-center" data-testid="approval-inbox-empty">
          <ShieldCheck className="w-9 h-9 text-emerald-400 mx-auto mb-3" />
          <div className="text-zinc-200 font-semibold">You're all caught up</div>
          <div className="text-zinc-500 text-sm mt-1">No automations are waiting for approval.</div>
          <button onClick={() => nav("/automations")} data-testid="approval-inbox-goto-automations" className="mt-4 text-sm text-yellow-400 hover:text-yellow-300 inline-flex items-center gap-1">
            Go to Automations <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((p) => (
            <div key={p.id} data-testid={`inbox-item-${p.id}`} className="rounded-2xl border border-amber-400/20 bg-amber-500/[0.05] p-4">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-amber-500/15 flex items-center justify-center shrink-0"><AlertTriangle className="w-4 h-4 text-amber-400" /></div>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-zinc-100">{p.automation_name}</div>
                  <div className="text-[12px] text-zinc-500 mt-0.5">{p.reasoning_summary}</div>
                  <div className="text-[11px] text-zinc-600 mt-1">Triggered {p.trigger_source} · {new Date(p.started_at).toLocaleString()} · <span className="uppercase text-amber-400/80">{p.risk} risk</span></div>
                </div>
              </div>
              {isAdmin && (
                <div className="flex gap-2 mt-3 pl-12">
                  <button data-testid={`inbox-approve-${p.id}`} disabled={actingId === p.id} onClick={() => decide(p.id, "approve")} className="inline-flex items-center gap-1.5 bg-emerald-500 text-black hover:bg-emerald-400 disabled:opacity-60 text-xs font-semibold rounded-lg px-3 py-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Approve & run
                  </button>
                  <button data-testid={`inbox-reject-${p.id}`} disabled={actingId === p.id} onClick={() => decide(p.id, "reject")} className="inline-flex items-center gap-1.5 border border-white/10 text-zinc-300 hover:bg-white/5 disabled:opacity-60 text-xs font-semibold rounded-lg px-3 py-1.5">
                    <XCircle className="w-3.5 h-3.5" /> Reject
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
