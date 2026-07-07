import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { ArrowRight, GitBranch, History } from "lucide-react";
import { toast } from "sonner";

/**
 * Inline toolbar under an AI comparison panel: Continue thread, Branch scenario,
 * View versions. Backend: /api/ai/threads/{id}/continue|branch|versions
 */
export default function ThreadActions({ threadId, parentQuestion }) {
  const [mode, setMode] = useState(null); // 'continue' | 'branch' | 'versions'
  if (!threadId) return null;

  return (
    <div className="px-4 py-3 border-t border-white/5 bg-black/40 flex items-center gap-2 flex-wrap" data-testid="thread-actions">
      <Button
        size="sm"
        variant="outline"
        onClick={() => setMode("continue")}
        data-testid="thread-continue-btn"
        className="border-purple-400/40 bg-purple-500/10 text-purple-200 hover:bg-purple-500/20 rounded-sm"
      >
        <ArrowRight className="w-3.5 h-3.5 mr-1.5" /> Continue thread
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={() => setMode("branch")}
        data-testid="thread-branch-btn"
        className="border-white/10 bg-transparent hover:bg-white/5 rounded-sm"
      >
        <GitBranch className="w-3.5 h-3.5 mr-1.5" /> Branch scenario
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={() => setMode("versions")}
        data-testid="thread-versions-btn"
        className="border-white/10 bg-transparent hover:bg-white/5 rounded-sm"
      >
        <History className="w-3.5 h-3.5 mr-1.5" /> Version history
      </Button>
      <span className="text-[10px] text-zinc-500 ml-auto font-mono uppercase tracking-widest">
        Q: {parentQuestion?.slice(0, 60)}{parentQuestion?.length > 60 ? "…" : ""}
      </span>

      {mode === "continue" && <ContinueDialog threadId={threadId} onClose={() => setMode(null)} />}
      {mode === "branch" && <BranchDialog threadId={threadId} onClose={() => setMode(null)} />}
      {mode === "versions" && <VersionsDialog threadId={threadId} onClose={() => setMode(null)} />}
    </div>
  );
}

