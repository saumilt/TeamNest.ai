/* Drawer holding the "extra context" textarea. Prepended to the user's
 * question as a structured block on submit (handled by parent). */
export default function ContextPanel({ open, value, onChange, onClear }) {
        if (!open) return null;
        return (
                <div className="mb-4 rounded-sm border border-amber-400/30 bg-amber-500/5 p-3" data-testid="context-builder-panel">
                        <div className="label-mono mb-2 text-amber-200">EXTRA CONTEXT FOR AI</div>
                        <textarea
                                data-testid="context-builder-textarea"
                                value={value}
                                onChange={(e) => onChange(e.target.value)}
                                placeholder="Paste / type anything you want the AI to consider: pinned messages, doc excerpts, customer quotes, internal terminology…"
                                rows={4}
                                className="w-full bg-black/40 border border-amber-400/20 rounded-sm px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-amber-400/60 resize-none"
                        />
                        <div className="flex items-center justify-between mt-1.5">
                                <span className="text-[10px] text-zinc-500 font-mono">
                                        Prepended to your question as a structured block.
                                </span>
                                {value && (
                                        <button
                                                type="button"
                                                onClick={onClear}
                                                data-testid="context-builder-clear"
                                                className="text-[10px] text-amber-300/80 hover:text-amber-200 font-mono uppercase tracking-widest"
                                        >
                                                Clear
                                        </button>
                                )}
                        </div>
                </div>
        );
}
