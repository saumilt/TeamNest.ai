import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";

const TABS = ["Waitlist", "Codes", "Drops", "Leaderboard", "Analytics", "Emails", "Settings"];
const LEVELS = ["waitlist_only", "demo", "dev_os_demo", "ai_employees_demo", "team_collab_demo", "founder_beta", "agency_beta", "restaurant_ops_beta", "full_beta"];
const MODES = ["invite_only", "waitlist", "approved_only", "open"];
const ANNOUNCE_PLATFORMS = [
  { key: "linkedin", label: "LinkedIn" },
  { key: "x", label: "X" },
  { key: "instagram", label: "Instagram" },
  { key: "facebook", label: "Facebook" },
];

const Card = ({ children, className = "" }) => (
  <div className={`rounded-2xl bg-surface ring-1 ring-hairline p-4 ${className}`}>{children}</div>
);
const Btn = ({ children, className = "", ...r }) => (
  <button type="button" className={`h-8 px-3 rounded-pill text-[12px] font-medium bg-amber-300 text-black hover:bg-amber-200 disabled:opacity-50 ${className}`} {...r}>{children}</button>
);
const Inp = (p) => <input {...p} className={`h-9 px-3 rounded-xl bg-surface-2 ring-1 ring-hairline text-[13px] text-ink outline-none focus:ring-amber-400/40 ${p.className || ""}`} />;
const Sel = (p) => <select {...p} className={`h-9 px-2 rounded-xl bg-surface-2 ring-1 ring-hairline text-[13px] text-ink outline-none ${p.className || ""}`}>{p.children}</select>;

export default function LaunchAdmin() {
  const [tab, setTab] = useState("Waitlist");
  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-5" data-testid="launch-admin">
      <div>
        <h1 className="text-2xl font-bold text-ink">Launch Control</h1>
        <p className="text-ink-dim text-sm">Invite-only beta — waitlist, codes, drops & access modes.</p>
      </div>
      <div className="flex gap-1.5 flex-wrap">
        {TABS.map((t) => (
          <button key={t} type="button" onClick={() => setTab(t)} data-testid={`la-tab-${t.toLowerCase()}`}
            className={`h-9 px-4 rounded-pill text-[13px] font-medium ${tab === t ? "bg-amber-300 text-black" : "bg-surface-2 text-ink-dim hover:text-ink ring-1 ring-hairline"}`}>
            {t}
          </button>
        ))}
      </div>
      {tab === "Waitlist" && <WaitlistTab />}
      {tab === "Codes" && <CodesTab />}
      {tab === "Drops" && <DropsTab />}
      {tab === "Leaderboard" && <LeaderboardTab />}
      {tab === "Analytics" && <AnalyticsTab />}
      {tab === "Emails" && <EmailsTab />}
      {tab === "Settings" && <SettingsTab />}
    </div>
  );
}

