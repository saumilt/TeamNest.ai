import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Landmark, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";

/* Save the current AI conversation into Role Intelligence. Members "suggest"
 * and owners approve — everything lands in the enterprise review queue. */
export default function SaveToRoleDialog({ open, onOpenChange, chatId }) {
  const [roles, setRoles] = useState(null);
  const [roleId, setRoleId] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    api.get("/ai-conversation/roles")
      .then(({ data }) => { setRoles(data.roles); if (data.roles[0]) setRoleId(data.roles[0].id); })
      .catch(() => toast.error("Failed to load roles"));
  }, [open]);

  const save = async () => {
    if (!roleId) return;
    setBusy(true);
    try {
      const { data } = await api.post(`/chats/${chatId}/save-to-role`, { role_id: roleId });
      if (data.proposed > 0) {
        toast.success(`${data.proposed} item(s) sent to Role Intelligence for review`);
      } else {
        toast.info(data.note || "Nothing worth preserving was found");
      }
      onOpenChange(false);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed to save");
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="save-to-role-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Landmark className="w-4 h-4 text-ai" /> Save to Role Intelligence
          </DialogTitle>
          <DialogDescription>
            Capture durable, transferable knowledge from this conversation. It&apos;s staged for owner review before it&apos;s added to the role.
          </DialogDescription>
        </DialogHeader>
        {roles === null ? (
          <div className="py-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-ai" /></div>
        ) : roles.length === 0 ? (
          <p className="text-sm text-ink-mute py-4">No roles defined yet. Create roles in Enterprise → Role Intelligence first.</p>
        ) : (
          <div className="space-y-3">
            <label className="text-sm text-ink block">Target role
              <select value={roleId} onChange={(e) => setRoleId(e.target.value)} data-testid="save-to-role-select"
                className="mt-1 w-full h-10 rounded-lg bg-bg border border-line px-2 text-sm text-ink">
                {roles.map((r) => <option key={r.id} value={r.id}>{r.role_name}</option>)}
              </select>
            </label>
            <button onClick={save} disabled={busy} data-testid="save-to-role-confirm"
              className="w-full h-10 rounded-xl bg-ai text-black font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50">
              {busy && <Loader2 className="w-4 h-4 animate-spin" />} Send for review
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
