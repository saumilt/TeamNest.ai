import { ChevronRight, UserCheck } from "lucide-react";

/* "Already on TeamNest" section — tap a row to start a chat. */
export default function MatchedContacts({ matches, onStartChat }) {
        if (!matches || matches.length === 0) return null;
        return (
                <>
                        <div className="text-[11px] font-mono uppercase tracking-widest text-emerald-400 px-1 flex items-center gap-1.5">
                                <UserCheck className="w-3.5 h-3.5" />
                                On TeamNest · {matches.length}
                        </div>
                        <ul className="space-y-0.5">
                                {matches.map((m) => (
                                        <li key={m.user_id}>
                                                <button
                                                        onClick={() => onStartChat?.(m)}
                                                        data-testid={`contact-match-${m.user_id}`}
                                                        className="w-full flex items-center gap-3 px-2 py-2 rounded-md hover:bg-white/5 text-left"
                                                >
                                                        <div className="w-9 h-9 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 flex items-center justify-center text-sm font-medium">
                                                                {(m.name || "?")[0]?.toUpperCase()}
                                                        </div>
                                                        <div className="min-w-0 flex-1">
                                                                <div className="text-sm text-zinc-100 truncate">{m.name}</div>
                                                                <div className="text-[11px] text-zinc-500 truncate">
                                                                        {m.local?.name && m.local.name !== m.name
                                                                                ? `saved as ${m.local.name}`
                                                                                : "Workspace member"}
                                                                </div>
                                                        </div>
                                                        <ChevronRight className="w-4 h-4 text-zinc-500" />
                                                </button>
                                        </li>
                                ))}
                        </ul>
                </>
        );
}
