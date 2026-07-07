import { Search, Mail, Phone, UserPlus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

/** Search existing TeamNest users by email/phone + add-as-guest action. */
export default function SearchExistingUsers({
  query,
  setQuery,
  results,
  searchBusy,
  searchHint,
  addingId,
  onAdd,
}) {
  return (
    <div>
      <div className="label-mono mb-2">FIND BY EMAIL OR PHONE</div>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none" />
        <Input
          data-testid="invite-guest-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="bg-[#121214] border-white/10 rounded-sm pl-9"
          placeholder="client@external.co  •  +1 555 0100"
        />
      </div>

      <div className="max-h-56 overflow-y-auto -mx-2 mt-2" data-testid="invite-guest-results">
        {searchBusy && (
          <div className="px-2 py-3 text-xs font-mono uppercase tracking-widest text-zinc-500">Searching…</div>
        )}
        {!searchBusy && searchHint && (
          <div className="px-2 py-2 text-xs text-zinc-500">{searchHint}</div>
        )}
        {!searchBusy && results.map((r) => (
          <div
            key={r.id}
            data-testid={`invite-guest-result-${r.id}`}
            className="flex items-center gap-3 px-2 py-2.5 border-b border-white/5 last:border-0"
          >
            <div className="w-9 h-9 bg-zinc-800 rounded-sm flex items-center justify-center text-xs font-bold shrink-0">
              {r.name?.charAt(0) || "?"}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm text-zinc-100 truncate">{r.name}</div>
              <div className="flex items-center gap-3 mt-0.5 text-[11px] text-zinc-500">
                {r.masked_email && (
                  <span className="inline-flex items-center gap-1 truncate">
                    <Mail className="w-3 h-3 shrink-0" />
                    {r.masked_email}
                  </span>
                )}
                {r.masked_phone && (
                  <span className="inline-flex items-center gap-1 truncate">
                    <Phone className="w-3 h-3 shrink-0" />
                    {r.masked_phone}
                  </span>
                )}
              </div>
            </div>
            <Button
              data-testid={`invite-guest-add-${r.id}`}
              onClick={() => onAdd(r)}
              disabled={addingId === r.id}
              size="sm"
              className="bg-emerald-500 hover:bg-emerald-400 text-black rounded-sm font-mono uppercase tracking-widest text-[10px] h-8 px-3"
            >
              {addingId === r.id ? "Adding…" : (<><UserPlus className="w-3 h-3 mr-1" /> Guest</>)}
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
