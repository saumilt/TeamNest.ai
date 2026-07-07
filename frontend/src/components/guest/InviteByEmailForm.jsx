import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

/** Bottom form — invite a brand-new email (creates guest account). */
export default function InviteByEmailForm({ form, setForm, busy, onSubmit }) {
  return (
    <div className="pt-3 border-t border-white/5">
      <div className="label-mono mb-2">OR INVITE A NEW EMAIL</div>
      <form onSubmit={onSubmit} className="space-y-2.5">
        <Input
          data-testid="invite-guest-new-email"
          type="email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          className="bg-[#121214] border-white/10 rounded-sm"
          placeholder="email address"
        />
        <Input
          data-testid="invite-guest-new-name"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          className="bg-[#121214] border-white/10 rounded-sm"
          placeholder="name (optional)"
        />
        <Input
          data-testid="invite-guest-new-phone"
          type="tel"
          value={form.phone}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
          className="bg-[#121214] border-white/10 rounded-sm"
          placeholder="phone (optional)"
        />
        <Button
          type="submit"
          data-testid="invite-guest-submit-new"
          disabled={busy || !form.email}
          className="w-full bg-yellow-500 hover:bg-yellow-400 text-black rounded-sm font-mono uppercase tracking-widest text-[10px] h-9"
        >
          {busy ? "Creating guest…" : "Create guest account"}
        </Button>
      </form>
      <div className="text-[10px] text-zinc-600 mt-2">
        We&apos;ll create a guest account with a one-time password you can share with them.
      </div>
    </div>
  );
}
