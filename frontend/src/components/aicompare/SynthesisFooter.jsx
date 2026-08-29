import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, API } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Sparkles, Save, CheckCircle2, Download, Copy, Share2, Brain, Mail, Zap } from "lucide-react";
import { toast } from "sonner";
import DraftEmailDialog from "@/components/aicompare/DraftEmailDialog";

/** Synthesized final-answer block — body + action buttons. */
export default function SynthesisFooter({ thread, threadId, onTask, onSave, onShare }) {
  const nav = useNavigate();
  const [draftOpen, setDraftOpen] = useState(false);
  if (!thread.final_answer) return null;

  const saveToKnowledge = async () => {
    try {
      await api.post(`/ai/threads/${threadId}/save-knowledge`);
      toast.success("Saved to Team Knowledge");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Couldn't save to knowledge");
    }
  };

  const automateThis = () => {
    const prompt = `Watch this topic and alert me with updates: ${thread.question || "this research"}`;
    nav(`/automations?prompt=${encodeURIComponent(prompt)}`);
  };

  const copyAnswer = async () => {
    try {
      await navigator.clipboard.writeText(thread.final_answer);
      toast.success("Answer copied — paste it into any chat");
    } catch {
      toast.error("Couldn't copy — long-press the text to select");
    }
  };

  const exportPdf = () => {
    fetch(`${API}/export/research/${threadId}?format=pdf`, { credentials: "include" })
      .then((r) => r.blob())
      .then((blob) => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `research-${threadId.slice(0, 8)}.pdf`;
        a.click();
        URL.revokeObjectURL(a.href);
      })
      .catch(() => toast.error("Export failed"));
  };

  const sendForApproval = async () => {
    try {
      await api.post("/approvals", {
        research_thread_id: threadId,
        title: (thread.question || "Final answer").slice(0, 200),
        final_answer: thread.final_answer,
        reviewer_ids: [],
      });
      toast.success("Created approval (draft) · open Approvals to add reviewers");
      window.location.href = "/approvals";
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not create approval");
    }
  };

  return (
    <div className="border-t border-yellow-500/30 bg-black p-5">
      <div className="label-mono text-yellow-400 mb-2 flex items-center gap-2">
        <Sparkles className="w-3 h-3" /> SYNTHESIZED FINAL ANSWER
      </div>
      <div className="text-sm text-zinc-100 whitespace-pre-wrap leading-relaxed">{thread.final_answer}</div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          data-testid="copy-synthesis"
          size="sm"
          onClick={copyAnswer}
          className="bg-white text-black hover:bg-zinc-200 rounded-sm font-mono uppercase text-[10px] tracking-widest"
        >
          <Copy className="w-3 h-3 mr-1" />
          Copy answer
        </Button>
        {onShare && (
          <Button
            data-testid="share-synthesis"
            size="sm"
            variant="outline"
            onClick={onShare}
            className="border-blue-400/40 text-blue-300 hover:bg-blue-500/10 rounded-sm font-mono uppercase text-[10px] tracking-widest"
          >
            <Share2 className="w-3 h-3 mr-1" />
            {thread.public_token ? "Copy link" : "Share"}
          </Button>
        )}
        <Button
          data-testid="task-from-synthesis"
          size="sm"
          onClick={() => onTask({ id: `synth-${threadId}`, answer: thread.final_answer, model_name: "Synthesis" })}
          className="bg-yellow-500 text-black hover:bg-yellow-400 rounded-sm font-mono uppercase text-[10px] tracking-widest"
        >
          <Sparkles className="w-3 h-3 mr-1" />
          Create task & assign
        </Button>
        <Button
          data-testid="save-synthesis"
          size="sm"
          variant="outline"
          onClick={() => onSave({ id: "synth", answer: thread.final_answer, model_name: "Synthesis" })}
          className="border-white/10 bg-transparent hover:bg-white/5 rounded-sm font-mono uppercase text-[10px] tracking-widest"
        >
          <Save className="w-3 h-3 mr-1" />
          Save to project
        </Button>
        <Button
          data-testid="save-to-knowledge"
          size="sm"
          variant="outline"
          onClick={saveToKnowledge}
          className="border-blue-400/40 text-blue-300 hover:bg-blue-500/10 rounded-sm font-mono uppercase text-[10px] tracking-widest"
        >
          <Brain className="w-3 h-3 mr-1" />
          Save to knowledge
        </Button>
        <Button
          data-testid="draft-email"
          size="sm"
          variant="outline"
          onClick={() => setDraftOpen(true)}
          className="border-white/10 bg-transparent hover:bg-white/5 rounded-sm font-mono uppercase text-[10px] tracking-widest"
        >
          <Mail className="w-3 h-3 mr-1" />
          Draft email
        </Button>
        <Button
          data-testid="ask-another-ai"
          size="sm"
          variant="outline"
          onClick={() => nav("/ai?tab=research")}
          className="border-purple-400/40 text-purple-300 hover:bg-purple-500/10 rounded-sm font-mono uppercase text-[10px] tracking-widest"
        >
          <Sparkles className="w-3 h-3 mr-1" />
          Ask another AI
        </Button>
        <Button
          data-testid="automate-this"
          size="sm"
          variant="outline"
          onClick={automateThis}
          className="border-yellow-400/40 text-yellow-300 hover:bg-yellow-500/10 rounded-sm font-mono uppercase text-[10px] tracking-widest"
        >
          <Zap className="w-3 h-3 mr-1" />
          Automate this
        </Button>
        <Button
          data-testid="send-for-approval"
          size="sm"
          variant="outline"
          onClick={sendForApproval}
          className="border-green-400/40 text-green-300 hover:bg-green-500/10 rounded-sm font-mono uppercase text-[10px] tracking-widest"
        >
          <CheckCircle2 className="w-3 h-3 mr-1" />
          Send for approval
        </Button>
        <Button
          data-testid="export-research-pdf"
          size="sm"
          variant="outline"
          onClick={exportPdf}
          className="border-white/10 bg-transparent hover:bg-white/5 rounded-sm font-mono uppercase text-[10px] tracking-widest"
        >
          <Download className="w-3 h-3 mr-1" />
          Export PDF
        </Button>
      </div>
      {draftOpen && (
        <DraftEmailDialog content={thread.final_answer} onClose={() => setDraftOpen(false)} />
      )}
    </div>
  );
}
