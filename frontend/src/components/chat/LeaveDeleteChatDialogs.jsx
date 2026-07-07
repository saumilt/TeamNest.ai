import { useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { LogOut, Trash2, AlertCircle, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

/** Confirm + execute "Leave chat" on a group chat. */
export function LeaveChatDialog({ open, onOpenChange, chat, onLeft }) {
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!chat) return;
    setBusy(true);
    try {
      await api.post(`/chats/${chat.id}/leave`);
      toast.success(`You left ${chat.name || "the chat"}.`);
      onOpenChange(false);
      onLeft?.();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not leave chat");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-surface border-hairline rounded-card max-w-md" data-testid="leave-chat-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-ink">
            <LogOut className="w-5 h-5 text-tn-red" />
            Leave {chat?.name || "this chat"}?
          </DialogTitle>
          <DialogDescription className="text-ink-dim text-[14px] leading-6 pt-2">
            Other members will see <strong>“{chat?.name || "you"}”</strong> left the chat.
            You won&apos;t receive new messages here unless someone re-adds you.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end mt-4">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={busy}
            className="h-11 rounded-2xl text-ink-dim hover:bg-white/5"
          >
            Cancel
          </Button>
          <Button
            type="button"
            data-testid="leave-chat-confirm"
            onClick={submit}
            disabled={busy}
            className="h-11 rounded-2xl bg-tn-red text-white hover:bg-tn-red/90"
          >
            {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <LogOut className="w-4 h-4 mr-2" />}
            Leave chat
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Confirm + execute "Delete chat for me" — hides chat + clears my history. */
export function DeleteChatDialog({ open, onOpenChange, chat, onDeleted }) {
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!chat) return;
    setBusy(true);
    try {
      await api.post(`/chats/${chat.id}/clear`);
      toast.success(`Deleted ${chat.name || "chat"} from your view.`);
      onOpenChange(false);
      onDeleted?.();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not delete chat");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-surface border-hairline rounded-card max-w-md" data-testid="delete-chat-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-ink">
            <Trash2 className="w-5 h-5 text-tn-red" />
            Delete {chat?.name || "this chat"} for me?
          </DialogTitle>
          <DialogDescription className="text-ink-dim text-[14px] leading-6 pt-2">
            This hides the chat and clears its history from <strong>your view</strong> only.
            Other members will still see every message. If someone sends a new message later,
            the chat re-surfaces in your list.
          </DialogDescription>
        </DialogHeader>
        <div className="text-[12px] text-ink-mute flex items-start gap-1.5 mt-1">
          <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>Nothing is deleted for other members. We never delete the underlying messages.</span>
        </div>
        <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end mt-4">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={busy}
            className="h-11 rounded-2xl text-ink-dim hover:bg-white/5"
          >
            Cancel
          </Button>
          <Button
            type="button"
            data-testid="delete-chat-confirm"
            onClick={submit}
            disabled={busy}
            className="h-11 rounded-2xl bg-tn-red text-white hover:bg-tn-red/90"
          >
            {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />}
            Delete for me
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
