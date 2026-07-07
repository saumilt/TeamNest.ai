import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Gavel, Plus, ChevronRight, History, CheckCircle2, XCircle, AlertTriangle, RefreshCw,
} from "lucide-react";
import { toast } from "sonner";

const STATUS_BUCKETS = ["proposed", "under_review", "approved", "rejected", "reversed", "superseded"];

const STATUS_STYLE = {
  proposed: "text-blue-300 border-blue-400/30 bg-blue-500/10",
  under_review: "text-amber-300 border-amber-400/30 bg-amber-500/10",
  approved: "text-emerald-300 border-emerald-400/30 bg-emerald-500/10",
  rejected: "text-red-300 border-red-400/30 bg-red-500/10",
  reversed: "text-zinc-400 border-white/10 bg-white/5",
  superseded: "text-zinc-500 border-white/10 bg-white/5",
};

export default function Decisions() {
  const [params] = useSearchParams();
  const [decisions, setDecisions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState(params.get("status") || "all");
  const [showCreate, setShowCreate] = useState(false);
  const [openId, setOpenId] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const sf = statusFilter !== "all" ? `?status=${statusFilter}` : "";
      const { data } = await api.get(`/decisions${sf}`);
      setDecisions(data.decisions || []);
    } catch {
      toast.error("Failed to load decisions");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [statusFilter]);

  return (
    <div className="min-h-[100dvh] bg-bg text-zinc-100 px-4 sm:px-8 py-6 max-w-6xl mx-auto" data-testid="decisions-page">
      <div className="flex items-center justify-between gap-3 mb-6 flex-wrap">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold flex items-center gap-2">
            <Gavel className="w-7 h-7 text-yellow-400" />
            Decision Log
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Every concrete decision your team has made, with rationale and status.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="bg-[#0a0a0a] border-white/10 rounded-sm h-9 w-44" data-testid="decision-status-filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-[#0a0a0a] border-white/10">
              <SelectItem value="all">All statuses</SelectItem>
              {STATUS_BUCKETS.map((s) => (
                <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            onClick={() => setShowCreate(true)}
            data-testid="decision-new-btn"
            className="bg-yellow-500 hover:bg-yellow-400 text-black rounded-sm"
          >
            <Plus className="w-3.5 h-3.5 mr-1.5" /> New decision
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="text-zinc-500">Loading…</div>
      ) : decisions.length === 0 ? (
        <div className="border border-dashed border-white/10 rounded-sm p-8 text-center text-zinc-500" data-testid="decisions-empty">
          No decisions in this view. Approve an AI answer to auto-log one, or click <strong>New decision</strong>.
        </div>
      ) : (
        <div className="space-y-2">
          {decisions.map((d) => (
            <DecisionRow key={d.id} item={d} onClick={() => setOpenId(d.id)} />
          ))}
        </div>
      )}

      {showCreate && (
        <CreateDialog onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); load(); }} />
      )}
      {openId && <DetailDialog id={openId} onClose={() => setOpenId(null)} onChanged={load} />}
    </div>
  );
}

function DecisionRow({ item, onClick }) {
  const status = (item.meta?.decision_status) || "proposed";
  const date = (item.created_at || "").slice(0, 10);
  return (
    <button
      onClick={onClick}
      data-testid={`decision-row-${item.id}`}
      className="w-full text-left bg-white/[0.02] hover:bg-white/[0.05] border border-white/10 rounded-sm p-4 flex items-start gap-3 transition-colors"
    >
      <div className={`px-2 py-0.5 rounded-sm border text-[10px] font-mono uppercase tracking-widest ${STATUS_STYLE[status] || STATUS_STYLE.proposed}`}>
        {status.replace("_", " ")}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-medium text-white truncate">{item.title}</div>
        <div className="text-xs text-zinc-400 mt-0.5 line-clamp-2">{item.summary || item.content}</div>
        <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mt-2">
          {date} · {item.source_type?.replace("_", " ")}
        </div>
      </div>
      <ChevronRight className="w-4 h-4 text-zinc-500 mt-1 shrink-0" />
    </button>
  );
}

