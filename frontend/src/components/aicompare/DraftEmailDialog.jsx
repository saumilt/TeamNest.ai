import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Copy, Mail } from "lucide-react";
import { toast } from "sonner";

/** "Draft Email" action — turns an AI answer into an editable email draft.
 *  Draft-only: it does NOT send (sending needs the email connector + approval).
 *  Backend: POST /api/ai/draft-email. */
export default function DraftEmailDialog({ content, onClose }) {
  const [draft, setDraft] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    api.post("/ai/draft-email", { content })
      .then(({ data }) => { if (!cancelled) setDraft(data); })
      .catch((e) => { if (!cancelled) setError(e?.response?.data?.detail || "Could not draft email"); });
    return () => { cancelled = true; };
  }, [content]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`Subject: ${draft.subject}\n\n${draft.body}`);
      toast.success("Draft copied");
    } catch {
      toast.error("Couldn't copy — select the text manually");
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-[#0a0a0a] border-white/10 text-white max-w-lg" data-testid="draft-email-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="w-4 h-4 text-yellow-400" /> Draft email
          </DialogTitle>
        </DialogHeader>
        <div className="py-2 space-y-3">
          <div className="text-[11px] font-mono uppercase tracking-widest text-zinc-500">
            Draft only — review &amp; edit before sending
          </div>
          {error && <div className="text-red-400 text-sm">{error}</div>}
          {!draft && !error && <div className="text-zinc-500 text-sm">Drafting…</div>}
          {draft && (
            <>
              <div>
                <div className="label-mono mb-1.5">SUBJECT</div>
                <div data-testid="draft-subject" className="text-sm text-zinc-100 bg-[#121214] border border-white/10 rounded-sm px-3 py-2">
                  {draft.subject}
                </div>
              </div>
              <div>
                <div className="label-mono mb-1.5">BODY</div>
                <div data-testid="draft-body" className="text-sm text-zinc-200 whitespace-pre-wrap bg-[#121214] border border-white/10 rounded-sm px-3 py-2 max-h-64 overflow-y-auto">
                  {draft.body}
                </div>
              </div>
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="border-white/10 bg-transparent hover:bg-white/5 rounded-sm">
            Close
          </Button>
          <Button data-testid="draft-copy" onClick={copy} disabled={!draft} className="bg-yellow-500 text-black hover:bg-yellow-400 rounded-sm">
            <Copy className="w-3.5 h-3.5 mr-1.5" /> Copy draft
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
