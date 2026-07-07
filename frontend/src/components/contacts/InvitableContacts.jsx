import { Check, Search, Users } from "lucide-react";
import { Input } from "@/components/ui/input";

/* "Not on TeamNest yet" — checkable list filtered by search query. */
export default function InvitableContacts({
        contacts,
        selected,
        query,
        onQueryChange,
        onToggle,
        onSelectAll,
}) {
        const eligible = contacts.filter((c) => !c.on_platform);
        if (eligible.length === 0) return null;

        const filtered = eligible.filter((c) => {
                if (!query.trim()) return true;
                const q = query.toLowerCase();
                return c.name.toLowerCase().includes(q) || c.normalized.includes(q);
        });

        return (
                <>
                        <div className="flex items-center justify-between px-1 pt-3">
                                <div className="text-[11px] font-mono uppercase tracking-widest text-amber-300 flex items-center gap-1.5">
                                        <Users className="w-3.5 h-3.5" />
                                        Invite · {eligible.length} not on TeamNest yet
                                </div>
                                <button
                                        onClick={onSelectAll}
                                        data-testid="contact-select-all"
                                        className="text-[10px] font-mono uppercase tracking-widest text-violet-400 hover:text-violet-300"
                                >
                                        Select all
                                </button>
                        </div>
                        <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                                <Input
                                        value={query}
                                        onChange={(e) => onQueryChange(e.target.value)}
                                        placeholder="Search by name…"
                                        className="bg-[#121214] border-white/10 rounded-md pl-9 h-9 text-sm"
                                />
                        </div>
                        <ul className="max-h-72 overflow-y-auto space-y-0.5">
                                {filtered.map((c) => {
                                        const checked = selected.has(c.normalized);
                                        return (
                                                <li key={c.normalized + c.name}>
                                                        <button
                                                                onClick={() => onToggle(c.normalized)}
                                                                data-testid={`invite-row-${c.normalized}`}
                                                                className={
                                                                        "w-full flex items-center gap-3 px-2 py-2 rounded-md text-left hover:bg-white/5 " +
                                                                        (checked ? "bg-violet-500/10" : "")
                                                                }
                                                        >
                                                                <div
                                                                        className={
                                                                                "w-5 h-5 rounded-sm border flex items-center justify-center flex-shrink-0 " +
                                                                                (checked
                                                                                        ? "bg-violet-500 border-violet-500"
                                                                                        : "border-white/20 bg-transparent")
                                                                        }
                                                                >
                                                                        {checked && <Check className="w-3.5 h-3.5 text-white" />}
                                                                </div>
                                                                <div className="min-w-0 flex-1">
                                                                        <div className="text-sm text-zinc-100 truncate">{c.name}</div>
                                                                        <div className="text-[11px] text-zinc-500 truncate font-mono">{c.normalized}</div>
                                                                </div>
                                                        </button>
                                                </li>
                                        );
                                })}
                        </ul>
                </>
        );
}
