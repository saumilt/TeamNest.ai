import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import {
  UserPlus, Trash2, Ban, CheckCircle2, ShieldCheck, KeyRound, X,
  Copy, Mail, Link2, RefreshCw, ChevronRight, AlertTriangle,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { PasswordInput } from "@/components/ui-v2/PasswordInput";
import { SearchBar, Loading, Empty } from "./WorkspacesTab";

/** Super Admin → Users: list all users across workspaces + manage them. */
export default function UsersTab() {
  const { user: me } = useAuth();
  const [rows, setRows] = useState(null);
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [detailFor, setDetailFor] = useState(null);

  const load = useCallback(async (q = "") => {
    setRows(null);
    try {
      const { data } = await api.get("/superadmin/users", { params: { search: q, limit: 150 } });
      setRows(data.users);
    } catch {
      setRows([]);
      toast.error("Failed to load users");
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const patch = async (id, body, okMsg) => {
    try {
      await api.patch(`/superadmin/users/${id}`, body);
      setRows((list) => list.map((u) => (u.id === id ? { ...u, ...body } : u)));
      if (okMsg) toast.success(okMsg);
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };

  const del = async (u) => {
    if (!window.confirm(`Permanently delete ${u.email}? Solely-owned workspaces are purged.`)) return;
    try {
      await api.delete(`/superadmin/users/${u.id}`);
      setRows((list) => list.filter((x) => x.id !== u.id));
      toast.success("User deleted");
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <div className="flex-1"><SearchBar value={search} onChange={setSearch} onSubmit={() => load(search)} placeholder="Search users by name or email…" testid="sa-user-search" /></div>
        <button type="button" onClick={() => setShowAdd(true)} data-testid="sa-user-add-btn"
          className="h-10 px-4 rounded-full bg-ai text-black font-bold text-sm inline-flex items-center gap-2 hover:opacity-90">
          <UserPlus className="w-4 h-4" /> Add user
        </button>
      </div>

      {rows === null ? <Loading /> : rows.length === 0 ? <Empty label="No users found." /> : (
        <div className="space-y-2">
          {rows.map((u) => (
            <div key={u.id} className="flex items-center gap-3 p-3.5 rounded-xl border border-white/10 bg-surface-2" data-testid={`sa-user-${u.id}`}>
              <button type="button" onClick={() => setDetailFor(u)}
                data-testid={`sa-user-open-${u.id}`}
                className="min-w-0 flex-1 text-left group">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold truncate group-hover:text-ai transition-colors">{u.name || u.email}</span>
                  {u.is_super_admin && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-ai-tint text-ai inline-flex items-center gap-1"><ShieldCheck className="w-3 h-3" />SUPER</span>}
                  {u.status === "suspended" && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-300">SUSPENDED</span>}
                </div>
                <div className="text-xs text-ink-dim truncate">{u.email} · {u.workspace_name || "no workspace"} · {u.role}</div>
              </button>
              <button type="button" onClick={() => setDetailFor(u)}
                data-testid={`sa-user-reset-${u.id}`}
                className="p-2 rounded-lg text-ink-dim hover:text-ink hover:bg-white/5" title="Manage / reset password">
                <KeyRound className="w-4 h-4" />
              </button>
              {u.id !== me?.id && (
              <>
              <button type="button" onClick={() => patch(u.id, { is_super_admin: !u.is_super_admin }, u.is_super_admin ? "Super-admin revoked" : "Super-admin granted")}
                data-testid={`sa-user-super-${u.id}`}
                className={`p-2 rounded-lg hover:bg-white/5 ${u.is_super_admin ? "text-ai" : "text-ink-dim hover:text-ai"}`} title="Toggle super-admin">
                <ShieldCheck className="w-4 h-4" />
              </button>
              <button type="button" onClick={() => patch(u.id, { status: u.status === "suspended" ? "active" : "suspended" }, u.status === "suspended" ? "Reactivated" : "Suspended")}
                data-testid={`sa-user-suspend-${u.id}`}
                className="p-2 rounded-lg text-ink-dim hover:text-amber-300 hover:bg-white/5" title={u.status === "suspended" ? "Reactivate" : "Deactivate"}>
                {u.status === "suspended" ? <CheckCircle2 className="w-4 h-4" /> : <Ban className="w-4 h-4" />}
              </button>
              <button type="button" onClick={() => del(u)}
                data-testid={`sa-user-delete-${u.id}`}
                className="p-2 rounded-lg text-ink-dim hover:text-rose-400 hover:bg-white/5" title="Delete">
                <Trash2 className="w-4 h-4" />
              </button>
              </>
              )}
              <ChevronRight className="w-4 h-4 text-ink-mute shrink-0" />
            </div>
          ))}
        </div>
      )}

      {showAdd && <AddUserModal onClose={() => setShowAdd(false)} onCreated={() => { setShowAdd(false); load(search); }} />}
      {detailFor && (
        <UserDetailModal
          userId={detailFor.id}
          isSelf={detailFor.id === me?.id}
          onClose={() => setDetailFor(null)}
          onSaved={() => load(search)}
        />
      )}
    </div>
  );
}

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl bg-surface ring-1 ring-white/10 overflow-hidden max-h-[90vh] flex flex-col">
        <div className="flex items-center px-5 py-3.5 border-b border-white/10 shrink-0">
          <div className="text-sm font-bold flex-1">{title}</div>
          <button type="button" onClick={onClose} className="p-1 text-ink-dim hover:text-ink"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

const inputCls = "w-full bg-bg border border-white/10 rounded-lg px-3 py-2 text-sm text-ink focus:border-ai focus:outline-none";
const labelCls = "text-[11px] font-semibold uppercase tracking-wider text-ink-mute mb-1 block";

function AddUserModal({ onClose, onCreated }) {
  const [form, setForm] = useState({ name: "", email: "", password: "", credits: "" });
  const [sendEmail, setSendEmail] = useState(true);
  const [cc, setCc] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const submit = async () => {
    setBusy(true);
    try {
      const { data } = await api.post("/superadmin/users", {
        name: form.name, email: form.email, password: form.password,
        credits: Number(form.credits) || 0,
        send_credentials: sendEmail,
        cc: cc.trim() ? cc.split(",").map((s) => s.trim()).filter(Boolean) : null,
      });
      const bits = [];
      if (data.credits_added) bits.push(`${data.credits_added.toLocaleString()} credits added`);
      bits.push(data.credentials_emailed ? "credentials emailed" : "created");
      toast.success(`User provisioned — ${bits.join(" · ")}`);
      onCreated();
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed to create user"); }
    setBusy(false);
  };
  return (
    <Modal title="Add new user" onClose={onClose}>
      <div className="space-y-3">
        <input placeholder="Full name" value={form.name} onChange={set("name")} data-testid="sa-add-name" className={inputCls} />
        <input placeholder="Email (this is their login / user ID)" type="email" value={form.email} onChange={set("email")} data-testid="sa-add-email" className={inputCls} />
        <PasswordInput placeholder="Temporary password" value={form.password} onChange={set("password")} testId="sa-add-password" className={inputCls} />
        <p className="text-[11px] text-ink-dim -mt-1">Min 8 chars incl. uppercase, lowercase, number & special character.</p>
        <input placeholder="One-time credits to add (optional)" type="number" min="0" value={form.credits} onChange={set("credits")} data-testid="sa-add-credits" className={inputCls} />
        <label className="flex items-center gap-2 text-xs text-ink-dim cursor-pointer select-none">
          <input type="checkbox" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} data-testid="sa-add-sendemail" className="accent-[var(--ai,#f5b301)]" />
          Email login + a reset link to the user
        </label>
        {sendEmail && (
          <input placeholder="CC (comma-separated emails, optional)" value={cc} onChange={(e) => setCc(e.target.value)} data-testid="sa-add-cc" className={inputCls} />
        )}
        <p className="text-xs text-ink-dim">A new workspace is created with this user as owner.</p>
        <button type="button" onClick={submit} disabled={busy || !form.name || !form.email || !form.password}
          data-testid="sa-add-submit"
          className="w-full h-10 rounded-full bg-ai text-black font-bold text-sm disabled:opacity-50">
          {busy ? "Creating…" : "Create user"}
        </button>
      </div>
    </Modal>
  );
}

const ROLES = ["owner", "admin", "member"];

function UserDetailModal({ userId, isSelf, onClose, onSaved }) {
  const [detail, setDetail] = useState(null);
  const [form, setForm] = useState({ name: "", email: "", role: "member", status: "active", is_super_admin: false });
  const [savingEdit, setSavingEdit] = useState(false);
  // password management
  const [customPw, setCustomPw] = useState("");
  const [sendEmail, setSendEmail] = useState(true);
  const [pwResult, setPwResult] = useState(null);   // {password, email_sent}
  const [linkResult, setLinkResult] = useState(null);
  const [pwBusy, setPwBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get(`/superadmin/users/${userId}`);
        setDetail(data);
        setForm({
          name: data.name || "", email: data.email || "",
          role: data.role || "member", status: data.status || "active",
          is_super_admin: !!data.is_super_admin,
        });
      } catch (e) { toast.error(e?.response?.data?.detail || "Failed to load user"); onClose(); }
    })();
  }, [userId, onClose]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const saveEdit = async () => {
    setSavingEdit(true);
    try {
      const body = { name: form.name, email: form.email, role: form.role, status: form.status };
      if (!isSelf) body.is_super_admin = form.is_super_admin;
      await api.patch(`/superadmin/users/${userId}`, body);
      toast.success("User updated");
      onSaved?.();
    } catch (e) { toast.error(e?.response?.data?.detail || "Update failed"); }
    setSavingEdit(false);
  };

  const resetPassword = async () => {
    setPwBusy(true); setPwResult(null);
    try {
      const { data } = await api.post(`/superadmin/users/${userId}/reset-password`, {
        new_password: customPw.trim() || undefined,
        send_email: sendEmail,
      });
      setPwResult(data);
      setCustomPw("");
      toast.success(data.email_sent ? `New password emailed to ${data.email}` : "New password set");
    } catch (e) { toast.error(e?.response?.data?.detail || "Reset failed"); }
    setPwBusy(false);
  };

  const genResetLink = async () => {
    setPwBusy(true); setLinkResult(null);
    try {
      const { data } = await api.post(`/superadmin/users/reset-link`, { uid: userId, send_email: sendEmail });
      setLinkResult(data);
      toast.success(data.email_sent ? "Reset link emailed" : "Reset link generated");
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
    setPwBusy(false);
  };

  const copy = (text, label) => {
    navigator.clipboard?.writeText(text);
    toast.success(`${label} copied`);
  };

  if (!detail) {
    return <Modal title="User details" onClose={onClose}><Loading /></Modal>;
  }

  return (
    <Modal title={`User · ${detail.email}`} onClose={onClose}>
      <div className="space-y-5" data-testid="sa-user-detail">
        {/* Read-only summary */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <Info label="Workspace" value={detail.workspace_name || "—"} />
          <Info label="Plan" value={detail.plan ? (detail.plan.unlimited ? `${detail.plan.plan_name} · Unlimited` : detail.plan.plan_name) : "—"} />
          <Info label="Created" value={fmtDate(detail.created_at)} />
          <Info label="Last login" value={fmtDate(detail.last_login_at)} />
          <Info label=".edu verified" value={detail.edu_verified ? (detail.edu_email || "Yes") : "No"} />
          <Info label="Must change pw" value={detail.must_change_password ? "Yes" : "No"} />
        </div>

        {/* Edit */}
        <div className="space-y-3 border-t border-white/10 pt-4">
          <div className="text-xs font-bold text-ink-dim uppercase tracking-wider">Edit details</div>
          <div>
            <label className={labelCls}>Full name</label>
            <input value={form.name} onChange={set("name")} data-testid="sa-edit-name" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Email (login ID)</label>
            <input type="email" value={form.email} onChange={set("email")} data-testid="sa-edit-email" className={inputCls} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Role</label>
              <select value={form.role} onChange={set("role")} data-testid="sa-edit-role" className={inputCls}>
                {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Status</label>
              <select value={form.status} onChange={set("status")} data-testid="sa-edit-status" className={inputCls} disabled={isSelf}>
                <option value="active">active</option>
                <option value="suspended">suspended</option>
              </select>
            </div>
          </div>
          {!isSelf && (
            <label className="flex items-center gap-2 text-xs text-ink-dim cursor-pointer select-none">
              <input type="checkbox" checked={form.is_super_admin} data-testid="sa-edit-super"
                onChange={(e) => setForm((f) => ({ ...f, is_super_admin: e.target.checked }))}
                className="accent-[var(--ai,#f5b301)]" />
              Super-admin access
            </label>
          )}
          <button type="button" onClick={saveEdit} disabled={savingEdit || !form.name || !form.email}
            data-testid="sa-edit-save"
            className="w-full h-10 rounded-full bg-ai text-black font-bold text-sm disabled:opacity-50">
            {savingEdit ? "Saving…" : "Save changes"}
          </button>
        </div>

        {/* Password management */}
        <div className="space-y-3 border-t border-white/10 pt-4">
          <div className="text-xs font-bold text-ink-dim uppercase tracking-wider">Password</div>
          <div>
            <label className={labelCls}>Set a specific password (optional — leave blank to auto-generate)</label>
            <PasswordInput value={customPw} onChange={(e) => setCustomPw(e.target.value)} placeholder="Auto-generate a strong password"
              testId="sa-reset-input" className={inputCls} />
            <p className="text-[11px] text-ink-dim mt-1">Min 8 chars incl. uppercase, lowercase, number & special character. User must change it on next login.</p>
          </div>
          <label className="flex items-center gap-2 text-xs text-ink-dim cursor-pointer select-none">
            <input type="checkbox" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)}
              data-testid="sa-reset-sendemail" className="accent-[var(--ai,#f5b301)]" />
            Email the new password / link to the user
          </label>
          <div className="flex gap-2">
            <button type="button" onClick={resetPassword} disabled={pwBusy}
              data-testid="sa-reset-submit"
              className="flex-1 h-10 rounded-full bg-ai text-black font-bold text-sm disabled:opacity-50 inline-flex items-center justify-center gap-1.5">
              <RefreshCw className="w-4 h-4" /> Reset & {sendEmail ? "email" : "set"} password
            </button>
            <button type="button" onClick={genResetLink} disabled={pwBusy}
              data-testid="sa-reset-link-btn"
              className="h-10 px-3 rounded-full bg-surface-2 hover:bg-surface-3 text-ink text-sm font-medium inline-flex items-center gap-1.5" title="Generate a reset link">
              <Link2 className="w-4 h-4" /> Reset link
            </button>
          </div>

          {pwResult && (
            <div className="rounded-lg bg-emerald-500/10 ring-1 ring-emerald-500/30 p-3 text-xs" data-testid="sa-reset-result">
              <div className="flex items-center gap-1.5 text-emerald-300 font-semibold mb-1">
                {pwResult.email_sent ? <Mail className="w-3.5 h-3.5" /> : <KeyRound className="w-3.5 h-3.5" />}
                {pwResult.email_sent ? `New password emailed to ${pwResult.email}` : "New temporary password"}
              </div>
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-black/30 rounded px-2 py-1 font-mono text-ink break-all">{pwResult.password}</code>
                <button type="button" onClick={() => copy(pwResult.password, "Password")} className="p-1.5 rounded hover:bg-white/10 text-ink-dim hover:text-ink" data-testid="sa-copy-password"><Copy className="w-3.5 h-3.5" /></button>
              </div>
              {!pwResult.email_sent && <p className="text-ink-mute mt-1">Email not sent ({pwResult.email_reason}). Share this password with the user directly.</p>}
            </div>
          )}

          {linkResult && (
            <div className="rounded-lg bg-sky-500/10 ring-1 ring-sky-500/30 p-3 text-xs" data-testid="sa-reset-link-result">
              <div className="flex items-center gap-1.5 text-sky-300 font-semibold mb-1">
                <Link2 className="w-3.5 h-3.5" /> Single-use reset link (valid {linkResult.expires_in_minutes} min)
              </div>
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-black/30 rounded px-2 py-1 font-mono text-ink break-all">{linkResult.reset_link}</code>
                <button type="button" onClick={() => copy(linkResult.reset_link, "Reset link")} className="p-1.5 rounded hover:bg-white/10 text-ink-dim hover:text-ink" data-testid="sa-copy-link"><Copy className="w-3.5 h-3.5" /></button>
              </div>
              <LinkDomainWarning link={linkResult.reset_link} onCopy={copy} />
              {!linkResult.email_sent && <p className="text-ink-mute mt-1">Email not sent ({linkResult.email_reason}). Share this link with the user directly.</p>}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

function linkDomainIssue(link) {
  // Warn when a generated link's domain differs from the domain the admin is
  // currently on (the custom domain), which signals a PUBLIC_BACKEND_URL mismatch.
  try {
    const here = window.location.origin;
    if (!link) return null;
    if (!/^https?:\/\//i.test(link)) {
      return { actual: "(no domain)", expected: here, corrected: here + (link.startsWith("/") ? link : "/" + link) };
    }
    const u = new URL(link);
    if (u.origin !== here) {
      return { actual: u.origin, expected: here, corrected: here + u.pathname + u.search + u.hash };
    }
    return null;
  } catch {
    return null;
  }
}

function LinkDomainWarning({ link, onCopy }) {
  const issue = linkDomainIssue(link);
  if (!issue) return null;
  return (
    <div className="mt-2 rounded-md bg-amber-500/10 ring-1 ring-amber-500/40 p-2 text-[11px] text-amber-200" data-testid="sa-link-domain-warning">
      <div className="flex items-center gap-1.5 font-semibold text-amber-300 mb-1">
        <AlertTriangle className="w-3.5 h-3.5" /> This link uses the wrong domain
      </div>
      Points to <span className="font-mono">{issue.actual}</span>, not your current domain{" "}
      <span className="font-mono">{issue.expected}</span>. Your <span className="font-mono">PUBLIC_BACKEND_URL</span> may be misconfigured — send this corrected link instead:
      <div className="flex items-center gap-2 mt-1.5">
        <code className="flex-1 bg-black/30 rounded px-2 py-1 font-mono break-all">{issue.corrected}</code>
        <button type="button" onClick={() => onCopy(issue.corrected, "Corrected link")} className="p-1.5 rounded hover:bg-white/10 text-amber-200" data-testid="sa-copy-corrected-link"><Copy className="w-3.5 h-3.5" /></button>
      </div>
    </div>
  );
}

function Info({ label, value }) {
  return (
    <div className="bg-bg rounded-lg px-3 py-2 border border-white/5">
      <div className="text-[10px] uppercase tracking-wider text-ink-mute">{label}</div>
      <div className="text-ink truncate">{value}</div>
    </div>
  );
}

function fmtDate(v) {
  if (!v) return "—";
  try { return new Date(v).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }); }
  catch { return "—"; }
}
