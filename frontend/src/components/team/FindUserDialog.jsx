import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Search, Mail, Phone, CheckCircle2, Plus } from "lucide-react";

/** Modal: find an existing TeamNest user by email/phone + add to workspace. */
export default function FindUserDialog({
  open, onOpenChange, workspaceName, query, setQuery,
  results, searchBusy, searchHint, addingId, onAdd,
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#0a0a0a] border-white/10 rounded-sm max-w-lg" data-testid="search-dialog">
        <DialogHeader>
          <DialogTitle className="font-display tracking-tight">Find &amp; add existing user</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <div className="label-mono mb-2">EMAIL OR PHONE NUMBER</div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none" />
              <Input
                data-testid="user-search-input"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="bg-[#121214] border-white/10 rounded-sm pl-9"
                placeholder="frank@acme.com  •  +1 555 0100  •  555 0100"
                autoFocus
              />
            </div>
          </div>

          <div className="text-xs text-zinc-500 leading-relaxed">
            Find a person who already has a TeamNest account by their exact email or phone number, then add them to <span className="text-zinc-300">{workspaceName}</span> instantly.
          </div>

          <div className="max-h-80 overflow-y-auto -mx-2" data-testid="user-search-results">
            {searchBusy && (
              <div className="px-2 py-3 text-xs font-mono uppercase tracking-widest text-zinc-500">
                Searching…
              </div>
            )}
            {!searchBusy && searchHint && (
              <div className="px-2 py-3 text-xs text-zinc-500" data-testid="user-search-hint">
                {searchHint}
              </div>
            )}
            {!searchBusy && results.map((r) => (
              <div
                key={r.id}
                data-testid={`user-search-result-${r.id}`}
                className="flex items-center gap-3 px-2 py-3 border-b border-white/5 last:border-0"
              >
                {r.avatar ? (
                  <img src={r.avatar} className="w-9 h-9 object-cover rounded-sm" alt="" />
                ) : (
                  <div className="w-9 h-9 bg-zinc-800 rounded-sm flex items-center justify-center text-xs font-bold shrink-0">
                    {r.name?.charAt(0) || "?"}
                  </div>
                )}
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
                  {r.workspace_name && (
                    <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-600 mt-0.5">
                      {r.workspace_name}
                    </div>
                  )}
                </div>
                {r.already_in_workspace ? (
                  <div
                    data-testid={`already-member-${r.id}`}
                    className="inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-emerald-400"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" /> in workspace
                  </div>
                ) : (
                  <Button
                    data-testid={`add-existing-${r.id}`}
                    onClick={() => onAdd(r)}
                    disabled={addingId === r.id}
                    size="sm"
                    className="bg-yellow-500 hover:bg-yellow-400 text-black rounded-sm font-mono uppercase tracking-widest text-[10px] h-8 px-3"
                  >
                    {addingId === r.id ? "Adding…" : (<><Plus className="w-3 h-3 mr-1" /> Add</>)}
                  </Button>
                )}
              </div>
            ))}
          </div>

          <div className="text-[10px] text-zinc-600 leading-relaxed border-t border-white/5 pt-3">
            Privacy: results show first name + masked email/phone so you can confirm the right person. The person you add gets a notification in their personal AI chat.
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
