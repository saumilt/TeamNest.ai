import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Glass, GoldButton, Input, Label, LaunchShell } from "@/pages/launch/LaunchShell";

const STATE_COPY = {
  invalid: { title: "That code isn't valid", body: "Double-check the code, or join the waitlist and we'll get you in as spots open." },
  expired: { title: "This code has expired", body: "Codes are time-limited to keep the beta small. Join the waitlist to request a new invite." },
  used: { title: "This code was already used", body: "All uses of this code are claimed. Join the waitlist — referrals move you up fast." },
  inactive: { title: "This campaign is paused", body: "The campaign behind this code is currently paused. Join the waitlist to request access." },
};

export default function InviteCode() {
  const [params] = useSearchParams();
  const [code, setCode] = useState((params.get("code") || "").toUpperCase());
  const [checked, setChecked] = useState(null); // {state, ...}
  const [form, setForm] = useState({ name: "", email: "", password: "", company: "", role_title: "", use_case: "" });
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(null);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const check = async (e) => {
    e?.preventDefault();
    if (!code.trim()) return;
    setBusy(true);
    try {
      const { data } = await api.get(`/launch/code/${encodeURIComponent(code.trim())}`);
      setChecked(data);
      if (data.state === "valid") toast.success(`Code accepted — ${data.access_name} unlocked`);
    } catch { toast.error("Could not validate code"); }
    finally { setBusy(false); }
  };

  const redeem = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { data } = await api.post("/launch/code/redeem", { code: code.trim(), ...form });
      setSuccess(data);
      toast.success("Welcome to the private beta! 🎉");
      setTimeout(() => { window.location.href = "/dashboard"; }, 2200);
    } catch (err) {
      const d = err?.response?.data?.detail || "";
      if (String(d).startsWith("code_")) setChecked({ state: String(d).slice(5) });
      else toast.error(d || "Could not redeem code");
    } finally { setBusy(false); }
  };

  if (success) {
    return (
      <LaunchShell testid="invite-success">
        <div className="max-w-lg mx-auto pt-16 text-center">
          <Glass className="p-10">
            <div className="text-5xl mb-4">🎉</div>
            <h1 className="text-3xl font-bold tracking-tight mb-2">You're in.</h1>
            <p className="text-zinc-400 text-sm leading-relaxed">
              <span className="text-amber-400 font-semibold">{success.access_name}</span> unlocked
              — plus <span className="text-amber-400 font-semibold" data-testid="invite-success-invites">{success.invites_granted} invites</span> to
              share with your team. Taking you to your workspace…
            </p>
          </Glass>
        </div>
      </LaunchShell>
    );
  }

  const err = checked && checked.state !== "valid" ? STATE_COPY[checked.state] || STATE_COPY.invalid : null;

  return (
    <LaunchShell testid="invite-page">
      <div className="max-w-lg mx-auto pt-8 md:pt-14">
        <div className="text-center mb-8">
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tighter">Enter your invite code</h1>
          <p className="text-zinc-400 mt-3">8 characters. Case doesn't matter.</p>
        </div>
        <Glass className="p-6 md:p-8">
          <form onSubmit={check} className="flex gap-2">
            <Input data-testid="invite-code-input" value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="TN7K9QX2" maxLength={12}
              className="font-mono !text-lg tracking-[0.3em] text-center uppercase" />
            <GoldButton type="submit" disabled={busy || !code.trim()} data-testid="invite-code-check" className="shrink-0">
              {busy && !checked ? "…" : "Check"}
            </GoldButton>
          </form>

          {err && (
            <div className="mt-5 rounded-xl border border-rose-500/30 bg-rose-500/[0.06] p-4" data-testid={`invite-state-${checked.state}`}>
              <div className="font-semibold text-rose-300 text-sm">{err.title}</div>
              <div className="text-zinc-400 text-sm mt-1">{err.body}</div>
              <div className="flex gap-2 mt-3">
                <Link to="/waitlist" data-testid="invite-err-waitlist"
                  className="rounded-full bg-amber-400 text-zinc-950 font-semibold px-5 py-2 text-xs hover:bg-amber-300">Join waitlist</Link>
                <Link to="/waitlist" className="rounded-full border border-zinc-700 text-zinc-300 px-5 py-2 text-xs hover:border-amber-400/50">Request new invite</Link>
              </div>
            </div>
          )}

          {checked?.state === "valid" && (
            <div className="mt-5" data-testid="invite-state-valid">
              <div className="rounded-xl border border-amber-400/30 bg-amber-400/[0.06] p-4 mb-5">
                <div className="text-amber-300 font-semibold text-sm">✓ {checked.access_name} unlocked</div>
                <div className="text-zinc-400 text-xs mt-1">
                  {checked.access_description} · {checked.invites_granted} invites included
                  {checked.remaining != null && ` · ${checked.remaining} uses left on this code`}
                </div>
              </div>
              <form onSubmit={redeem} className="space-y-3.5">
                <div><Label>Name *</Label><Input data-testid="invite-name" value={form.name} onChange={set("name")} required /></div>
                <div><Label>Email *</Label><Input data-testid="invite-email" type="email" value={form.email} onChange={set("email")} required /></div>
                <div><Label>Password *</Label><Input data-testid="invite-password" type="password" value={form.password} onChange={set("password")} required minLength={6} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Company</Label><Input data-testid="invite-company" value={form.company} onChange={set("company")} /></div>
                  <div><Label>Role</Label><Input data-testid="invite-role" value={form.role_title} onChange={set("role_title")} /></div>
                </div>
                <div><Label>What do you want to use TeamNest for?</Label><Input data-testid="invite-usecase" value={form.use_case} onChange={set("use_case")} /></div>
                <GoldButton type="submit" disabled={busy} data-testid="invite-redeem" className="w-full">
                  {busy ? "Creating your account…" : "Claim access & create account"}
                </GoldButton>
              </form>
            </div>
          )}
        </Glass>
        <p className="text-center text-zinc-500 text-sm mt-6">
          No code yet? <Link to="/waitlist" className="text-amber-400 hover:text-amber-300" data-testid="invite-to-waitlist">Join the waitlist →</Link>
        </p>
      </div>
    </LaunchShell>
  );
}
