import { useEffect, useRef, useState } from "react";
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
import { useResearchThread } from "@/hooks/useResearchThread";

/**
 * Desktop side-by-side comparison panel (docked at the bottom of the chat,
 * resizable). On mobile the inline-messages view (AIComparisonInline) is used
 * instead — see Chats.jsx.
 */
export default function AIComparison({ threadId, chatId, onClose, fullScreen = false }) {
  const { data, synthesizing, vote, selectBest, synthesize, share } = useResearchThread(threadId, {
    onAfterSelectBest: onClose,
  });
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

  useEffect(() => {
    try { localStorage.setItem("aicompare:pinned", pinned ? "1" : "0"); } catch (err) { console.warn("[aicompare] persist pinned failed", err); }
  }, [pinned]);
  useEffect(() => {
    try { localStorage.setItem("aicompare:heightVh", String(heightVh)); } catch (err) { console.warn("[aicompare] persist height failed", err); }
  }, [heightVh]);

  // Auto-collapse on outside click when not pinned (disabled in full-screen).
  useEffect(() => {
    if (pinned || minimized || fullScreen) return undefined;
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

  const onResizeStart = () => {
    resizingRef.current = true;
    document.body.style.cursor = "ns-resize";
  };

  return (
    <div
      data-testid="ai-comparison"
      className={`bg-black overflow-hidden flex flex-col relative ${
        fullScreen ? "flex-1 h-full pt-[env(safe-area-inset-top)]" : "border-t border-yellow-500/20"
      }`}
      style={fullScreen ? undefined : { height: `${heightVh}vh`, maxHeight: "90vh" }}
    >
      {!fullScreen && <ComparisonResizeHandle onMouseDown={onResizeStart} />}

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

      <div className="flex-1 min-h-0 flex flex-col">
        <div
          className="flex-1 min-h-0 overflow-x-auto overflow-y-hidden"
          data-testid="ai-comparison-scroll"
        >
          <div className="flex flex-row gap-px bg-white/10 min-w-max p-px h-full">
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
        </div>
        <div className="shrink-0 max-h-[45%] overflow-y-auto">
          <SynthesisFooter
            thread={thread}
            threadId={threadId}
            onShare={share}
            onTask={(payload) => setShowTask(payload)}
            onSave={(payload) => setShowSave(payload)}
          />
        </div>
      </div>

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
