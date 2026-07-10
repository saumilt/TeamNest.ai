import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Ticket, Copy, Loader2 } from "lucide-react";
import { Loading, Empty } from "./WorkspacesTab";

const ACCESS_LEVELS = [
  { id: "dev_os_demo", label: "Dev OS demo" },
  { id: "demo", label: "Demo" },
  { id: "full", label: "Full access" },
];

/** Super Admin → Invites: generate invite codes for potential customers. */
export default function InvitesTab() {
  const [invites, setInvites] = useState(null);
  const [form, setForm] = useState({ email: "", count: 1, access_level: "dev_os_demo", send_email: false });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setInvites(null);
    try {
      const { data } = await api.get("/superadmin/invites", { params: { limit: 50 } });
      setInvites(data.invites);
    } catch { setInvites([]); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const generate = async () => {
    setBusy(true);
    try {
      const { data } = await api.post("/superadmin/invites", {
        email: form.email.trim() || null,
        count: Number(form.count),
        access_level: form.access_level,
        send_email: form.send_email,
      });
      toast.success(`${data.codes.length} invite${data.codes.length === 1 ? "" : "s"} created${data.emailed ? " & emailed" : ""}`);
      setForm((f) => ({ ...f, email: "" }));
      load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
    setBusy(false);
  };

  const copyLink = (code) => {
    navigator.clipboard.writeText(`https://teamnest.ai/invite?code=${code}`)
      .then(() => toast.success("Invite link copied"))
      .catch(() => toast.error("Copy failed"));
  };

  return (
    <div>
      <div className="rounded-2xl border border-white/10 bg-surface-2 p-5">
        <div className="flex items-center gap-2 mb-4">
          <Ticket className="w-4 h-4 text-ai" />
          <h2 className="text-sm font-bold tracking-wide uppercase text-ink-dim">Invite potential customers</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <input placeholder="Email (optional)" type="email" value={form.email} onChange={set("email")}
            data-testid="sa-invite-email"
            className="sm:col-span-2 bg-bg border border-white/10 rounded-lg px-3 py-2 text-sm text-ink focus:border-ai focus:outline-none" />
          <input type="number" min="1" max="25" value={form.count} onChange={set("count")}
            data-testid="sa-invite-count"
            className="bg-bg border border-white/10 rounded-lg px-3 py-2 text-sm text-ink focus:border-ai focus:outline-none" />
          <select value={form.access_level} onChange={set("access_level")}
            data-testid="sa-invite-level"
            className="bg-bg border border-white/10 rounded-lg px-3 py-2 text-sm text-ink focus:border-ai focus:outline-none">
            {ACCESS_LEVELS.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
          </select>
        </div>
        <div className="flex items-center justify-between mt-3">
          <label className="flex items-center gap-2 text-xs text-ink-dim cursor-pointer">
            <input type="checkbox" checked={form.send_email} onChange={(e) => setForm((f) => ({ ...f, send_email: e.target.checked }))}
              data-testid="sa-invite-sendemail" className="accent-ai" />
            Email the invite to the address above
          </label>
          <button type="button" onClick={generate} disabled={busy}
            data-testid="sa-invite-generate"
            className="h-9 px-4 rounded-full bg-ai text-black font-bold text-sm inline-flex items-center gap-2 disabled:opacity-50">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Ticket className="w-4 h-4" />} Generate
          </button>
        </div>
      </div>

      <h3 className="text-xs font-bold uppercase tracking-wide text-ink-dim mt-6 mb-3">Recent invites</h3>
      {invites === null ? <Loading /> : invites.length === 0 ? <Empty label="No invites yet." /> : (
        <div className="space-y-2">
          {invites.map((inv) => (
            <div key={inv.code} className="flex items-center gap-3 p-3 rounded-xl border border-white/10 bg-surface-2" data-testid={`sa-invite-${inv.code}`}>
              <span className="font-mono font-bold text-ai text-sm">{inv.code}</span>
              <span className="text-xs text-ink-dim flex-1 truncate">{inv.recipient_email || "unassigned"} · {inv.access_level} · {inv.status}</span>
              <button type="button" onClick={() => copyLink(inv.code)} data-testid={`sa-invite-copy-${inv.code}`}
                className="p-1.5 rounded-lg text-ink-dim hover:text-ink hover:bg-white/5" title="Copy invite link">
                <Copy className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
