import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { abs, shareLinks } from "@/lib/launchShare";
import { Copy, Mail } from "lucide-react";

/** Authed invite dashboard (inside AppShell) — /invites */
export default function InviteDashboard() {
  const [data, setData] = useState(null);
  const [emailFor, setEmailFor] = useState(null);
  const [email, setEmail] = useState("");

  const load = () => api.get("/launch/my-invites").then((r) => setData(r.data)).catch(() => setData({ invites: [] }));
  useEffect(() => { load(); }, []);

  if (!data) return <div className="p-10 text-ink-mute">Loading invites…</div>;

  const sendEmail = async (inv) => {
    if (!email.trim()) return;
    try {
      await api.post(`/launch/my-invites/${inv.id}/send`, { email: email.trim() });
      toast.success(`Invite emailed to ${email.trim()}`);
      setEmailFor(null); setEmail(""); load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Could not send"); }
  };

  const copy = (inv) => {
    navigator.clipboard.writeText(abs(inv.invite_link));
    toast.success("Invite link copied!");
  };

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto space-y-6" data-testid="invite-dashboard">
      <div>
        <h1 className="text-2xl font-bold text-ink">Your invites</h1>
        <p className="text-ink-dim text-sm mt-1">
          <span className="text-amber-300 font-semibold" data-testid="invites-remaining">{data.remaining}</span> of {data.invites.length} invites left
          · {data.accepted} accepted
        </p>
        {data.badges?.length > 0 && (
          <div className="flex gap-2 mt-2 flex-wrap">
            {data.badges.map((b) => (
              <span key={b.key} data-testid={`badge-${b.key}`}
                className="rounded-full bg-amber-400/10 text-amber-300 border border-amber-400/25 px-3 py-1 text-xs font-bold">★ {b.name}</span>
            ))}
          </div>
        )}
      </div>

      {data.next_unlock && (
        <div className="rounded-2xl bg-surface ring-1 ring-hairline p-5" data-testid="team-multiplier">
          <div className="text-[13px] font-semibold text-ink">Team unlock progress</div>
          <div className="text-[12px] text-ink-dim mt-0.5">
            Invite {data.next_unlock.joins - data.accepted} more teammate{data.next_unlock.joins - data.accepted === 1 ? "" : "s"} to
            unlock <span className="text-amber-300">{data.next_unlock.label}</span>.
          </div>
          <div className="h-2 rounded-full bg-surface-2 overflow-hidden mt-3">
            <div className="h-full bg-amber-300 rounded-full" style={{ width: `${Math.min(100, (data.accepted / data.next_unlock.joins) * 100)}%` }} />
          </div>
          <div className="flex gap-3 mt-3 flex-wrap">
            {data.team_multiplier.map((t) => (
              <span key={t.joins} className={`text-[11px] ${data.accepted >= t.joins ? "text-amber-300" : "text-ink-mute"}`}>
                {data.accepted >= t.joins ? "✓" : "○"} {t.joins}: {t.label}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-3">
        {data.invites.map((inv) => {
          const links = shareLinks(abs(inv.invite_link));
          return (
            <div key={inv.id} data-testid={`invite-row-${inv.invite_code}`}
              className="rounded-2xl bg-surface ring-1 ring-hairline p-4">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="font-mono text-[15px] font-bold tracking-widest text-amber-300">{inv.invite_code}</span>
                <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
                  inv.status === "accepted" ? "bg-emerald-500/10 text-emerald-300" :
                  inv.status === "pending" ? "bg-sky-500/10 text-sky-300" : "bg-surface-2 text-ink-mute"}`}>
                  {inv.status}{inv.recipient_email ? ` · ${inv.recipient_email}` : ""}
                </span>
                {inv.status === "unused" && (
                  <div className="ml-auto flex items-center gap-1.5 flex-wrap">
                    <button type="button" onClick={() => copy(inv)} data-testid={`invite-copy-${inv.invite_code}`}
                      className="h-8 px-3 rounded-pill bg-surface-2 hover:bg-surface-3 ring-1 ring-hairline text-ink-dim text-[12px] inline-flex items-center gap-1.5">
                      <Copy className="w-3 h-3" /> Copy link
                    </button>
                    <button type="button" onClick={() => { setEmailFor(inv.id); setEmail(""); }} data-testid={`invite-email-${inv.invite_code}`}
                      className="h-8 px-3 rounded-pill bg-surface-2 hover:bg-surface-3 ring-1 ring-hairline text-ink-dim text-[12px] inline-flex items-center gap-1.5">
                      <Mail className="w-3 h-3" /> Email
                    </button>
                    {links.map((l) => (
                      <a key={l.key} href={l.url} target="_blank" rel="noreferrer" data-testid={`invite-share-${l.key}-${inv.invite_code}`}
                        className="h-8 px-3 rounded-pill bg-surface-2 hover:bg-surface-3 ring-1 ring-hairline text-ink-dim text-[12px] inline-flex items-center">
                        {l.label}
                      </a>
                    ))}
                  </div>
                )}
              </div>
              {emailFor === inv.id && (
                <div className="flex gap-2 mt-3">
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                    placeholder="friend@company.com" data-testid="invite-email-input"
                    className="flex-1 h-9 px-3 rounded-xl bg-surface-2 ring-1 ring-hairline text-[13px] text-ink outline-none focus:ring-amber-400/40" />
                  <button type="button" onClick={() => sendEmail(inv)} data-testid="invite-email-send"
                    className="h-9 px-4 rounded-pill bg-amber-300 text-black font-semibold text-[12px] hover:bg-amber-200">Send</button>
                </div>
              )}
            </div>
          );
        })}
        {data.invites.length === 0 && (
          <div className="text-ink-mute text-sm p-6 text-center rounded-2xl bg-surface ring-1 ring-hairline">
            No invites yet — they appear here once you're approved for the beta.
          </div>
        )}
      </div>
    </div>
  );
}
