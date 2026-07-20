import { Button } from "@/components/ui/button";
import { Layers, Wand2, Share2, X, Pin, PinOff, Minimize2, ChevronUp, GripHorizontal } from "lucide-react";

/** Minimized state — small pill at bottom of the screen. */
export function ComparisonMinimizedBar({ thread, responses, onRestore, onClose }) {
  return (
    <div
      data-testid="ai-comparison"
      data-minimized="true"
      className="border-t border-yellow-500/30 bg-black px-5 py-2.5 flex items-center justify-between gap-3"
    >
      <button
        data-testid="restore-comparison"
        onClick={onRestore}
        className="flex items-center gap-2 text-zinc-200 hover:text-yellow-300 text-left min-w-0"
      >
        <Layers className="w-4 h-4 text-yellow-400 shrink-0" />
        <span className="label-mono text-yellow-400">
          AI COMPARISON · {responses.length}/{thread.selected_models.length}
        </span>
        <span className="text-sm truncate text-zinc-300">{thread.question}</span>
        <ChevronUp className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
      </button>
      <button
        data-testid="close-comparison"
        onClick={onClose}
        title="Close"
        className="text-zinc-500 hover:text-white p-1"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

/** Top header — title + share/synthesize/pin/minimize/close. */
export function ComparisonHeader({
  thread,
  responses,
  isLoading,
  synthesizing,
  pinned,
  onShare,
  onSynthesize,
  onTogglePin,
  onMinimize,
  onClose,
}) {
  return (
    <div className="px-4 sm:px-5 py-2.5 border-b border-white/10 flex flex-col sm:flex-row sm:items-center gap-2 sm:justify-between mt-1">
      <div className="flex items-center gap-2.5 min-w-0">
        <Layers className="w-4 h-4 text-yellow-400 shrink-0" />
        <div className="min-w-0">
          <div className="label-mono text-[10px]">
            AI COMPARISON · {responses.length}/{thread.selected_models.length} READY
          </div>
          <div className="text-[13px] sm:text-sm truncate text-zinc-200">{thread.question}</div>
        </div>
      </div>
      <div className="flex gap-2 shrink-0 items-center">
        <Button
          data-testid="share-snapshot-btn"
          size="sm"
          variant="outline"
          onClick={onShare}
          disabled={isLoading || responses.length < 1}
          className="flex-1 sm:flex-none border-blue-400/40 bg-transparent text-blue-300 hover:bg-blue-500/10 rounded-sm font-mono uppercase text-[10px] tracking-widest"
          title="Create a public shareable link to this comparison"
        >
          <Share2 className="w-3 h-3 mr-1" />
          {thread.public_token ? "Copy link" : "Share"}
        </Button>
        <Button
          data-testid="synthesize-btn"
          size="sm"
          onClick={onSynthesize}
          disabled={synthesizing || isLoading || responses.length < 2}
          className="flex-1 sm:flex-none bg-yellow-500 text-black hover:bg-yellow-400 rounded-sm font-mono uppercase text-[10px] tracking-widest"
        >
          <Wand2 className="w-3 h-3 mr-1" />
          {synthesizing ? "Synthesizing…" : "Synthesize Best"}
        </Button>
        <button
          data-testid="pin-comparison"
          onClick={onTogglePin}
          title={pinned ? "Unpin — auto-collapse on outside click" : "Pin — keep open"}
          className={`hidden sm:flex h-8 w-8 items-center justify-center rounded-sm border ${
            pinned
              ? "border-yellow-500/40 bg-yellow-500/10 text-yellow-300"
              : "border-white/10 bg-transparent text-zinc-400 hover:bg-white/5"
          }`}
        >
          {pinned ? <Pin className="w-3.5 h-3.5" /> : <PinOff className="w-3.5 h-3.5" />}
        </button>
        <button
          data-testid="minimize-comparison"
          onClick={onMinimize}
          title="Minimize"
          className="h-8 w-8 flex items-center justify-center rounded-sm border border-white/10 bg-transparent text-zinc-400 hover:bg-white/5 shrink-0"
        >
          <Minimize2 className="w-3.5 h-3.5" />
        </button>
        <Button
          data-testid="close-comparison"
          size="sm"
          variant="outline"
          onClick={onClose}
          className="border-white/10 bg-transparent hover:bg-white/5 rounded-sm h-8 w-8 p-0 shrink-0"
        >
          <X className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
}

/** Drag handle at top edge for vertical resize. */
export function ComparisonResizeHandle({ onMouseDown }) {
  return (
    <div
      data-testid="comparison-resize-handle"
      onMouseDown={onMouseDown}
      title="Drag to resize"
      className="absolute top-0 left-0 right-0 h-1.5 cursor-ns-resize hover:bg-yellow-500/30 flex items-center justify-center group z-10"
    >
      <GripHorizontal className="w-4 h-4 text-zinc-700 group-hover:text-yellow-400 opacity-60" />
    </div>
  );
}
