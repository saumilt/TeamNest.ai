import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const ROLES = ["owner", "admin", "member", "viewer"];

/** Modal: invite a new user by email. */
export default function InviteByEmailDialog({
  open, onOpenChange, name, setName, email, setEmail, role, setRole, onConfirm,
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#0a0a0a] border-white/10 rounded-sm" data-testid="invite-dialog">
        <DialogHeader>
          <DialogTitle className="font-display tracking-tight">Invite by email</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <div className="label-mono mb-2">NAME</div>
            <Input
              data-testid="invite-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="bg-[#121214] border-white/10 rounded-sm"
            />
          </div>
          <div>
            <div className="label-mono mb-2">EMAIL</div>
            <Input
              data-testid="invite-email"
              value={email}
              type="email"
              onChange={(e) => setEmail(e.target.value)}
              className="bg-[#121214] border-white/10 rounded-sm"
            />
          </div>
          <div>
            <div className="label-mono mb-2">ROLE</div>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger data-testid="invite-role" className="bg-[#121214] border-white/10 rounded-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[#121214] border-white/10">
                {ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button
            data-testid="invite-confirm"
            onClick={onConfirm}
            className="w-full bg-white text-black hover:bg-zinc-200 rounded-sm font-mono uppercase text-xs tracking-widest h-10"
          >
            Send invite
          </Button>
          <div className="text-[10px] text-zinc-500">
            If they already have a TeamNest account, we&apos;ll add them to your workspace instead of creating a duplicate.{" "}
            For brand-new emails the default password is{" "}
            <span className="font-mono text-yellow-400">Invite@2026</span>.
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
