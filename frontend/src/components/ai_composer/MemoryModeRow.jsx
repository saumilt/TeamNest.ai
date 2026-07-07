import { Brain, Paperclip } from "lucide-react";
import { MEMORY_MODES } from "./constants";

/* Picks memory scope (none / chat / project / workspace) and toggles the
 * extra-context "+ Notes" panel.  Pure UI; state lives in the parent. */
export default function MemoryModeRow({
        memoryMode,
        onMemoryModeChange,
        extraContext,
        contextOpen,
        onToggleContext,
}) {
        const hasNotes = !!extraContext.trim();
        return (
                <>
                        <div className="label-mono mb-2 flex items-center gap-1.5">
                                <Brain className="w-3.5 h-3.5 text-purple-300" />
                                MEMORY CONTEXT
                                <span className="ml-1 normal-case tracking-normal text-zinc-500">
                                        (what should the AI remember when answering?)
                                </span>
                        </div>
                        <div className="flex flex-wrap gap-2 mb-4" data-testid="memory-mode-selector">
                                {MEMORY_MODES.map((m) => {
                                        const isOn = memoryMode === m.key;
                                        return (
                                                <button
                                                        key={m.key}
                                                        data-testid={`memory-mode-${m.key}`}
                                                        onClick={() => onMemoryModeChange(m.key)}
                                                        title={m.hint}
                                                        className={`px-3 py-1.5 text-xs font-mono uppercase tracking-widest rounded-sm border transition-colors ${
                                                                isOn
                                                                        ? "bg-purple-500/15 text-purple-200 border-purple-400/60"
                                                                        : "border-white/10 text-zinc-400 hover:border-purple-400/40 hover:text-purple-200"
                                                        }`}
                                                >
                                                        {m.label}
                                                </button>
                                        );
                                })}
                                <button
                                        data-testid="context-builder-toggle"
                                        onClick={onToggleContext}
                                        className={`px-3 py-1.5 text-xs font-mono uppercase tracking-widest rounded-sm border transition-colors flex items-center gap-1 ${
                                                hasNotes
                                                        ? "bg-amber-500/15 text-amber-200 border-amber-400/60"
                                                        : "border-white/10 text-zinc-400 hover:border-amber-400/40 hover:text-amber-200"
                                        }`}
                                        title="Hand-pick extra context to feed the AI"
                                >
                                        <Paperclip className="w-3 h-3" />
                                        {hasNotes ? `+ Notes (${extraContext.trim().length} ch)` : "+ Notes"}
                                </button>
                        </div>
                </>
        );
}
