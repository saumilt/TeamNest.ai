import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { BUILD_IDEAS, COMPANY_SIZES, INTEREST_AREAS, abs, shareLinks } from "@/lib/launchShare";
import { BadgePill, Glass, GoldButton, Input, Label, LaunchShell } from "@/pages/launch/LaunchShell";

export default function Waitlist() {
  const [params] = useSearchParams();
  const ref = params.get("ref") || "";
  const [status, setStatus] = useState(null);
  const [form, setForm] = useState({
    name: "", email: "", company: "", role: "", company_size: "",
    use_case: "", interest_area: "", build_answer: "",
  });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target?.value ?? e }));

  useEffect(() => {
    const check = params.get("check") || localStorage.getItem("tn:waitlist:email");
    if (check) {
      api.get(`/launch/waitlist/status?email=${encodeURIComponent(check)}`)
        .then(({ data }) => setStatus(data)).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim()) { toast.error("Name and email required"); return; }
    setBusy(true);
    try {
      const { data } = await api.post("/launch/waitlist", { ...form, ref: ref || undefined });
      localStorage.setItem("tn:waitlist:email", form.email.toLowerCase());
      setStatus(data);
      if (data.already_joined) toast.info("You're already on the waitlist — here's your status");
      else toast.success("You're on the waitlist! 🎉");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Could not join waitlist");
    } finally { setBusy(false); }
  };

  if (status) return <WaitlistDashboard status={status} />;

  return (
    <LaunchShell testid="waitlist-page">
      <div className="max-w-2xl mx-auto pt-8 md:pt-14">
        <div className="text-center mb-8">
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tighter">Join the waitlist</h1>
          <p className="text-zinc-400 mt-3 leading-relaxed">
            TeamNest.ai is currently invite-only. Join the private beta for the AI workspace
            where teams chat, hire AI employees, and build software with @devmanager.
          </p>
          {ref && <p className="mt-2 text-amber-400 text-sm" data-testid="waitlist-ref-note">Referred by code {ref} — your friend moves up 50 spots when you join.</p>}
        </div>
        <Glass className="p-6 md:p-8">
          <form onSubmit={submit} className="grid sm:grid-cols-2 gap-4">
            <div><Label>Name *</Label><Input data-testid="wl-name" value={form.name} onChange={set("name")} placeholder="Sam Torres" /></div>
            <div><Label>Email *</Label><Input data-testid="wl-email" type="email" value={form.email} onChange={set("email")} placeholder="sam@company.com" /></div>
            <div><Label>Company</Label><Input data-testid="wl-company" value={form.company} onChange={set("company")} placeholder="Acme Inc" /></div>
            <div><Label>Role</Label><Input data-testid="wl-role" value={form.role} onChange={set("role")} placeholder="Founder / Ops / Dev" /></div>
            <div>
              <Label>Company size</Label>
              <select data-testid="wl-size" value={form.company_size} onChange={set("company_size")}
                className="w-full bg-zinc-950/50 border border-zinc-800 rounded-xl px-4 py-3 text-zinc-50 focus:border-amber-400 outline-none text-sm">
                <option value="">Select…</option>
                {COMPANY_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <Label>Interest area</Label>
              <select data-testid="wl-interest" value={form.interest_area} onChange={set("interest_area")}
                className="w-full bg-zinc-950/50 border border-zinc-800 rounded-xl px-4 py-3 text-zinc-50 focus:border-amber-400 outline-none text-sm">
                <option value="">Select…</option>
                {INTEREST_AREAS.map((i) => <option key={i.key} value={i.key}>{i.label}</option>)}
              </select>
            </div>
            <div className="sm:col-span-2"><Label>Use case</Label><Input data-testid="wl-usecase" value={form.use_case} onChange={set("use_case")} placeholder="What problem are you solving?" /></div>
            <div className="sm:col-span-2">
              <Label>What would you build with @devmanager inside your team chat?</Label>
              <Input data-testid="wl-build" value={form.build_answer} onChange={set("build_answer")} placeholder="e.g. Restaurant operations dashboard" />
              <div className="flex flex-wrap gap-1.5 mt-2">
                {BUILD_IDEAS.map((b) => (
                  <button type="button" key={b} onClick={() => set("build_answer")({ target: { value: b } })}
                    data-testid={`wl-idea-${b.slice(0, 10).replace(/\s/g, "-")}`}
                    className="text-xs px-2.5 py-1 rounded-full border border-zinc-800 text-zinc-400 hover:border-amber-400/40 hover:text-amber-300 transition-colors">
                    {b}
                  </button>
                ))}
              </div>
            </div>
            <div className="sm:col-span-2 pt-2">
              <GoldButton type="submit" disabled={busy} data-testid="wl-submit" className="w-full">
                {busy ? "Joining…" : "Join the waitlist"}
              </GoldButton>
            </div>
          </form>
        </Glass>
        <p className="text-center text-zinc-500 text-sm mt-6">
          Already have a code? <Link to="/invite" className="text-amber-400 hover:text-amber-300" data-testid="wl-to-invite">Enter invite code →</Link>
        </p>
      </div>
    </LaunchShell>
  );
}

function WaitlistDashboard({ status }) {
  const link = abs(status.referral_link);
  const links = shareLinks(link);
  const copyLink = () => { navigator.clipboard.writeText(link); toast.success("Referral link copied!"); };
  const pct = Math.min(100, (status.referral_count / (status.next_milestone?.referrals || 1)) * 100);
  return (
    <LaunchShell testid="waitlist-dashboard">
      <div className="max-w-2xl mx-auto pt-8 md:pt-14 space-y-6">
        <Glass className="p-8 text-center">
          <div className="text-xs font-bold uppercase tracking-[0.2em] text-zinc-500 mb-3">Your waitlist position</div>
          <div className="font-mono text-6xl sm:text-7xl font-bold text-amber-400" data-testid="wl-rank">#{status.rank.toLocaleString()}</div>
          <div className="text-zinc-400 mt-2 text-sm" data-testid="wl-total">of {status.total.toLocaleString()} on the TeamNest waitlist</div>
          {status.badges?.length > 0 && (
            <div className="flex justify-center gap-2 mt-4 flex-wrap">
              {status.badges.map((b) => <BadgePill key={b} name={b.replace(/_/g, " ")} />)}
            </div>
          )}
          {status.reward_code && (
            <div className="mt-5 p-4 rounded-xl border border-amber-400/30 bg-amber-400/[0.06]" data-testid="wl-reward-code">
              <div className="text-sm text-zinc-300 mb-2">🎉 You unlocked demo access! Your invite code:</div>
              <div className="font-mono text-xl text-amber-400 font-bold tracking-widest">{status.reward_code}</div>
              <Link to={`/invite?code=${status.reward_code}`} data-testid="wl-claim-reward"
                className="inline-block mt-3 rounded-full bg-amber-400 text-zinc-950 font-semibold px-6 py-2.5 text-sm hover:bg-amber-300">Claim access →</Link>
            </div>
          )}
        </Glass>

        <Glass className="p-6 md:p-8">
          <h2 className="text-lg font-semibold mb-1">Invite friends to move up</h2>
          <p className="text-zinc-400 text-sm mb-4">Every referral moves you up 50 spots. 5 referrals unlocks private demo access.</p>
          <div className="flex gap-2">
            <Input readOnly value={link} data-testid="wl-ref-link" className="font-mono !text-xs" />
            <GoldButton type="button" onClick={copyLink} data-testid="wl-copy-link" className="!px-5 shrink-0">Copy</GoldButton>
          </div>
          <div className="flex flex-wrap gap-2 mt-4">
            {links.map((l) => (
              <a key={l.key} href={l.url} target="_blank" rel="noreferrer" data-testid={`wl-share-${l.key}`}
                className="rounded-full border border-zinc-700 px-4 py-2 text-xs text-zinc-300 hover:border-amber-400/50 hover:text-amber-300 transition-colors">
                {l.label}
              </a>
            ))}
          </div>
          <div className="mt-6">
            <div className="flex justify-between text-xs text-zinc-500 mb-1.5">
              <span data-testid="wl-ref-count">{status.referral_count} referral{status.referral_count === 1 ? "" : "s"}</span>
              {status.next_milestone && <span>Next: {status.next_milestone.reward} at {status.next_milestone.referrals}</span>}
            </div>
            <div className="h-2 rounded-full bg-zinc-800 overflow-hidden">
              <div className="h-full bg-amber-400 rounded-full transition-all" style={{ width: `${pct}%` }} />
            </div>
          </div>
        </Glass>

        <Glass className="p-6 md:p-8">
          <h2 className="text-lg font-semibold mb-4">Milestone rewards</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            {status.milestones.map((m) => {
              const done = status.referral_count >= m.referrals;
              return (
                <div key={m.referrals} data-testid={`wl-milestone-${m.referrals}`}
                  className={`rounded-xl border p-3.5 text-sm flex items-center gap-3 ${done ? "border-amber-400/40 bg-amber-400/[0.07] text-amber-200" : "border-zinc-800 text-zinc-400"}`}>
                  <span className={`font-mono font-bold ${done ? "text-amber-400" : "text-zinc-600"}`}>{m.referrals}</span>
                  <span>{m.reward}</span>
                  {done && <span className="ml-auto text-amber-400">✓</span>}
                </div>
              );
            })}
          </div>
        </Glass>
      </div>
    </LaunchShell>
  );
}
