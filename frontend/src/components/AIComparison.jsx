import { useEffect, useRef, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import NewTaskDialog from "@/components/NewTaskDialog";
import ModelCard from "@/components/aicompare/ModelCard";
import SaveToFolderDialog from "@/components/aicompare/SaveToFolderDialog";
import {
  ComparisonMinimizedBar,
  ComparisonHeader,
  ComparisonResizeHandle,
} from "@/components/aicompare/ComparisonHeader";
import SynthesisFooter from "@/components/aicompare/SynthesisFooter";
import ThreadActions from "@/components/ai/ThreadActions";

export default function AIComparison({ threadId, chatId, onClose }) {
  const [data, setData] = useState(null);
  const [synthesizing, setSynthesizing] = useState(false);
  const [showSave, setShowSave] = useState(null);
  const [showTask, setShowTask] = useState(null);

  const [pinned, setPinned] = useState(() => {
    try { return localStorage.getItem("aicompare:pinned") === "1"; } catch { return false; }
  });
  const [minimized, setMinimized] = useState(false);
  const [heightVh, setHeightVh] = useState(() => {
    try { return Number(localStorage.getItem("aicompare:heightVh")) || 60; } catch { return 60; }
  });
  const resizingRef = useRef(false);

  // Persist preferences (UI prefs, not sensitive)
  useEffect(() => {
    try { localStorage.setItem("aicompare:pinned", pinned ? "1" : "0"); } catch (err) { console.warn("[aicompare] persist pinned failed", err); }
  }, [pinned]);
  useEffect(() => {
    try { localStorage.setItem("aicompare:heightVh", String(heightVh)); } catch (err) { console.warn("[aicompare] persist height failed", err); }
  }, [heightVh]);

  // Auto-collapse on outside click when not pinned
  useEffect(() => {
    if (pinned || minimized) return;
    const onDocClick = (e) => {
      const panel = document.querySelector("[data-testid='ai-comparison']");
      if (panel && !panel.contains(e.target)) setMinimized(true);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [pinned, minimized]);

  // Resize drag
  useEffect(() => {
    const onMove = (e) => {
      if (!resizingRef.current) return;
      const vh = ((window.innerHeight - e.clientY) / window.innerHeight) * 100;
      setHeightVh(Math.min(90, Math.max(25, vh)));
    };
    const onUp = () => { resizingRef.current = false; document.body.style.cursor = ""; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  const load = useCallback(() => {
    api.get(`/ai/research/${threadId}`).then(({ data }) => setData(data));
  }, [threadId]);

  useEffect(() => {
    load();
    const id = setInterval(load, 4000);
    return () => clearInterval(id);
  }, [load]);

  if (!data) {
    return (
      <div className="border-t border-yellow-500/20 bg-black px-6 py-4">
        <div className="label-mono">LOADING COMPARISON…</div>
      </div>
    );
  }

  const { thread, responses } = data;
  const isLoading = thread.status === "running";

  if (minimized) {
    return (
      <ComparisonMinimizedBar
        thread={thread}
        responses={responses}
        onRestore={() => setMinimized(false)}
        onClose={onClose}
      />
    );
  }

  const vote = async (rid, cat) => {
    await api.post(`/ai/responses/${rid}/vote`, { vote_category: cat });
    load();
  };

  const selectBest = async (rid) => {
    await api.post(`/ai/responses/${rid}/select-best`);
    toast.success("Re-synthesized with new best · posted in chat");
    load();
    onClose?.();
  };

  const synthesize = async () => {
    setSynthesizing(true);
    try {
      await api.post(`/ai/research/${threadId}/synthesize`);
      toast.success("Synthesized final answer");
      load();
    } catch {
      toast.error("Synthesis failed");
    } finally {
      setSynthesizing(false);
    }
  };

  const share = async () => {
    try {
      const { data: payload } = await api.post(`/ai/research/${threadId}/share`);
      const url = `${window.location.origin}/s/${payload.token}`;
      try {
        await navigator.clipboard.writeText(url);
        toast.success("Public link copied to clipboard");
      } catch {
        toast.success(`Public link: ${url}`);
      }
      load();
    } catch {
      toast.error("Share failed");
    }
  };

  const onResizeStart = () => {
    resizingRef.current = true;
    document.body.style.cursor = "ns-resize";
  };

  return (
    <div
      data-testid="ai-comparison"
      className="border-t border-yellow-500/20 bg-black overflow-hidden flex flex-col relative"
      style={{ height: `${heightVh}vh`, maxHeight: "90vh" }}
    >
      <ComparisonResizeHandle onMouseDown={onResizeStart} />

      <ComparisonHeader
        thread={thread}
        responses={responses}
        isLoading={isLoading}
        synthesizing={synthesizing}
        pinned={pinned}
        onShare={share}
        onSynthesize={synthesize}
        onTogglePin={() => setPinned((p) => !p)}
        onMinimize={() => setMinimized(true)}
        onClose={onClose}
      />

      <ScrollArea className="flex-1">
        <div className="flex gap-px bg-white/10 min-w-max p-px h-full">
          {thread.selected_models.map((mk) => {
            const r = responses.find((x) => x.model_key === mk);
            return (
              <ModelCard
                key={mk}
                modelKey={mk}
                response={r}
                isLoading={!r && isLoading}
                onVote={(cat) => vote(r.id, cat)}
                onSelectBest={() => selectBest(r.id)}
                onSave={() => setShowSave(r)}
                onTask={() => setShowTask(r)}
              />
            );
          })}
        </div>
        <SynthesisFooter
          thread={thread}
          threadId={threadId}
          onTask={(payload) => setShowTask(payload)}
          onSave={(payload) => setShowSave(payload)}
        />
      </ScrollArea>

      <ThreadActions threadId={threadId} parentQuestion={thread.question} />

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
        sourceMessage={
          showTask
            ? {
                id: showTask.id || `synth-${threadId}`,
                body: showTask.answer || "",
              }
            : null
        }
        defaultTitle={showTask?.model_name ? `Follow up on ${showTask.model_name} answer` : ""}
        defaultDescription={showTask?.answer?.slice(0, 400)}
      />
    </div>
  );
}
