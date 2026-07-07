import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { LogOut, ShieldAlert, Loader2, Crown, ArrowRight, Search } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import Avatar from "@/components/ui-v2/Avatar";

/** Modal flow: confirm leaving the current workspace.
 *
 *  - Member / admin: 1-step confirmation.
 *  - Owner: forced into "transfer ownership" sub-step which lists active
 *    members → pick one → backend transfers + auto-continues to leave.
 *  - Solo owner (no other active members): single-step "close workspace"
 *    confirmation, no transfer needed.
 */
export default function LeaveWorkspaceDialog({ open, onOpenChange, workspaceName }) {
  const { user, workspaces, logout, switchWorkspace } = useAuth();
  const nav = useNavigate();
  const [step, setStep] = useState("confirm"); // "confirm" | "transfer"
  const [members, setMembers] = useState([]);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [busy, setBusy] = useState(false);

  const isOwner = user?.role === "owner";

  useEffect(() => {
    if (!open) return;
    setStep("confirm");
    setSelectedId(null);
    setQuery("");
    if (!isOwner) return;
    api.get("/workspace/members").then(({ data }) => setMembers(data || [])).catch(() => {});
  }, [open, isOwner]);

  const activeOthers = members.filter(
    (m) => m.id !== user?.id && m.status === "active",
  );
  const soloOwner = isOwner && activeOthers.length === 0;
  const filtered = activeOthers.filter((m) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (m.name || "").toLowerCase().includes(q) || (m.email || "").toLowerCase().includes(q);
  });

  const doLeave = async () => {
    setBusy(true);
    try {
      const { data } = await api.post("/workspace/leave");
      if (data?.workspace_closed) {
        toast.success(`Workspace "${workspaceName}" closed.`);
      } else {
        toast.success(`You left "${workspaceName}".`);
      }
      onOpenChange(false);
      if ((data?.remaining_workspace_count || 0) > 0) {
        const next = (workspaces || []).find((w) => w.workspace_id !== user?.workspace_id);
        if (next) {
          await switchWorkspace(next.workspace_id);
          window.location.assign("/chats");
          return;
        }
      }
      logout();
      nav("/");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not leave workspace");
    } finally {
      setBusy(false);
    }
  };

  const transferAndLeave = async () => {
    if (!selectedId) {
      toast.error("Pick a new owner first");
      return;
    }
    setBusy(true);
    try {
      await api.post("/workspace/transfer-ownership", { new_owner_id: selectedId });
      toast.success("Ownership transferred. Leaving workspace…");
      await doLeave();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not transfer ownership");
      setBusy(false);
    }
  };

  if (step === "transfer") {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="bg-surface border-hairline rounded-card max-w-md" data-testid="transfer-ownership-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-ink">
              <Crown className="w-5 h-5 text-brand" />
              Transfer ownership
            </DialogTitle>
            <DialogDescription className="text-ink-dim text-[14px] leading-6 pt-2">
              Pick the member who becomes the new owner of <strong>{workspaceName}</strong>. You&apos;ll then be able to leave.
            </DialogDescription>
          </DialogHeader>

          <div className="relative mb-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-mute pointer-events-none" />
            <Input
              data-testid="transfer-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search members…"
              className="bg-surface-2 border-hairline rounded-2xl pl-9 h-11 text-[14px]"
            />
          </div>

          <div className="max-h-72 overflow-y-auto -mx-2 divide-y divide-hairline border-y border-hairline" data-testid="transfer-list">
            {filtered.length === 0 ? (
              <div className="px-3 py-6 text-center text-[13px] text-ink-mute">
                No matching active members.
              </div>
            ) : (
              filtered.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  data-testid={`transfer-option-${m.id}`}
                  onClick={() => setSelectedId(m.id)}
                  className={`w-full flex items-center gap-3 px-3 py-3 hover:bg-white/5 text-left ${
                    selectedId === m.id ? "bg-brand/10" : ""
                  }`}
                >
                  <Avatar name={m.name} src={m.avatar} size={36} />
                  <div className="flex-1 min-w-0">
                    <div className="text-[14px] font-medium truncate text-ink">{m.name}</div>
                    <div className="text-[11px] text-ink-mute truncate">{m.email}</div>
                  </div>
                  {selectedId === m.id && <Crown className="w-4 h-4 text-brand" />}
                </button>
              ))
            )}
          </div>

          <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end mt-4">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setStep("confirm")}
              disabled={busy}
              className="h-11 rounded-2xl text-ink-dim hover:bg-white/5"
            >
              Back
            </Button>
            <Button
              type="button"
              data-testid="transfer-confirm"
              onClick={transferAndLeave}
              disabled={busy || !selectedId}
              className="h-11 rounded-2xl bg-brand text-black hover:bg-brand-deep"
            >
              {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ArrowRight className="w-4 h-4 mr-2" />}
              Transfer & leave
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // Step "confirm"
  let body;
  if (isOwner && !soloOwner) {
    body = (
      <>
        <p className="text-ink-dim text-[14px] leading-6">
          You&apos;re the owner of <strong className="text-ink">{workspaceName}</strong>. Transfer ownership to another active member first — then you&apos;ll be able to leave.
        </p>
        <div className="rounded-2xl bg-brand-tint/40 border border-brand/30 p-3 mt-3 flex items-start gap-2.5">
          <ShieldAlert className="w-4 h-4 text-brand shrink-0 mt-0.5" />
          <span className="text-[12px] text-ink leading-5">
            The new owner gains every admin permission you had. You become an admin and can still re-promote yourself later if they invite you back.
          </span>
        </div>
      </>
    );
  } else if (soloOwner) {
    body = (
      <p className="text-ink-dim text-[14px] leading-6">
        You&apos;re the only active member of <strong className="text-ink">{workspaceName}</strong>. Leaving will <strong className="text-tn-red">permanently close this workspace</strong> and remove all chats, tasks, and folders inside it.
      </p>
    );
  } else {
    body = (
      <p className="text-ink-dim text-[14px] leading-6">
        You&apos;ll be removed from <strong className="text-ink">{workspaceName}</strong> and every chat inside it. You can re-join only if a member re-invites you.
      </p>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-surface border-hairline rounded-card max-w-md" data-testid="leave-workspace-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-ink">
            <LogOut className="w-5 h-5 text-tn-red" />
            {soloOwner ? `Close “${workspaceName}”?` : `Leave “${workspaceName}”?`}
          </DialogTitle>
        </DialogHeader>
        <div className="mt-1">{body}</div>
        <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end mt-5">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={busy}
            className="h-11 rounded-2xl text-ink-dim hover:bg-white/5"
          >
            Cancel
          </Button>
          {isOwner && !soloOwner ? (
            <Button
              type="button"
              data-testid="leave-workspace-transfer-btn"
              onClick={() => setStep("transfer")}
              className="h-11 rounded-2xl bg-brand text-black hover:bg-brand-deep"
            >
              <Crown className="w-4 h-4 mr-2" />
              Transfer ownership
            </Button>
          ) : (
            <Button
              type="button"
              data-testid="leave-workspace-confirm"
              onClick={doLeave}
              disabled={busy}
              className="h-11 rounded-2xl bg-tn-red text-white hover:bg-tn-red/90"
            >
              {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <LogOut className="w-4 h-4 mr-2" />}
              {soloOwner ? "Close workspace" : "Leave workspace"}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