function ContinueDialog({ threadId, onClose }) {
  const [question, setQuestion] = useState("");
  const [addedContext, setAddedContext] = useState("");
  const [memoryMode, setMemoryMode] = useState("chat");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!question.trim()) return;
    setBusy(true);
    try {
      const { data } = await api.post(`/ai/threads/${threadId}/continue`, {
        question, added_context: addedContext || null, memory_mode: memoryMode,
      });
      const n = (data?.memory_sources || []).length;
      toast.success(n > 0 ? `Continued · grounded on ${n} memory items` : "Continued thread");
      onClose?.();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Continue failed");
    } finally { setBusy(false); }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-[#0a0a0a] border-white/10 text-white max-w-lg" data-testid="continue-thread-dialog">
        <DialogHeader><DialogTitle>Continue this AI thread</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <div className="label-mono mb-1.5">FOLLOW-UP QUESTION</div>
            <Textarea data-testid="continue-question" value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="What's a follow-up question or new angle to explore?" className="bg-[#121214] border-white/10 rounded-sm min-h-[80px]" />
          </div>
          <div>
            <div className="label-mono mb-1.5">NEW CONTEXT (OPTIONAL)</div>
            <Textarea data-testid="continue-context" value={addedContext} onChange={(e) => setAddedContext(e.target.value)} placeholder="Any new info the team learned since the original answer..." className="bg-[#121214] border-white/10 rounded-sm min-h-[60px]" />
          </div>
          <div className="flex items-center gap-2 flex-wrap" data-testid="continue-memory-mode">
            {[["chat", "This chat"], ["project", "This project"], ["workspace", "Full workspace"], ["none", "No memory"]].map(([k, label]) => (
              <button key={k} type="button" onClick={() => setMemoryMode(k)} data-testid={`continue-mem-${k}`} className={`text-[10px] font-mono uppercase tracking-widest px-2.5 py-1 border rounded-sm transition-colors ${memoryMode === k ? "border-purple-400 bg-purple-500/15 text-purple-200" : "border-white/10 text-zinc-400 hover:border-purple-400/40"}`}>{label}</button>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="border-white/10 bg-transparent hover:bg-white/5 rounded-sm">Cancel</Button>
          <Button data-testid="continue-submit" onClick={submit} disabled={busy || !question.trim()} className="bg-purple-500 hover:bg-purple-400 text-white rounded-sm">
            {busy ? "Asking…" : "Continue"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BranchDialog({ threadId, onClose }) {
  const [name, setName] = useState("");
  const [scenario, setScenario] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!name.trim() || !scenario.trim()) return;
    setBusy(true);
    try {
      const { data } = await api.post(`/ai/threads/${threadId}/branch`, { branch_name: name, scenario_description: scenario });
      toast.success(`Branched as "${data.branch_name}"`);
      onClose?.();
    } catch (e) { toast.error(e?.response?.data?.detail || "Branch failed"); }
    finally { setBusy(false); }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-[#0a0a0a] border-white/10 text-white max-w-lg" data-testid="branch-thread-dialog">
        <DialogHeader><DialogTitle>Branch into a new scenario</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <div className="label-mono mb-1.5">SCENARIO NAME</div>
            <Input data-testid="branch-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Frisco rent 20% higher" className="bg-[#121214] border-white/10 rounded-sm" />
          </div>
          <div>
            <div className="label-mono mb-1.5">NEW ASSUMPTIONS / CONDITIONS</div>
            <Textarea data-testid="branch-scenario" value={scenario} onChange={(e) => setScenario(e.target.value)} placeholder="Describe what's different in this branch..." className="bg-[#121214] border-white/10 rounded-sm min-h-[120px]" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="border-white/10 bg-transparent hover:bg-white/5 rounded-sm">Cancel</Button>
          <Button data-testid="branch-submit" onClick={submit} disabled={busy || !name.trim() || !scenario.trim()} className="bg-yellow-500 text-black hover:bg-yellow-400 rounded-sm">
            {busy ? "Branching…" : "Create branch"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function VersionsDialog({ threadId, onClose }) {
  const [versions, setVersions] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api.get(`/ai/threads/${threadId}/versions`)
      .then(({ data }) => { if (!cancelled) setVersions(data.versions || []); })
      .catch(() => { if (!cancelled) setVersions([]); });
    return () => { cancelled = true; };
  }, [threadId]);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-[#0a0a0a] border-white/10 text-white max-w-2xl" data-testid="versions-dialog">
        <DialogHeader><DialogTitle>Version history</DialogTitle></DialogHeader>
        <div className="py-2 max-h-[60vh] overflow-y-auto space-y-2">
          {versions === null && <div className="text-zinc-500">Loading…</div>}
          {versions && versions.length === 0 && (
            <div className="text-zinc-500">This thread has no versions yet. Use &quot;Continue&quot; or &quot;Branch&quot; to fork it.</div>
          )}
          {versions?.map((v) => (
            <div key={v.id} data-testid={`version-${v.version_number}`} className="border border-white/10 rounded-sm p-3">
              <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-1">
                v{v.version_number} · {v.kind} · {(v.created_at || "").slice(0, 16)}
              </div>
              {v.question && <div className="text-sm text-white mb-1">{v.question}</div>}
              {v.branch_name && <div className="text-sm text-yellow-300">Branch: {v.branch_name}</div>}
              {v.scenario_description && <div className="text-xs text-zinc-400 italic">&quot;{v.scenario_description}&quot;</div>}
              {v.final_answer && <div className="text-xs text-zinc-300 mt-2 line-clamp-3">{v.final_answer}</div>}
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="border-white/10 bg-transparent hover:bg-white/5 rounded-sm">Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