function WaitlistTab() {
  const [q, setQ] = useState(""); const [status, setStatus] = useState("");
  const [rows, setRows] = useState([]);
  const [grantEmail, setGrantEmail] = useState(""); const [grantCount, setGrantCount] = useState(4);
  const load = useCallback(() => {
    api.get(`/launch/admin/waitlist?q=${encodeURIComponent(q)}&status=${status}`)
      .then((r) => setRows(r.data.users)).catch(() => {});
  }, [q, status]);
  useEffect(() => { load(); }, [load]);

  const approve = async (id) => {
    const level = window.prompt("Access level:", "demo");
    if (!level) return;
    try {
      const { data } = await api.post(`/launch/admin/waitlist/${id}/approve`, { access_level: level, invites: 4 });
      toast.success(`Approved — code ${data.code} emailed`); load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };
  const reject = async (id) => {
    await api.post(`/launch/admin/waitlist/${id}/reject`); toast.success("Rejected"); load();
  };
  const grant = async () => {
    try {
      await api.post("/launch/admin/users/grant-invites", { email: grantEmail, count: Number(grantCount) });
      toast.success(`Granted ${grantCount} invites to ${grantEmail}`); setGrantEmail("");
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap items-center">
        <Inp placeholder="Search name/email/company…" value={q} onChange={(e) => setQ(e.target.value)} data-testid="la-wl-search" className="w-64" />
        <Sel value={status} onChange={(e) => setStatus(e.target.value)} data-testid="la-wl-filter-status">
          <option value="">All statuses</option>
          {["waiting", "priority_review", "invited", "approved", "converted", "rejected"].map((s) => <option key={s} value={s}>{s}</option>)}
        </Sel>
        <a href={`${process.env.REACT_APP_BACKEND_URL}/api/launch/admin/waitlist/export`} data-testid="la-wl-export"
          className="h-9 px-4 rounded-pill bg-surface-2 ring-1 ring-hairline text-[13px] text-ink-dim inline-flex items-center hover:text-ink">Export CSV</a>
      </div>
      <Card>
        <div className="text-[13px] font-semibold text-ink mb-2">Push extra invites to a user</div>
        <div className="flex gap-2 flex-wrap">
          <Inp placeholder="user@email.com" value={grantEmail} onChange={(e) => setGrantEmail(e.target.value)} data-testid="la-grant-email" className="w-64" />
          <Sel value={grantCount} onChange={(e) => setGrantCount(e.target.value)} data-testid="la-grant-count">
            {[1, 4, 10, 25].map((n) => <option key={n} value={n}>{n} invites</option>)}
          </Sel>
          <Btn onClick={grant} disabled={!grantEmail} data-testid="la-grant-send">Grant</Btn>
        </div>
      </Card>
      <div className="overflow-x-auto rounded-2xl ring-1 ring-hairline">
        <table className="w-full text-[12px]" data-testid="la-wl-table">
          <thead className="bg-surface text-ink-mute text-left">
            <tr>{["Name", "Email", "Company", "Use case", "Rank", "Refs", "Status", "Actions"].map((h) => <th key={h} className="px-3 py-2.5 font-medium">{h}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.id} className="border-t border-hairline text-ink-dim" data-testid={`la-wl-row-${u.email}`}>
                <td className="px-3 py-2 text-ink">{u.name}</td>
                <td className="px-3 py-2">{u.email}</td>
                <td className="px-3 py-2">{u.company || "—"}</td>
                <td className="px-3 py-2 max-w-[160px] truncate">{u.use_case || u.build_answer || "—"}</td>
                <td className="px-3 py-2 font-mono">#{u.rank}</td>
                <td className="px-3 py-2 font-mono">{u.referral_count}</td>
                <td className="px-3 py-2">{u.status}</td>
                <td className="px-3 py-2">
                  <div className="flex gap-1.5">
                    <Btn onClick={() => approve(u.id)} data-testid={`la-approve-${u.email}`} className="!h-7">Approve</Btn>
                    <button type="button" onClick={() => reject(u.id)} data-testid={`la-reject-${u.email}`}
                      className="h-7 px-3 rounded-pill text-[12px] bg-surface-2 ring-1 ring-hairline text-ink-mute hover:text-rose-300">Reject</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CodesTab() {
  const [camps, setCamps] = useState([]);
  const [form, setForm] = useState({ campaign_name: "", campaign_type: "social_media_drop", code_prefix: "", count: 5, max_uses_per_code: 1, invites_granted: 4, access_level: "demo", expires_hours: "", source_channel: "direct", custom_code: "" });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const load = () => api.get("/launch/admin/campaigns").then((r) => setCamps(r.data.campaigns)).catch(() => {});
  useEffect(() => { load(); }, []);

  const generate = async () => {
    try {
      const { data } = await api.post("/launch/admin/codes/generate", {
        ...form, count: Number(form.count), max_uses_per_code: Number(form.max_uses_per_code),
        invites_granted: Number(form.invites_granted),
        expires_hours: form.expires_hours ? Number(form.expires_hours) : null,
        custom_code: form.custom_code || null,
      });
      toast.success(`Generated ${data.codes.length} code(s): ${data.codes.slice(0, 3).join(", ")}${data.codes.length > 3 ? "…" : ""}`);
      load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };
  const toggle = async (id) => { await api.post(`/launch/admin/campaigns/${id}/toggle`); load(); };

  return (
    <div className="space-y-4">
      <Card>
        <div className="text-[13px] font-semibold text-ink mb-3">Generate invite codes</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
          <Inp placeholder="Campaign name" value={form.campaign_name} onChange={set("campaign_name")} data-testid="la-gen-name" />
          <Sel value={form.campaign_type} onChange={set("campaign_type")} data-testid="la-gen-type">
            {["social_media_drop", "founder_invite", "agency_invite", "investor_invite", "restaurant_demo_invite", "event_invite", "influencer_code", "partner_code", "internal_team_code"].map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
          </Sel>
          <Inp placeholder="Prefix (e.g. TN)" value={form.code_prefix} onChange={set("code_prefix")} data-testid="la-gen-prefix" />
          <Inp placeholder="Custom code (optional)" value={form.custom_code} onChange={set("custom_code")} data-testid="la-gen-custom" />
          <Inp type="number" placeholder="# codes" value={form.count} onChange={set("count")} data-testid="la-gen-count" />
          <Inp type="number" placeholder="Uses per code" value={form.max_uses_per_code} onChange={set("max_uses")} onInput={set("max_uses_per_code")} data-testid="la-gen-uses" />
          <Inp type="number" placeholder="Invites granted" value={form.invites_granted} onChange={set("invites_granted")} data-testid="la-gen-invites" />
          <Sel value={form.access_level} onChange={set("access_level")} data-testid="la-gen-level">
            {LEVELS.map((l) => <option key={l} value={l}>{l.replace(/_/g, " ")}</option>)}
          </Sel>
          <Inp type="number" placeholder="Expires (hours, blank = never)" value={form.expires_hours} onChange={set("expires_hours")} data-testid="la-gen-expiry" />
          <Inp placeholder="Source channel" value={form.source_channel} onChange={set("source_channel")} data-testid="la-gen-source" />
        </div>
        <Btn onClick={generate} disabled={!form.campaign_name} data-testid="la-gen-submit" className="mt-3">Generate codes</Btn>
      </Card>
      {camps.map((c) => (
        <Card key={c.id} data-testid={`la-camp-${c.campaign_name.replace(/\s/g, "-")}`}>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[13px] font-semibold text-ink">{c.campaign_name}</span>
            <span className="text-[11px] text-ink-mute">{c.campaign_type} · {c.access_level} · {c.total_redemptions} redemptions</span>
            <span className={`text-[11px] px-2 py-0.5 rounded-full ${c.status === "active" ? "bg-emerald-500/10 text-emerald-300" : "bg-rose-500/10 text-rose-300"}`}>{c.status}</span>
            <button type="button" onClick={() => toggle(c.id)} data-testid={`la-camp-toggle-${c.id}`}
              className="ml-auto h-7 px-3 rounded-pill text-[12px] bg-surface-2 ring-1 ring-hairline text-ink-dim hover:text-ink">
              {c.status === "active" ? "Pause" : "Resume"}
            </button>
          </div>
          <div className="flex gap-1.5 flex-wrap mt-2.5">
            {c.codes.slice(0, 20).map((code) => (
              <span key={code.code} className="font-mono text-[11px] px-2 py-1 rounded bg-surface-2 text-amber-300">
                {code.code} <span className="text-ink-mute">{code.used_count}/{code.max_uses}</span>
              </span>
            ))}
            {c.codes.length > 20 && <span className="text-[11px] text-ink-mute">+{c.codes.length - 20} more</span>}
          </div>
        </Card>
      ))}
    </div>
  );
}

function DropsTab() {
  const [drops, setDrops] = useState([]);
  const [announce, setAnnounce] = useState(null);
  const [form, setForm] = useState({ code: "", title: "", max_uses: 100, expires_hours: 24, access_level: "dev_os_demo", invites_granted: 4, source: "linkedin" });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const load = () => api.get("/launch/admin/drops").then((r) => setDrops(r.data.drops)).catch(() => {});
  useEffect(() => { load(); }, []);
  const create = async () => {
    try {
      const { data } = await api.post("/launch/admin/drops", { ...form, max_uses: Number(form.max_uses), expires_hours: Number(form.expires_hours), invites_granted: Number(form.invites_granted) });
      toast.success(`Drop live at ${data.drop_url}`); load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };
  return (
    <div className="space-y-4">
      <Card>
        <div className="text-[13px] font-semibold text-ink mb-3">Create social code drop</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
          <Inp placeholder="Code (e.g. DEVOS200)" value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))} data-testid="la-drop-code" />
          <Inp placeholder="Campaign title" value={form.title} onChange={set("title")} data-testid="la-drop-title" />
          <Inp type="number" placeholder="Max uses" value={form.max_uses} onChange={set("max_uses")} data-testid="la-drop-uses" />
          <Inp type="number" placeholder="Expiry (hours)" value={form.expires_hours} onChange={set("expires_hours")} data-testid="la-drop-expiry" />
          <Sel value={form.access_level} onChange={set("access_level")} data-testid="la-drop-level">
            {LEVELS.map((l) => <option key={l} value={l}>{l.replace(/_/g, " ")}</option>)}
          </Sel>
          <Sel value={form.source} onChange={set("source")} data-testid="la-drop-source">
            {["linkedin", "x", "instagram", "tiktok", "newsletter", "webinar"].map((s) => <option key={s} value={s}>{s}</option>)}
          </Sel>
        </div>
        <Btn onClick={create} disabled={!form.code || !form.title} data-testid="la-drop-create" className="mt-3">Launch drop</Btn>
      </Card>
      {drops.map((d) => (
        <Card key={d.id} data-testid={`la-drop-${d.code}`}>
          <div className="flex items-center gap-3 flex-wrap text-[12px]">
            <span className="font-mono font-bold text-amber-300">{d.code}</span>
            <span className="text-ink">{d.title}</span>
            <span className="text-ink-mute">{d.used}/{d.max_uses} used · {d.access_level} · {d.source}</span>
            <div className="ml-auto flex items-center gap-3">
              <button type="button" onClick={() => setAnnounce(announce === d.code ? null : d.code)}
                data-testid={`la-announce-toggle-${d.code}`}
                className="h-7 px-3 rounded-pill text-[12px] font-medium bg-amber-300 text-black hover:bg-amber-200">
                {announce === d.code ? "Hide post" : "Generate post"}
              </button>
              <a href={`/drop/${d.code}`} target="_blank" rel="noreferrer" className="text-amber-300 hover:text-amber-200">/drop/{d.code} →</a>
            </div>
          </div>
          {announce === d.code && <AnnouncePanel code={d.code} />}
        </Card>
      ))}
    </div>
  );
}

function AnnouncePanel({ code }) {
  const [posts, setPosts] = useState(null);
  const [meta, setMeta] = useState(null);
  const [plat, setPlat] = useState("linkedin");
  const [aiBusy, setAiBusy] = useState(false);
  useEffect(() => {
    api.get(`/launch/admin/drops/${code}/announcement`)
      .then((r) => { setPosts(r.data.posts); setMeta(r.data.meta); })
      .catch(() => toast.error("Could not load announcement copy"));
  }, [code]);
  const aiRewrite = async () => {
    setAiBusy(true);
    try {
      const { data } = await api.post(`/launch/admin/drops/${code}/announcement/ai`);
      setPosts(data.posts); toast.success("AI rewrote the copy");
    } catch (e) { toast.error(e?.response?.data?.detail || "AI rewrite failed"); }
    setAiBusy(false);
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(posts[plat]); toast.success("Copied to clipboard"); }
    catch { toast.error("Copy failed — select the text manually"); }
  };
  if (!posts) return <div className="mt-3 text-[12px] text-ink-mute">Loading copy…</div>;
  return (
    <div className="mt-3 rounded-xl bg-surface-2 ring-1 ring-hairline p-3" data-testid={`la-announce-${code}`}>
      <div className="flex items-center gap-1.5 flex-wrap mb-2">
        {ANNOUNCE_PLATFORMS.map((p) => (
          <button key={p.key} type="button" onClick={() => setPlat(p.key)}
            data-testid={`la-announce-tab-${p.key}`}
            className={`h-7 px-3 rounded-pill text-[11px] font-medium ${plat === p.key ? "bg-amber-300 text-black" : "bg-surface text-ink-dim ring-1 ring-hairline hover:text-ink"}`}>
            {p.label}
          </button>
        ))}
        {meta && <span className="ml-auto text-[11px] text-ink-mute">{meta.spots_left} spots left</span>}
      </div>
      <textarea readOnly value={posts[plat]} data-testid={`la-announce-text-${code}`}
        className="w-full h-44 p-3 rounded-lg bg-surface ring-1 ring-hairline text-[12px] text-ink font-mono outline-none resize-none" />
      <div className="flex gap-2 mt-2">
        <Btn onClick={copy} data-testid={`la-announce-copy-${code}`}>Copy</Btn>
        <button type="button" onClick={aiRewrite} disabled={aiBusy} data-testid={`la-announce-ai-${code}`}
          className="h-8 px-3 rounded-pill text-[12px] font-medium bg-surface ring-1 ring-hairline text-ink-dim hover:text-ink disabled:opacity-50">
          {aiBusy ? "Rewriting…" : "✨ AI rewrite"}
        </button>
      </div>
    </div>
  );
}

function LeaderboardTab() {
  const [rows, setRows] = useState([]);
  useEffect(() => { api.get("/launch/admin/leaderboard").then((r) => setRows(r.data.leaders)).catch(() => {}); }, []);
  return (
    <Card data-testid="la-leaderboard">
      {rows.map((r, i) => (
        <div key={r.email} className="flex items-center gap-3 py-2.5 border-b border-hairline last:border-0 text-[13px]">
          <span className="font-mono text-ink-mute w-6">#{i + 1}</span>
          <span className="text-ink font-medium">{r.name}</span>
          <span className="text-ink-mute text-[12px]">{r.email}</span>
          <span className="ml-auto font-mono text-amber-300">{r.referral_count} referrals</span>
          {(r.badges || []).map((b) => <span key={b} className="text-[10px] px-2 py-0.5 rounded-full bg-amber-400/10 text-amber-300">{b.replace(/_/g, " ")}</span>)}
        </div>
      ))}
    </Card>
  );
}

function AnalyticsTab() {
  const [a, setA] = useState(null);
  useEffect(() => { api.get("/launch/admin/analytics").then((r) => setA(r.data)).catch(() => {}); }, []);
  if (!a) return <Card>Loading…</Card>;
  const items = [
    ["Waitlist users", a.waitlist_users], ["Invited", a.invited], ["Approved", a.approved],
    ["Converted to accounts", a.converted], ["Code redemptions", a.code_redemptions],
    ["Referrals", a.referrals], ["Active codes", a.active_codes], ["Pricing views", a.pricing_views],
    ["Checkout starts", a.checkout_starts], ["Checkout blocked", a.checkout_blocked],
    ["Drop views", a.drop_views], ["Revenue (placeholder)", `$${a.revenue_usd}`],
  ];
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3" data-testid="la-analytics">
      {items.map(([label, v]) => (
        <Card key={label} className="text-center">
          <div className="font-mono text-2xl font-bold text-amber-300">{v}</div>
          <div className="text-[11px] text-ink-mute mt-1">{label}</div>
        </Card>
      ))}
    </div>
  );
}

function EmailsTab() {
  const [emails, setEmails] = useState([]);
  const [open, setOpen] = useState(null);
  useEffect(() => { api.get("/launch/admin/emails").then((r) => setEmails(r.data.emails)).catch(() => {}); }, []);
  return (
    <div className="space-y-2" data-testid="la-emails">
      {emails.map((e) => (
        <Card key={e.id}>
          <button type="button" onClick={() => setOpen(open === e.id ? null : e.id)} className="w-full text-left flex items-center gap-3 text-[12px]">
            <span className={`px-2 py-0.5 rounded-full text-[10px] ${e.status === "sent" ? "bg-emerald-500/10 text-emerald-300" : "bg-amber-400/10 text-amber-300"}`}>{e.status}</span>
            <span className="text-ink font-medium">{e.subject}</span>
            <span className="text-ink-mute">→ {e.to}</span>
            <span className="ml-auto text-ink-mute">{e.kind}</span>
          </button>
          {open === e.id && (
            <iframe title="email preview" srcDoc={e.html} className="w-full h-72 mt-3 rounded-xl bg-white" data-testid="la-email-preview" />
          )}
        </Card>
      ))}
      {emails.length === 0 && <Card className="text-ink-mute text-sm">No emails yet.</Card>}
    </div>
  );
}

function SettingsTab() {
  const [s, setS] = useState(null);
  const load = () => api.get("/launch/admin/settings").then((r) => setS(r.data)).catch(() => {});
  useEffect(() => { load(); }, []);
  if (!s) return <Card>Loading…</Card>;
  const save = async (patch) => {
    try {
      const { data } = await api.put("/launch/admin/settings", patch);
      setS(data); toast.success("Launch settings updated");
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };
  const FLAGS = [
    ["allow_open_signup", "Allow open signup"],
    ["allow_public_pricing", "Allow public pricing"],
    ["allow_public_checkout", "Allow public checkout"],
    ["allow_invited_upgrade", "Allow invited users to upgrade"],
    ["allow_waitlist_pricing_preview", "Waitlist users can preview pricing"],
    ["require_invite_before_checkout", "Require invite code before checkout"],
    ["require_admin_approval_before_checkout", "Require admin approval before checkout"],
  ];
  return (
    <Card data-testid="la-settings">
      <div className="text-[13px] font-semibold text-ink mb-1.5">Launch Access Mode</div>
      <div className="flex gap-1.5 flex-wrap mb-2">
        {MODES.map((m) => (
          <button key={m} type="button" onClick={() => save({ mode: m })} data-testid={`la-mode-${m}`}
            className={`h-9 px-4 rounded-pill text-[13px] font-medium ${s.mode === m ? "bg-amber-300 text-black" : "bg-surface-2 text-ink-dim ring-1 ring-hairline hover:text-ink"}`}>
            {m.replace(/_/g, " ")}
          </button>
        ))}
      </div>
      {s.mode === "open" && <div className="text-[12px] text-emerald-300 mb-3" data-testid="la-open-note">Open Signup Mode is active. Anyone can sign up and purchase a plan.</div>}
      <div className="space-y-2 mt-3">
        {FLAGS.map(([key, label]) => (
          <label key={key} className="flex items-center gap-3 text-[13px] text-ink-dim cursor-pointer">
            <input type="checkbox" checked={!!s[key]} onChange={(e) => save({ [key]: e.target.checked })}
              data-testid={`la-flag-${key}`} className="accent-amber-300 w-4 h-4" />
            {label}
          </label>
        ))}
      </div>
    </Card>
  );
}
