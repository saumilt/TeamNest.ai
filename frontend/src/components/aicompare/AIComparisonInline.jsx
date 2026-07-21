import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Layers, Trophy, CheckCheck, BookOpen, ThumbsUp, Sparkles, Save, Copy, Share2, Wand2, X, Maximize2, Plus,
} from "lucide-react";
import NewTaskDialog from "@/components/NewTaskDialog";
import SaveToFolderDialog from "@/components/aicompare/SaveToFolderDialog";
import { api } from "@/lib/api";
import { useResearchThread } from "@/hooks/useResearchThread";

const VOTE_BTNS = [
  { key: "best", label: "Best", icon: Trophy },
  { key: "most_accurate", label: "Accurate", icon: CheckCheck },
  { key: "best_citations", label: "Citations", icon: BookOpen },
  { key: "most_useful", label: "Useful", icon: ThumbsUp },
];

/**
 * Mobile comparison view — renders the research thread inline in the chat feed
 * as a sequence of message bubbles (one per model + a synthesized final answer)
 * instead of a floating panel. Keeps full parity with the desktop panel:
 * vote, mark-best & re-synth, create task, save, copy and share.
 */
export default function AIComparisonInline({ threadId, chatId, onClose, onExpand }) {
  const { data, synthesizing, vote, selectBest, synthesize, share, runModels } = useResearchThread(
    threadId,
    { onAfterSelectBest: onClose },
  );
  const [showSave, setShowSave] = useState(null);
  const [showTask, setShowTask] = useState(null);
  const [allModels, setAllModels] = useState([]);
  const [expanding, setExpanding] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    api.get("/ai/models").then(({ data }) => setAllModels(data || [])).catch(() => {});
  }, []);

  useEffect(() => {
    // Bring the freshly-opened comparison into view within the chat scroll.
    const t = setTimeout(() => rootRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 250);
    return () => clearTimeout(t);
  }, []);

  if (!data) {
    return <div className="label-mono text-yellow-400/80 px-1 py-3">LOADING COMPARISON…</div>;
  }

  const { thread, responses } = data;
  const isLoading = thread.status === "running";
  const readyCount = responses.length;

  const copyAnswer = async () => {
    try {
      await navigator.clipboard.writeText(thread.final_answer || "");
      toast.success("Answer copied — paste it into any chat");
    } catch {
      toast.error("Couldn't copy — long-press the text to select");
    }
  };

  const leftover = allModels.filter((m) => !thread.selected_models.includes(m.key));
  const compareMore = async () => {
    if (leftover.length === 0) return;
    setExpanding(true);
    await runModels(leftover.map((m) => m.key));
    setExpanding(false);
  };

  return (
    <div ref={rootRef} data-testid="ai-comparison-inline" className="space-y-2.5 py-2">
      {/* divider */}
      <div className="flex items-center gap-2 py-1">
        <div className="h-px flex-1 bg-white/10" />
        <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-yellow-400">
          <Layers className="w-3 h-3" /> AI compared {thread.selected_models.length} models · {readyCount} ready
        </div>
        {onExpand && (
          <button
            type="button"
            onClick={onExpand}
            data-testid="open-fullscreen-comparison"
            aria-label="Open full-screen comparison"
            title="Open full-screen comparison"
            className="text-zinc-500 hover:text-white p-0.5"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          data-testid="close-comparison-inline"
          aria-label="Hide comparison"
          className="text-zinc-500 hover:text-white p-0.5"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* one bubble per model — stacked on mobile, side-by-side on desktop */}
      <div className="flex flex-col md:flex-row md:flex-wrap gap-2.5">
      {thread.selected_models.map((mk) => {
        const r = responses.find((x) => x.model_key === mk);
        return (
          <div key={mk} className="w-full md:w-[calc(50%-6px)] xl:w-[calc(33.333%-7px)]">
            <div
              className={`h-full w-full bg-[#0e0e0e] border rounded-2xl rounded-bl-sm overflow-hidden ${
                r?.selected_as_best ? "border-yellow-400" : "border-white/10"
              }`}
            >
              <div className="flex items-center justify-between px-3.5 pt-2.5">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-[9px] font-mono uppercase tracking-widest text-zinc-500 shrink-0">
                    {r?.real === false ? "Simulated" : "Model"}
                  </span>
                  <span className="text-[13px] font-bold truncate">{r?.model_name || mk}</span>
                </div>
                {r?.confidence_score != null && (
                  <span className="text-[11px] font-mono text-yellow-400 shrink-0">{r.confidence_score}%</span>
                )}
              </div>

              <div className="px-3.5 py-2 text-[13.5px] text-zinc-200 whitespace-pre-wrap leading-relaxed" data-testid={`inline-answer-${mk}`}>
                {!r && isLoading ? (
                  <div className="space-y-2 py-1">
                    <div className="h-3 shimmer rounded-sm" />
                    <div className="h-3 shimmer rounded-sm w-4/5" />
                    <div className="h-3 shimmer rounded-sm w-3/5" />
                  </div>
                ) : r ? (
                  r.answer
                ) : (
                  <span className="text-zinc-500">No response</span>
                )}
              </div>

              {r && (
                <div className="px-3.5 pb-3 space-y-2 border-t border-white/5 pt-2">
                  <div className="flex flex-wrap gap-1.5">
                    {VOTE_BTNS.map((v) => {
                      const count = (r.votes?.[v.key] || []).length;
                      return (
                        <button
                          key={v.key}
                          data-testid={`inline-vote-${mk}-${v.key}`}
                          onClick={() => vote(r.id, v.key)}
                          className="border border-white/10 hover:border-yellow-500/40 text-[10px] font-mono uppercase tracking-widest text-zinc-400 hover:text-yellow-200 px-2 py-1 rounded-full inline-flex items-center gap-1"
                        >
                          <v.icon className="w-3 h-3" />
                          {v.label}
                          {count > 0 && <span className="text-yellow-400">{count}</span>}
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      data-testid={`inline-select-best-${mk}`}
                      onClick={() => selectBest(r.id)}
                      className="bg-white text-black hover:bg-zinc-200 text-[10px] font-mono uppercase tracking-widest py-1.5 px-2.5 rounded-full"
                    >
                      Mark best & re-synth
                    </button>
                    <button
                      data-testid={`inline-task-${mk}`}
                      onClick={() => setShowTask(r)}
                      className="border border-yellow-500/40 bg-yellow-500/5 hover:bg-yellow-500/15 text-yellow-200 text-[10px] font-mono uppercase tracking-widest py-1.5 px-2.5 rounded-full inline-flex items-center gap-1.5"
                    >
                      <Sparkles className="w-3 h-3" /> Create task
                    </button>
                    <button
                      data-testid={`inline-save-${mk}`}
                      onClick={() => setShowSave(r)}
                      className="border border-white/10 hover:bg-white/5 text-zinc-300 py-1.5 px-2.5 rounded-full inline-flex items-center"
                    >
                      <Save className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })}
      </div>

      {/* Compare the remaining (leftover) models — any not yet run */}
      {leftover.length > 0 && (
        <div className="flex justify-start">
          <button
            data-testid="compare-more-models"
            onClick={compareMore}
            disabled={expanding}
            className="border border-white/15 hover:border-yellow-500/50 hover:bg-yellow-500/5 disabled:opacity-60 text-zinc-200 text-[11px] font-mono uppercase tracking-widest py-2 px-3.5 rounded-full inline-flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            {expanding
              ? "Running…"
              : `Compare ${leftover.length} more model${leftover.length > 1 ? "s" : ""}`}
          </button>
        </div>
      )}

      {/* synthesize CTA when ready but not yet synthesized */}
      {!thread.final_answer && readyCount >= 2 && (
        <div className="flex justify-start">
          <button
            data-testid="inline-synthesize-btn"
            onClick={synthesize}
            disabled={synthesizing}
            className="bg-yellow-500 text-black hover:bg-yellow-400 disabled:opacity-60 text-[11px] font-mono uppercase tracking-widest py-2 px-3.5 rounded-full inline-flex items-center gap-1.5"
          >
            <Wand2 className="w-3.5 h-3.5" />
            {synthesizing ? "Synthesizing…" : "Synthesize best answer"}
          </button>
        </div>
      )}

      {/* synthesized final answer bubble */}
      {thread.final_answer && (
        <div className="flex justify-start">
          <div className="max-w-[94%] w-full bg-yellow-500/[0.06] border border-yellow-500/30 rounded-2xl rounded-bl-sm px-3.5 py-3" data-testid="inline-synthesis">
            <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-yellow-400 mb-1.5">
              <Sparkles className="w-3 h-3" /> Synthesized final answer
            </div>
            <p className="text-[14px] text-zinc-100 whitespace-pre-wrap leading-relaxed">{thread.final_answer}</p>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              <button
                data-testid="inline-copy-synthesis"
                onClick={copyAnswer}
                className="bg-white text-black hover:bg-zinc-200 text-[10px] font-mono uppercase tracking-widest px-3 py-1.5 rounded-full inline-flex items-center gap-1"
              >
                <Copy className="w-3 h-3" /> Copy answer
              </button>
              <button
                data-testid="inline-share-synthesis"
                onClick={share}
                className="border border-blue-400/40 text-blue-300 hover:bg-blue-500/10 text-[10px] font-mono uppercase tracking-widest px-3 py-1.5 rounded-full inline-flex items-center gap-1"
              >
                <Share2 className="w-3 h-3" /> {thread.public_token ? "Copy link" : "Share"}
              </button>
              <button
                data-testid="inline-task-synthesis"
                onClick={() => setShowTask({ id: `synth-${threadId}`, answer: thread.final_answer, model_name: "Synthesis" })}
                className="bg-yellow-500 text-black hover:bg-yellow-400 text-[10px] font-mono uppercase tracking-widest px-3 py-1.5 rounded-full inline-flex items-center gap-1"
              >
                <Sparkles className="w-3 h-3" /> Create task
              </button>
              <button
                data-testid="inline-save-synthesis"
                onClick={() => setShowSave({ id: "synth", answer: thread.final_answer, model_name: "Synthesis" })}
                className="border border-white/10 hover:bg-white/5 text-zinc-300 text-[10px] font-mono uppercase tracking-widest px-3 py-1.5 rounded-full inline-flex items-center gap-1"
              >
                <Save className="w-3 h-3" /> Save
              </button>
            </div>
          </div>
        </div>
      )}

      <SaveToFolderDialog
        open={!!showSave}
        onOpenChange={(v) => !v && setShowSave(null)}
        response={showSave}
        threadId={threadId}
        question={thread.question}
      />
      <NewTaskDialog
        open={!!showTask}
        onOpenChange={(v) => !v && setShowTask(null)}
        sourceChatId={chatId}
        sourceMessage={showTask ? { id: showTask.id || `synth-${threadId}`, body: showTask.answer || "" } : null}
        defaultTitle={showTask?.model_name ? `Follow up on ${showTask.model_name} answer` : ""}
        defaultDescription={showTask?.answer?.slice(0, 400)}
      />
    </div>
  );
}
