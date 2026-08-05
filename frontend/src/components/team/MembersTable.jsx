import { Mail, Check, CheckCheck, Eye, AlertTriangle } from "lucide-react";

function timeAgo(iso) {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const s = Math.floor((Date.now() - then) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

const DELIVERY = {
  opened: { label: "Opened", cls: "border-green-500/30 text-green-400", Icon: Eye },
  delivered: { label: "Delivered", cls: "border-sky-500/30 text-sky-400", Icon: CheckCheck },
  sent: { label: "Sent", cls: "border-zinc-500/30 text-zinc-400", Icon: Check },
  failed: { label: "Failed", cls: "border-red-500/40 text-red-400", Icon: AlertTriangle },
};

function DeliveryBadge({ info }) {
  if (!info || !info.status || info.status === "unknown") return null;
  const d = DELIVERY[info.status];
  if (!d) return null;
  const when = info.opened_at || info.delivered_at || info.sent_at;
  const title = info.status === "failed"
    ? info.failed_reason || "Delivery failed"
    : `${d.label}${when ? ` · ${timeAgo(when)}` : ""}`;
  return (
    <span
      data-testid={`member-delivery-${info.status}`}
      title={title}
      className={`text-[9px] font-mono uppercase tracking-widest px-1.5 py-0.5 border rounded-sm inline-flex items-center gap-1 ${d.cls}`}
    >
      <d.Icon className="w-2.5 h-2.5" /> {d.label}
    </span>
  );
}

/** Team roster with live invite status (Invited → Joined) + Mailgun delivery. */
export default function MembersTable({ members, canManage = false, onResend, analytics = {} }) {
  return (
    <div className="border border-white/5 bg-[#0a0a0a]">
      <div className="grid grid-cols-12 px-5 py-3 border-b border-white/5 label-mono">
        <div className="col-span-3">NAME</div>
        <div className="col-span-3">EMAIL</div>
        <div className="col-span-2">ROLE</div>
        <div className="col-span-3">STATUS</div>
        <div className="col-span-1 text-right">ACTION</div>
      </div>
      {members.map((m) => {
        const pending = m.status === "invited" || m.must_change_password;
        const joinedWhen = m.accepted_at || m.joined_at;
        const info = analytics[m.id];
        return (
          <div
            key={m.id}
            data-testid={`member-row-${m.id}`}
            className="grid grid-cols-12 px-5 py-4 border-b border-white/5 hover:bg-white/[0.03] items-center"
          >
            <div className="col-span-3 flex items-center gap-3">
              {m.avatar ? (
                <img src={m.avatar} className="w-8 h-8 object-cover rounded-sm" alt="" />
              ) : (
                <div className="w-8 h-8 bg-zinc-800 rounded-sm flex items-center justify-center text-xs font-bold">
                  {m.name.charAt(0)}
                </div>
              )}
              <span className="text-sm">{m.name}</span>
            </div>
            <div className="col-span-3 text-sm text-zinc-400 truncate">{m.email}</div>
            <div className="col-span-2 text-[10px] font-mono uppercase tracking-widest text-zinc-300">{m.role}</div>
            <div className="col-span-3 flex flex-wrap items-center gap-1.5">
              {pending ? (
                <span
                  data-testid={`member-status-invited-${m.id}`}
                  title={m.last_invite_sent_at ? `Invite sent ${timeAgo(m.last_invite_sent_at)}` : "Invitation pending"}
                  className="text-[10px] font-mono uppercase tracking-widest px-2 py-0.5 border rounded-sm border-yellow-500/30 text-yellow-400"
                >
                  Invited{m.last_invite_sent_at ? ` · ${timeAgo(m.last_invite_sent_at)}` : ""}
                </span>
              ) : (
                <span
                  data-testid={`member-status-joined-${m.id}`}
                  title={joinedWhen ? `Joined ${timeAgo(joinedWhen)}` : "Active member"}
                  className="text-[10px] font-mono uppercase tracking-widest px-2 py-0.5 border rounded-sm border-green-500/30 text-green-400 inline-flex items-center gap-1"
                >
                  <Check className="w-2.5 h-2.5" /> Joined{joinedWhen ? ` · ${timeAgo(joinedWhen)}` : ""}
                </span>
              )}
              {pending && <DeliveryBadge info={info} />}
            </div>
            <div className="col-span-1 flex justify-end">
              {canManage && pending && onResend ? (
                <button
                  type="button"
                  data-testid={`member-resend-${m.id}`}
                  onClick={() => onResend(m)}
                  title="Resend invitation email"
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-sm border border-yellow-500/30 text-yellow-300 hover:bg-yellow-400/10 text-[10px] font-mono uppercase tracking-widest"
                >
                  <Mail className="w-3 h-3" /> Resend
                </button>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