function CreateDialog({ onClose, onCreated }) {
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [rationale, setRationale] = useState("");
  const [risks, setRisks] = useState("");
  const [status, setStatus] = useState("proposed");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!title.trim() || !summary.trim()) return;
    setBusy(true);
    try {
      await api.post("/decisions", { title, summary, rationale, risks, status });
      toast.success("Decision logged");
      onCreated?.();
    } catch {
      toast.error("Failed to create decision");
    } finally { setBusy(false); }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-[#0a0a0a] border-white/10 text-white max-w-lg" data-testid="decision-create-dialog">
        <DialogHeader><DialogTitle>Log a new decision</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div><div className="label-mono mb-1.5">TITLE</div>
            <Input data-testid="decision-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Selected Frisco as launch market" className="bg-[#121214] border-white/10 rounded-sm" />
          </div>
          <div><div className="label-mono mb-1.5">SUMMARY</div>
            <Textarea data-testid="decision-summary" value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="What was decided?" className="bg-[#121214] border-white/10 rounded-sm min-h-[80px]" />
          </div>
          <div><div className="label-mono mb-1.5">RATIONALE (OPTIONAL)</div>
            <Textarea data-testid="decision-rationale" value={rationale} onChange={(e) => setRationale(e.target.value)} placeholder="Why this decision?" className="bg-[#121214] border-white/10 rounded-sm min-h-[60px]" />
          </div>
          <div><div className="label-mono mb-1.5">RISKS (OPTIONAL)</div>
            <Textarea data-testid="decision-risks" value={risks} onChange={(e) => setRisks(e.target.value)} placeholder="What could go wrong?" className="bg-[#121214] border-white/10 rounded-sm min-h-[50px]" />
          </div>
          <div>
            <div className="label-mono mb-1.5">STATUS</div>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger data-testid="decision-status" className="bg-[#121214] border-white/10 rounded-sm"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-[#121214] border-white/10">
                {["proposed", "under_review", "approved"].map((s) => (<SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="border-white/10 bg-transparent hover:bg-white/5 rounded-sm">Cancel</Button>
          <Button data-testid="decision-save" onClick={save} disabled={busy || !title.trim() || !summary.trim()} className="bg-yellow-500 hover:bg-yellow-400 text-black rounded-sm">
            {busy ? "Saving…" : "Log decision"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DetailDialog({ id, onClose, onChanged }) {
  const [d, setD] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.get(`/decisions/${id}`).then(({ data }) => { if (!cancelled) setD(data); }).catch(() => { if (!cancelled) setD(null); });
    return () => { cancelled = true; };
  }, [id]);

  const setStatus = async (status) => {
    setBusy(true);
    try {
      await api.patch(`/decisions/${id}/status`, { status });
      toast.success(`Marked as ${status.replace("_", " ")}`);
      onChanged?.();
      onClose?.();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Status change failed");
    } finally { setBusy(false); }
  };

  const dec = d?.decision;
  const status = (dec?.meta?.decision_status) || "proposed";
  const history = (dec?.meta?.decision_history) || [];

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-[#0a0a0a] border-white/10 text-white max-w-2xl" data-testid="decision-detail-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Gavel className="w-4 h-4 text-yellow-400" />
            {dec?.title || "Decision"}
          </DialogTitle>
        </DialogHeader>
        {!d ? <div className="text-zinc-500 py-8 text-center">Loading…</div> : (
          <div className="space-y-4 py-2 max-h-[70vh] overflow-y-auto">
            <div className={`inline-block px-2 py-0.5 rounded-sm border text-[10px] font-mono uppercase tracking-widest ${STATUS_STYLE[status]}`}>{status.replace("_", " ")}</div>
            <div>
              <div className="label-mono mb-1.5">SUMMARY</div>
              <div className="text-sm text-zinc-200 whitespace-pre-wrap">{dec.content}</div>
            </div>
            {dec.meta?.rationale && (
              <div><div className="label-mono mb-1.5">RATIONALE</div><div className="text-sm text-zinc-300">{dec.meta.rationale}</div></div>
            )}
            {dec.meta?.risks && (
              <div><div className="label-mono mb-1.5">RISKS</div><div className="text-sm text-amber-200">{dec.meta.risks}</div></div>
            )}
            {history.length > 0 && (
              <div>
                <div className="label-mono mb-2 flex items-center gap-1.5"><History className="w-3.5 h-3.5" /> HISTORY</div>
                <div className="space-y-1.5">
                  {history.map((h, i) => (
                    <div key={`${h.at}-${i}`} className="text-[11px] text-zinc-400 border-l-2 border-white/10 pl-2 py-0.5">
                      <span className="text-zinc-200 font-mono uppercase tracking-widest mr-2">{h.status.replace("_", " ")}</span>
                      by {h.by_name} · {(h.at || "").slice(0, 16)}
                      {h.note && <div className="text-zinc-500 italic mt-0.5">"{h.note}"</div>}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {d.linked_tasks?.length > 0 && (
              <div>
                <div className="label-mono mb-1.5">LINKED TASKS</div>
                <div className="space-y-1">
                  {d.linked_tasks.map((t) => (
                    <div key={t.id} className="text-xs text-zinc-300 border border-white/10 rounded-sm px-2 py-1">{t.title}</div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        <DialogFooter className="flex-wrap gap-2 justify-start">
          {status !== "approved" && <Button size="sm" disabled={busy} onClick={() => setStatus("approved")} data-testid="decision-approve" className="bg-emerald-500 text-black hover:bg-emerald-400 rounded-sm"><CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />Approve</Button>}
          {status !== "rejected" && <Button size="sm" disabled={busy} onClick={() => setStatus("rejected")} data-testid="decision-reject" variant="outline" className="border-red-400/40 text-red-300 hover:bg-red-500/10 rounded-sm"><XCircle className="w-3.5 h-3.5 mr-1.5" />Reject</Button>}
          {status === "approved" && <Button size="sm" disabled={busy} onClick={() => setStatus("reversed")} data-testid="decision-reverse" variant="outline" className="border-amber-400/40 text-amber-300 hover:bg-amber-500/10 rounded-sm"><RefreshCw className="w-3.5 h-3.5 mr-1.5" />Reverse</Button>}
          {status === "approved" && <Button size="sm" disabled={busy} onClick={() => setStatus("superseded")} data-testid="decision-supersede" variant="outline" className="border-white/10 hover:bg-white/5 rounded-sm"><AlertTriangle className="w-3.5 h-3.5 mr-1.5" />Mark superseded</Button>}
          <div className="flex-1" />
          <Button variant="outline" onClick={onClose} className="border-white/10 hover:bg-white/5 rounded-sm">Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
