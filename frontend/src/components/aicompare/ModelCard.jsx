import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Trophy, CheckCheck, BookOpen, ThumbsUp, Save, Sparkles, Brain, Mail, Zap } from "lucide-react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import DraftEmailDialog from "@/components/aicompare/DraftEmailDialog";

const VOTE_BTNS = [
  { key: "best", label: "Best", icon: Trophy },
  { key: "most_accurate", label: "Accurate", icon: CheckCheck },
  { key: "best_citations", label: "Citations", icon: BookOpen },
  { key: "most_useful", label: "Useful", icon: ThumbsUp },
];

/** Single model column in the AI comparison strip. */
export default function ModelCard({ modelKey, response, threadId, isLoading, onVote, onSelectBest, onSave, onTask }) {
  const name = response?.model_name || modelKey;
  const nav = useNavigate();
  const [draftOpen, setDraftOpen] = useState(false);

  const saveToKnowledge = async () => {
    try {
      await api.post(`/ai/threads/${threadId}/save-knowledge`);
      toast.success("Saved to Team Knowledge");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Couldn't save to knowledge");
    }
  };
  const automateThis = () =>
    nav(`/automations?prompt=${encodeURIComponent("Watch this topic and alert me with updates")}`);

  return (
    <div
      className={`w-full sm:w-[340px] sm:shrink-0 bg-[#0a0a0a] border-t-2 ${
        response?.selected_as_best ? "border-yellow-400" : "border-transparent"
      } flex flex-col sm:h-full`}
    >
      <div className="px-4 py-3 border-b border-white/5 shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <div className="label-mono text-zinc-500">{response?.real === false ? "SIMULATED" : "MODEL"}</div>
            <div className="font-display font-bold text-sm tracking-tight">{name}</div>
          </div>
          {response?.confidence_score != null && (
            <div className="text-right">
              <div className="font-mono text-xs text-yellow-400">{response.confidence_score}%</div>
              <div className="label-mono text-[9px]">CONF.</div>
            </div>
          )}
        </div>
      </div>

      <div
        className="p-4 text-sm text-zinc-200 whitespace-pre-wrap leading-relaxed sm:flex-1 sm:overflow-y-auto sm:min-h-0"
        data-testid={`model-answer-${modelKey}`}
      >
        {isLoading ? (
          <div className="space-y-2">
            <div className="h-3 shimmer rounded-sm" />
            <div className="h-3 shimmer rounded-sm w-4/5" />
            <div className="h-3 shimmer rounded-sm w-3/5" />
          </div>
        ) : response ? (
          response.answer
        ) : (
          <div className="text-zinc-500">No response</div>
        )}
      </div>

      {response && (
        <div className="border-t border-white/10 bg-[#0a0a0a] px-4 py-3 shrink-0 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className="label-mono mb-1">STRENGTHS</div>
              <ul className="text-[11px] text-zinc-400 space-y-0.5">
                {response.strengths.map((s, i) => <li key={`s-${i}-${s.slice(0, 16)}`}>+ {s}</li>)}
              </ul>
            </div>
            <div>
              <div className="label-mono mb-1">WEAKNESSES</div>
              <ul className="text-[11px] text-zinc-400 space-y-0.5">
                {response.weaknesses.map((s, i) => <li key={`w-${i}-${s.slice(0, 16)}`}>– {s}</li>)}
              </ul>
            </div>
          </div>
          <div className="flex flex-wrap gap-1">
            {VOTE_BTNS.map((v) => {
              const count = (response.votes?.[v.key] || []).length;
              return (
                <button
                  key={v.key}
                  data-testid={`vote-${modelKey}-${v.key}`}
                  onClick={() => onVote(v.key)}
                  className="border border-white/10 hover:border-yellow-500/40 hover:bg-yellow-500/5 text-[10px] font-mono uppercase tracking-widest text-zinc-400 hover:text-yellow-200 px-2 py-1 rounded-sm flex items-center gap-1"
                >
                  <v.icon className="w-3 h-3" />
                  {v.label}
                  {count > 0 && <span className="text-yellow-400">{count}</span>}
                </button>
              );
            })}
          </div>
          <div className="flex gap-1">
            <button
              data-testid={`select-best-${modelKey}`}
              onClick={onSelectBest}
              title="Mark as best → AI re-synthesizes with this weighted heavier and posts in chat"
              className="bg-white text-black hover:bg-zinc-200 text-[10px] font-mono uppercase tracking-widest py-1.5 px-2 rounded-sm shrink-0"
            >
              Mark Best & Re-synth
            </button>
            <button
              data-testid={`task-${modelKey}`}
              onClick={onTask}
              title="Create task from this answer (AI will draft & suggest assignee)"
              className="flex-1 border border-yellow-500/40 bg-yellow-500/5 hover:bg-yellow-500/15 text-yellow-200 text-[10px] font-mono uppercase tracking-widest py-1.5 rounded-sm flex items-center justify-center gap-1.5"
            >
              <Sparkles className="w-3 h-3" />
              Create task
            </button>
            <button
              data-testid={`save-${modelKey}`}
              onClick={onSave}
              title="Save to project folder"
              className="border border-white/10 hover:bg-white/5 px-2 text-[10px] font-mono uppercase tracking-widest py-1.5 rounded-sm shrink-0"
            >
              <Save className="w-3 h-3" />
            </button>
          </div>
          {response?.answer && (
            <div className="flex flex-wrap gap-1.5 mt-2" data-testid={`model-actions-${modelKey}`}>
              <button data-testid={`model-save-knowledge-${modelKey}`} onClick={saveToKnowledge} className="border border-blue-400/40 text-blue-300 hover:bg-blue-500/10 text-[10px] font-mono uppercase tracking-widest py-1 px-2 rounded-sm inline-flex items-center gap-1">
                <Brain className="w-3 h-3" /> Knowledge
              </button>
              <button data-testid={`model-draft-email-${modelKey}`} onClick={() => setDraftOpen(true)} className="border border-white/10 hover:bg-white/5 text-zinc-300 text-[10px] font-mono uppercase tracking-widest py-1 px-2 rounded-sm inline-flex items-center gap-1">
                <Mail className="w-3 h-3" /> Draft email
              </button>
              <button data-testid={`model-automate-${modelKey}`} onClick={automateThis} className="border border-yellow-400/40 text-yellow-300 hover:bg-yellow-500/10 text-[10px] font-mono uppercase tracking-widest py-1 px-2 rounded-sm inline-flex items-center gap-1">
                <Zap className="w-3 h-3" /> Automate
              </button>
            </div>
          )}
          {draftOpen && (
            <DraftEmailDialog content={response.answer} onClose={() => setDraftOpen(false)} />
          )}
        </div>
      )}
    </div>
  );
}
