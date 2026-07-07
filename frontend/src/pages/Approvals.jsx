import { useEffect, useMemo, useState } from "react";
import { api, API } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  CheckCircle2,
  XCircle,
  RefreshCcw,
  Lock,
  FileText,
  Download,
  Clock,
  ArrowRight,
  AlertCircle,
} from "lucide-react";

const STATUS_BADGE = {
  draft: { bg: "bg-zinc-500/15", border: "border-zinc-400/40", text: "text-zinc-300", label: "DRAFT" },
  needs_review: { bg: "bg-yellow-500/15", border: "border-yellow-500/40", text: "text-yellow-300", label: "NEEDS REVIEW" },
  approved: { bg: "bg-green-500/15", border: "border-green-500/40", text: "text-green-300", label: "APPROVED" },
  rejected: { bg: "bg-red-500/15", border: "border-red-500/40", text: "text-red-300", label: "REJECTED" },
  needs_revision: { bg: "bg-orange-500/15", border: "border-orange-500/40", text: "text-orange-300", label: "NEEDS REVISION" },
  archived: { bg: "bg-zinc-700/30", border: "border-zinc-600/40", text: "text-zinc-500", label: "ARCHIVED" },
};

function StatusBadge({ status }) {
  const s = STATUS_BADGE[status] || STATUS_BADGE.draft;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-mono uppercase tracking-widest rounded-sm border ${s.bg} ${s.border} ${s.text}`}>
      {s.label}
    </span>
  );
}

export default function Approvals() {
  const { user } = useAuth();
  const [tab, setTab] = useState("all");
  const [items, setItems] = useState([]);
  const [members, setMembers] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (tab === "needs_review") params.set("status", "needs_review");
      if (tab === "approved") params.set("status", "approved");
      if (tab === "mine") params.set("mine", "true");
      const [a, b] = await Promise.all([
        api.get(`/approvals?${params.toString()}`),
        api.get("/workspace/members"),
      ]);
      setItems(a.data || []);
      setMembers(b.data || []);
    } catch (e) {
      console.warn("[approvals]", e);
    } finally {
      setLoading(false);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [tab]);

  const counts = useMemo(() => ({
    pending: items.filter((i) => ["needs_review", "needs_revision"].includes(i.status)).length,
    approved: items.filter((i) => i.status === "approved").length,
  }), [items]);

  return (
    <div className="min-h-screen p-6 lg:p-10 max-w-6xl">
      <div className="mb-8">
        <div className="label-mono mb-2">APPROVALS</div>
        <h1 className="font-display text-3xl lg:text-4xl font-bold tracking-tight mb-1">
          Final answers <span className="text-yellow-400">awaiting decision</span>
        </h1>
        <p className="text-sm text-zinc-400 max-w-2xl">
          Send AI research final answers to reviewers, lock approved versions, and export them as PDF/Word.
        </p>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <TabsList className="bg-[#0a0a0a] border border-white/10 rounded-sm p-1 mb-6">
          {[
            { v: "all", label: "All", testid: "tab-all" },
            { v: "needs_review", label: `Needs review (${counts.pending})`, testid: "tab-needs-review" },
            { v: "approved", label: `Approved (${counts.approved})`, testid: "tab-approved" },
            { v: "mine", label: "Involves me", testid: "tab-mine" },
          ].map((t) => (
            <TabsTrigger
              key={t.v}
              value={t.v}
              data-testid={t.testid}
              className="font-mono uppercase text-[10px] tracking-widest data-[state=active]:bg-yellow-500 data-[state=active]:text-black rounded-sm"
            >
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value={tab}>
          {loading ? (
            <div className="space-y-2">
              <div className="h-20 shimmer rounded-sm" />
              <div className="h-20 shimmer rounded-sm" />
            </div>
          ) : items.length === 0 ? (
            <div className="border border-white/10 bg-[#121214] rounded-sm p-12 text-center">
              <FileText className="w-7 h-7 text-zinc-600 mx-auto mb-3" />
              <div className="font-display text-lg mb-1">No approvals here</div>
              <p className="text-xs text-zinc-500">
                Open any AI research thread and click <span className="text-yellow-300">&quot;Send for approval&quot;</span> on its final answer to add it here.
              </p>
            </div>
          ) : (
            <div className="space-y-2" data-testid="approval-list">
              {items.map((a) => (
                <ApprovalRow key={a.id} a={a} members={members} onOpen={() => setSelected(a)} />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <ApprovalDialog
        open={!!selected}
        onOpenChange={(v) => !v && setSelected(null)}
        approval={selected}
        members={members}
        currentUser={user}
        onChanged={(updated) => {
          setSelected(updated);
          load();
        }}
      />
    </div>
  );
}

function ApprovalRow({ a, members, onOpen }) {
  const reviewers = (a.reviewer_ids || []).map((id) => members.find((m) => m.id === id)?.name || "—");
  return (
    <button
      onClick={onOpen}
      data-testid={`approval-row-${a.id}`}
      className="w-full border border-white/10 hover:border-yellow-500/40 bg-[#121214] hover:bg-yellow-500/[0.03] rounded-sm p-4 text-left transition-colors group"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <StatusBadge status={a.status} />
            {a.locked && <Lock className="w-3 h-3 text-yellow-400" />}
            <span className="text-[10px] font-mono text-zinc-600">v{a.version}</span>
          </div>
          <div className="font-display text-base font-medium mb-1 truncate">{a.title}</div>
          <div className="text-xs text-zinc-500 truncate">
            {a.final_answer?.slice(0, 140)}{a.final_answer?.length > 140 ? "…" : ""}
          </div>
          {reviewers.length > 0 && (
            <div className="text-[10px] font-mono text-zinc-500 mt-2 flex items-center gap-1.5">
              <span>REVIEWERS:</span>
              <span className="text-zinc-300">{reviewers.join(", ")}</span>
            </div>
          )}
        </div>
        <ArrowRight className="w-4 h-4 text-zinc-600 group-hover:text-yellow-400 mt-1 shrink-0" />
      </div>
    </button>
  );
}

function ApprovalDialog({ open, onOpenChange, approval, members, currentUser, onChanged }) {
  const [busy, setBusy] = useState(null);
  const [comment, setComment] = useState("");
  const [editingTitle, setEditingTitle] = useState("");
  const [editingAnswer, setEditingAnswer] = useState("");
  const [editingReviewers, setEditingReviewers] = useState(new Set());

  useEffect(() => {
    if (approval) {
      setEditingTitle(approval.title || "");
      setEditingAnswer(approval.final_answer || "");
      setEditingReviewers(new Set(approval.reviewer_ids || []));
      setComment("");
    }
  }, [approval]);

  if (!approval) return null;

  const isCreator = approval.created_by === currentUser?.id;
  const isReviewer = (approval.reviewer_ids || []).includes(currentUser?.id);
  const isAdmin = ["owner", "admin"].includes(currentUser?.role);
  const canDecide = (isReviewer || isAdmin) && !approval.locked;
  const canEdit = (isCreator || isAdmin) && !approval.locked;

  const decide = async (status) => {
    setBusy(status);
    try {
      const { data } = await api.post(`/approvals/${approval.id}/decision`, { status, comment });
      toast.success(`Marked as ${status.replace("_", " ")}`);
      onChanged(data);
      setComment("");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Decision failed");
    } finally { setBusy(null); }
  };

  const saveEdits = async () => {
    setBusy("save");
    try {
      const { data } = await api.patch(`/approvals/${approval.id}`, {
        title: editingTitle,
        final_answer: editingAnswer,
        reviewer_ids: Array.from(editingReviewers),
      });
      toast.success("Saved");
      onChanged(data);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Save failed");
    } finally { setBusy(null); }
  };

  const exportTo = (fmt) => {
    const url = `${API}/export/approval/${approval.id}?format=${fmt}`;
    // Auth cookie ride along via credentials: "include".
    fetch(url, { credentials: "include" })
      .then((r) => r.blob())
      .then((blob) => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `approval-${approval.id.slice(0, 8)}.${fmt}`;
        a.click();
        URL.revokeObjectURL(a.href);
      })
      .catch(() => toast.error("Export failed"));
  };

  const eligibleReviewers = members.filter((m) => m.id !== currentUser?.id);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#0a0a0a] border-white/10 rounded-sm max-w-3xl max-h-[90vh] overflow-y-auto" data-testid="approval-dialog">
        <DialogHeader>
          <div className="flex items-center gap-2 flex-wrap">
            <StatusBadge status={approval.status} />
            {approval.locked && (
              <span className="inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-widest text-yellow-400">
                <Lock className="w-3 h-3" /> LOCKED
              </span>
            )}
            <span className="text-[10px] font-mono text-zinc-500">v{approval.version}</span>
          </div>
          <DialogTitle className="font-display tracking-tight text-2xl mt-1">{approval.title}</DialogTitle>
          <DialogDescription className="sr-only">
            Approval workflow for an AI research final answer. Review, edit, decide, or export.
          </DialogDescription>
        </DialogHeader>

        {/* Edit area */}
        {canEdit ? (
          <div className="space-y-3">
            <div>
              <div className="label-mono mb-1">TITLE</div>
              <Input
                data-testid="approval-edit-title"
                value={editingTitle}
                onChange={(e) => setEditingTitle(e.target.value)}
                className="bg-[#121214] border-white/10 rounded-sm"
              />
            </div>
            <div>
              <div className="label-mono mb-1">FINAL ANSWER</div>
              <Textarea
                data-testid="approval-edit-answer"
                value={editingAnswer}
                onChange={(e) => setEditingAnswer(e.target.value)}
                rows={10}
                className="bg-[#121214] border-white/10 rounded-sm font-sans text-sm"
              />
            </div>
            <div>
              <div className="label-mono mb-1.5">REVIEWERS</div>
              <div className="flex flex-wrap gap-1.5">
                {eligibleReviewers.map((m) => {
                  const on = editingReviewers.has(m.id);
                  return (
                    <button
                      key={m.id}
                      onClick={() => {
                        const next = new Set(editingReviewers);
                        if (on) next.delete(m.id); else next.add(m.id);
                        setEditingReviewers(next);
                      }}
                      className={`px-2.5 py-1 text-[11px] rounded-sm border ${on ? "bg-yellow-500 text-black border-yellow-500" : "border-white/10 text-zinc-300 hover:border-yellow-500/30"}`}
                    >
                      {m.name}
                    </button>
                  );
                })}
              </div>
            </div>
            <Button
              data-testid="approval-save"
              onClick={saveEdits}
              disabled={busy === "save"}
              size="sm"
              className="bg-white text-black hover:bg-zinc-200 rounded-sm font-mono uppercase text-[10px] tracking-widest h-8"
            >
              {busy === "save" ? "Saving…" : "Save changes"}
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="text-sm text-zinc-200 whitespace-pre-wrap border-l-2 border-yellow-500/30 pl-3">{approval.final_answer}</div>
          </div>
        )}

        {/* Decision history */}
        {approval.decisions?.length > 0 && (
          <div className="mt-2 border-t border-white/5 pt-3">
            <div className="label-mono mb-2">DECISION HISTORY</div>
            <div className="space-y-1.5" data-testid="approval-history">
              {approval.decisions.map((d, idx) => (
                <div key={`${d.by}-${d.at}-${idx}`} className="text-xs flex items-start gap-2 text-zinc-300">
                  <Clock className="w-3 h-3 text-zinc-500 mt-0.5 shrink-0" />
                  <div>
                    <span className="font-medium">{d.by_name}</span>{" "}
                    <span className="text-zinc-500">{d.status.replace("_", " ")}</span>
                    {d.comment && <span className="text-zinc-400"> — &ldquo;{d.comment}&rdquo;</span>}
                    <span className="text-zinc-600 ml-2 font-mono text-[10px]">{new Date(d.at).toLocaleString()}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Decision controls */}
        {canDecide && (
          <div className="mt-3 border-t border-white/5 pt-3">
            <div className="label-mono mb-2">YOUR DECISION</div>
            <Textarea
              data-testid="approval-comment"
              placeholder="Optional comment for the requester…"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={2}
              className="bg-[#121214] border-white/10 rounded-sm text-xs mb-2"
            />
            <div className="flex flex-wrap gap-2">
              <Button data-testid="approval-approve" onClick={() => decide("approved")} disabled={busy === "approved"} className="bg-green-500 hover:bg-green-400 text-black rounded-sm font-mono uppercase text-[10px] tracking-widest h-9">
                <CheckCircle2 className="w-4 h-4 mr-1.5" /> {busy === "approved" ? "…" : "Approve & lock"}
              </Button>
              <Button data-testid="approval-revision" onClick={() => decide("needs_revision")} disabled={busy === "needs_revision"} variant="outline" className="border-orange-400/40 text-orange-300 hover:bg-orange-500/10 rounded-sm font-mono uppercase text-[10px] tracking-widest h-9">
                <RefreshCcw className="w-4 h-4 mr-1.5" /> Needs revision
              </Button>
              <Button data-testid="approval-reject" onClick={() => decide("rejected")} disabled={busy === "rejected"} variant="outline" className="border-red-400/40 text-red-300 hover:bg-red-500/10 rounded-sm font-mono uppercase text-[10px] tracking-widest h-9">
                <XCircle className="w-4 h-4 mr-1.5" /> Reject
              </Button>
            </div>
          </div>
        )}

        {!canDecide && !canEdit && (
          <div className="text-[11px] text-zinc-500 flex items-start gap-2">
            <AlertCircle className="w-3.5 h-3.5 mt-0.5" />
            You can view this approval but not edit or decide. {approval.locked ? "Locked after approval." : "Not assigned as a reviewer."}
          </div>
        )}

        {/* Export */}
        <div className="border-t border-white/5 pt-3 flex gap-2 flex-wrap">
          <Button data-testid="approval-export-pdf" onClick={() => exportTo("pdf")} variant="outline" size="sm" className="border-white/10 bg-transparent hover:bg-white/5 rounded-sm font-mono uppercase text-[10px] tracking-widest h-8">
            <Download className="w-3.5 h-3.5 mr-1.5" /> Export PDF
          </Button>
          <Button data-testid="approval-export-docx" onClick={() => exportTo("docx")} variant="outline" size="sm" className="border-white/10 bg-transparent hover:bg-white/5 rounded-sm font-mono uppercase text-[10px] tracking-widest h-8">
            <Download className="w-3.5 h-3.5 mr-1.5" /> Export Word
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
