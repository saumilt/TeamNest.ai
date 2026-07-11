import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Loader2, Check, X, ExternalLink } from "lucide-react";
import { Loading, Empty } from "./WorkspacesTab";

const STATUS_TABS = [
  { id: "pending", label: "Pending" },
  { id: "approved", label: "Approved" },
  { id: "rejected", label: "Rejected" },
  { id: "all", label: "All" },
];

/** Super Admin — review AI Employee Builder Program applications. */
export default function BuildersTab() {
  const [status, setStatus] = useState("pending");
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState("");

  const load = () => {
    setData(null);
    api.get(`/builder-program/applications?status=${status}`).then(({ data }) => setData(data)).catch(() => setData({ applications: [], counts: {} }));
  };
  useEffect(load, [status]); // eslint-disable-line react-hooks/exhaustive-deps

  const decide = async (id, decision) => {
    setBusy(id + decision);
    try {
      await api.post(`/builder-program/applications/${id}/decide`, { decision });
      toast.success(decision === "approve" ? "Approved" : "Rejected");
      load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
    setBusy("");
  };

  return (
    <div>
      <div className="flex items-center gap-1 p-1 rounded-xl bg-surface-2 border border-white/10 w-fit mb-5">
        {STATUS_TABS.map((t) => (
          <button key={t.id} type="button" onClick={() => setStatus(t.id)} data-testid={`sa-bp-${t.id}`}
            className={`h-8 px-3 rounded-lg text-xs font-semibold ${status === t.id ? "bg-ai text-black" : "text-ink-dim hover:text-ink"}`}>
            {t.label}{data?.counts?.[t.id] != null ? ` (${data.counts[t.id]})` : ""}
          </button>
        ))}
      </div>

      {data === null ? <Loading /> : data.applications.length === 0 ? (
        <Empty label="No applications here." />
      ) : (
        <div className="space-y-3">
          {data.applications.map((a) => (
            <div key={a.id} className="rounded-xl border border-white/10 bg-surface-2 p-4" data-testid={`sa-bp-app-${a.id}`}>
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold">{a.full_name}</span>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${a.status === "approved" ? "bg-emerald-500/15 text-emerald-300" : a.status === "rejected" ? "bg-rose-500/15 text-rose-300" : "bg-amber-500/15 text-amber-300"}`}>{a.status}</span>
                  </div>
                  <div className="text-xs text-ink-dim mt-0.5">{a.user_email}{a.company ? ` · ${a.company}` : ""}{a.website ? " · " : ""}
                    {a.website ? <a href={a.website.startsWith("http") ? a.website : `https://${a.website}`} target="_blank" rel="noreferrer" className="text-ai inline-flex items-center gap-0.5">{a.website}<ExternalLink className="w-3 h-3" /></a> : null}
                  </div>
                </div>
                {a.status === "pending" && (
                  <div className="flex gap-2 shrink-0">
                    <button type="button" onClick={() => decide(a.id, "approve")} disabled={!!busy} data-testid={`sa-bp-approve-${a.id}`}
                      className="inline-flex items-center gap-1 h-8 px-3 rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-bold disabled:opacity-50">
                      {busy === a.id + "approve" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Approve
                    </button>
                    <button type="button" onClick={() => decide(a.id, "reject")} disabled={!!busy} data-testid={`sa-bp-reject-${a.id}`}
                      className="inline-flex items-center gap-1 h-8 px-3 rounded-full bg-white/10 hover:bg-rose-500/20 hover:text-rose-300 text-ink-dim text-xs font-bold disabled:opacity-50">
                      <X className="w-3.5 h-3.5" /> Reject
                    </button>
                  </div>
                )}
              </div>
              <div className="mt-3 grid grid-cols-1 gap-2 text-xs">
                <Field label="Why they want to build" value={a.motivation} />
                <Field label="How they'll add value" value={a.value_prop} />
                <Field label="AI employees they'd design" value={a.agent_ideas} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Field({ label, value }) {
  return (
    <div className="rounded-lg bg-bg border border-white/5 p-2.5">
      <div className="text-[10px] uppercase tracking-wide text-ink-faint font-bold mb-0.5">{label}</div>
      <div className="text-ink-dim leading-relaxed">{value}</div>
    </div>
  );
}
