import { Button } from "@/components/ui/button";
import { Copy, CheckCircle2, AlertCircle } from "lucide-react";

/** Shown right after a brand-new guest account is created — copy creds + done. */
export default function GuestCredentialsCard({ guest, onCopy, onDone }) {
  return (
    <div
      className="space-y-4 p-4 border border-emerald-500/30 bg-emerald-500/5 rounded-sm"
      data-testid="invite-guest-credentials"
    >
      <div className="flex items-start gap-2">
        <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
        <div className="text-sm">
          Guest account created for <span className="font-mono text-zinc-100">{guest.email}</span>.
          Send them these one-time credentials so they can sign in.
        </div>
      </div>
      <div className="bg-[#121214] border border-white/10 rounded-sm p-3 font-mono text-xs">
        <div>email: <span className="text-yellow-300">{guest.email}</span></div>
        <div className="mt-1">password: <span className="text-yellow-300">{guest.one_time_password}</span></div>
      </div>
      <div className="flex gap-2">
        <Button
          data-testid="invite-guest-copy"
          onClick={onCopy}
          variant="outline"
          className="flex-1 border-white/10 bg-transparent hover:bg-white/5 rounded-sm font-mono uppercase tracking-widest text-[10px] h-9"
        >
          <Copy className="w-3 h-3 mr-1.5" /> Copy login details
        </Button>
        <Button
          data-testid="invite-guest-done"
          onClick={onDone}
          className="flex-1 bg-emerald-500 text-black hover:bg-emerald-400 rounded-sm font-mono uppercase tracking-widest text-[10px] h-9"
        >
          Done
        </Button>
      </div>
      <div className="flex items-start gap-2 text-[10px] text-zinc-500">
        <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />
        <span>
          We only show this password once. The guest can change it from their Profile page after signing in.
        </span>
      </div>
    </div>
  );
}
