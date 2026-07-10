import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { UserPlus, Trash2, Ban, CheckCircle2, ShieldCheck, KeyRound, X } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { SearchBar, Loading, Empty } from "./WorkspacesTab";

/** Super Admin → Users: list all users across workspaces + manage them. */
export default function UsersTab() {
  const { user: me } = useAuth();
  const [rows, setRows] = useState(null);
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [resetFor, setResetFor] = useState(null);

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
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold truncate">{u.name || u.email}</span>
                  {u.is_super_admin && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-ai-tint text-ai inline-flex items-center gap-1"><ShieldCheck className="w-3 h-3" />SUPER</span>}
                  {u.status === "suspended" && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-300">SUSPENDED</span>}
                </div>
                <div className="text-xs text-ink-dim truncate">{u.email} · {u.workspace_name || "no workspace"} · {u.role}</div>
              </div>
              <button type="button" onClick={() => setResetFor(u)}
                data-testid={`sa-user-reset-${u.id}`}
                className="p-2 rounded-lg text-ink-dim hover:text-ink hover:bg-white/5" title="Reset password">
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
            </div>
          ))}
        </div>
      )}

      {showAdd && <AddUserModal onClose={() => setShowAdd(false)} onCreated={() => { setShowAdd(false); load(search); }} />}
      {resetFor && <ResetPasswordModal user={resetFor} onClose={() => setResetFor(null)} />}
    </div>
  );
}

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl bg-surface ring-1 ring-white/10 overflow-hidden">
        <div className="flex items-center px-5 py-3.5 border-b border-white/10">
          <div className="text-sm font-bold flex-1">{title}</div>
          <button type="button" onClick={onClose} className="p-1 text-ink-dim hover:text-ink"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

const inputCls = "w-full bg-bg border border-white/10 rounded-lg px-3 py-2 text-sm text-ink focus:border-ai focus:outline-none";

function AddUserModal({ onClose, onCreated }) {
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const submit = async () => {
    setBusy(true);
    try {
      await api.post("/superadmin/users", form);
      toast.success("User created (must change password on first login)");
      onCreated();
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed to create user"); }
    setBusy(false);
  };
  return (
    <Modal title="Add new user" onClose={onClose}>
      <div className="space-y-3">
        <input placeholder="Full name" value={form.name} onChange={set("name")} data-testid="sa-add-name" className={inputCls} />
        <input placeholder="Email" type="email" value={form.email} onChange={set("email")} data-testid="sa-add-email" className={inputCls} />
        <input placeholder="Temporary password (min 6 chars)" type="text" value={form.password} onChange={set("password")} data-testid="sa-add-password" className={inputCls} />
        <p className="text-xs text-ink-dim">A new workspace is created with this user as owner. They must change the password on first login.</p>
        <button type="button" onClick={submit} disabled={busy || !form.name || !form.email || form.password.length < 6}
          data-testid="sa-add-submit"
          className="w-full h-10 rounded-full bg-ai text-black font-bold text-sm disabled:opacity-50">
          {busy ? "Creating…" : "Create user"}
        </button>
      </div>
    </Modal>
  );
}

function ResetPasswordModal({ user, onClose }) {
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      await api.post(`/superadmin/users/${user.id}/reset-password`, { new_password: pw });
      toast.success(`Password reset for ${user.email}`);
      onClose();
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
    setBusy(false);
  };
  return (
    <Modal title={`Reset password — ${user.email}`} onClose={onClose}>
      <div className="space-y-3">
        <input placeholder="New password (min 6 chars)" type="text" value={pw} onChange={(e) => setPw(e.target.value)} data-testid="sa-reset-input" className={inputCls} />
        <p className="text-xs text-ink-dim">The user will be required to change it on next login.</p>
        <button type="button" onClick={submit} disabled={busy || pw.length < 6} data-testid="sa-reset-submit"
          className="w-full h-10 rounded-full bg-ai text-black font-bold text-sm disabled:opacity-50">
          {busy ? "Saving…" : "Set new password"}
        </button>
      </div>
    </Modal>
  );
}
