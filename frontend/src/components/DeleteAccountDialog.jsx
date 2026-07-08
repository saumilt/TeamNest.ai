import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { AlertTriangle, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

/**
 * Destructive, App Store 5.1.1(v)-compliant account deletion.
 * Requires the current password + a typed "DELETE" confirmation.
 */
export default function DeleteAccountDialog({ open, onOpenChange }) {
  const { logout } = useAuth();
  const nav = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  const canDelete = password.length > 0 && confirm.trim().toUpperCase() === "DELETE";

  const handleDelete = async () => {
    if (!canDelete || busy) return;
    setBusy(true);
    try {
      await api.delete("/auth/me", { data: { password, confirm: "DELETE" } });
      toast.success("Your account has been deleted");
      try { await logout(); } catch { /* ignore */ }
      nav("/");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not delete account");
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => (!busy ? onOpenChange(v) : null)}>
      <DialogContent className="bg-surface-2 border-white/10 text-ink" data-testid="delete-account-dialog">
        <DialogHeader>
          <div className="w-11 h-11 rounded-xl bg-tn-red/10 flex items-center justify-center mb-2">
            <AlertTriangle className="w-5 h-5 text-tn-red" />
          </div>
          <DialogTitle>Delete your account?</DialogTitle>
          <DialogDescription className="text-ink-dim">
            This permanently deletes your account and personal data. Workspaces you
            solely own are deleted; shared ones are transferred to another admin.
            This cannot be undone.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 mt-1">
          <div>
            <label className="text-xs font-semibold text-ink-dim">Current password</label>
            <input
              type="password"
              data-testid="delete-account-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="mt-1 w-full bg-bg border border-white/10 rounded-lg px-3 py-2 text-ink focus:border-tn-red focus:outline-none"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-ink-dim">Type DELETE to confirm</label>
            <input
              type="text"
              data-testid="delete-account-confirm"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="DELETE"
              className="mt-1 w-full bg-bg border border-white/10 rounded-lg px-3 py-2 text-ink focus:border-tn-red focus:outline-none tracking-widest"
            />
          </div>
        </div>

        <div className="flex gap-2 mt-4">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={busy}
            className="flex-1 h-11 rounded-xl border border-hairline text-ink-dim hover:bg-white/5 text-sm font-semibold disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            data-testid="delete-account-confirm-btn"
            onClick={handleDelete}
            disabled={!canDelete || busy}
            className="flex-1 h-11 rounded-xl bg-tn-red text-white text-sm font-bold hover:opacity-90 disabled:opacity-40 inline-flex items-center justify-center gap-2"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Delete account
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
