/* Web fallback when Capacitor Contacts isn't available — user pastes
 * lines like "Name, +14155551234" and we parse + normalize. */
export default function ContactsPastePane({ value, onChange, onCancel, onSubmit }) {
        return (
                <div className="p-5 space-y-3">
                        <h3 className="text-sm font-semibold text-zinc-100">Paste numbers, one per line</h3>
                        <p className="text-xs text-zinc-500">
                                Format: <code>Name, +14155551234</code> or just <code>+14155551234</code>
                        </p>
                        <textarea
                                value={value}
                                onChange={(e) => onChange(e.target.value)}
                                rows={6}
                                placeholder={"Sarah, +14155551234\nAlex, +14155557777"}
                                className="w-full bg-[#121214] border border-white/10 rounded-md p-3 text-sm font-mono"
                                data-testid="paste-contacts-textarea"
                        />
                        <div className="flex gap-2">
                                <button
                                        onClick={onCancel}
                                        className="flex-1 h-10 rounded-md border border-white/10 hover:bg-white/5 text-xs font-mono uppercase tracking-widest"
                                >
                                        Cancel
                                </button>
                                <button
                                        onClick={onSubmit}
                                        data-testid="paste-import-submit"
                                        className="flex-1 h-10 rounded-md bg-violet-500 hover:bg-violet-400 text-white text-xs font-mono uppercase tracking-widest"
                                >
                                        Match
                                </button>
                        </div>
                </div>
        );
}
