import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { ShieldCheck, Coins, Loader2, Save, ToggleRight, SlidersHorizontal, Building2, Users2, Ticket } from "lucide-react";
import WorkspacesTab from "./superadmin/WorkspacesTab";
import UsersTab from "./superadmin/UsersTab";
import InvitesTab from "./superadmin/InvitesTab";

const TABS = [
  { id: "settings", label: "Settings", icon: SlidersHorizontal },
  { id: "workspaces", label: "Workspaces", icon: Building2 },
  { id: "users", label: "Users", icon: Users2 },
  { id: "invites", label: "Invites", icon: Ticket },
];

const FIELDS = [
  { key: "free_monthly_credits", label: "Free plan", hint: "AI credits granted each month to every free workspace (also caps the free balance)." },
  { key: "pro_monthly_credits", label: "Pro plan", hint: "Monthly AI credits for Pro workspaces." },
  { key: "team_monthly_credits", label: "Team plan", hint: "Monthly AI credits per seat for Team workspaces." },
];

const FLAGS = [
  {
    key: "public_signup",
    label: "Open public signup",
    on: "Anyone can create an account.",
    off: "Invite-only — new accounts require an invite code.",
  },
  {
    key: "allow_workspace_deletion",
    label: "Allow workspace deletion",
    on: "Owners can close/delete their workspace.",
    off: "Workspace deletion is blocked platform-wide.",
  },
  {
    key: "allow_subuser_deletion",
    label: "Allow removing members",
    on: "Admins can remove members from group chats.",
    off: "Removing members is blocked platform-wide.",
  },
  {
    key: "require_template_approval",
    label: "Require template approval",
    on: "Marketplace submissions await admin review before going live.",
    off: "Submissions auto-publish to the marketplace immediately.",
  },
];

function Toggle({ checked, onChange, testId }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      data-testid={testId}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
        checked ? "bg-ai" : "bg-white/15"
      }`}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
          checked ? "translate-x-5" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

/**
 * Super Admin — app-level (global) platform settings. Gated to platform super
 * admins (user.is_super_admin). Configures per-plan monthly AI credit
 * allowances plus platform feature flags (signup, deletion, template approval).
 */
export default function SuperAdmin() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [tab, setTab] = useState("settings");
  const [values, setValues] = useState(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user && !user.is_super_admin) {
      nav("/dashboard", { replace: true });
    }
  }, [user, nav]);

  useEffect(() => {
    api
      .get("/superadmin/settings")
      .then(({ data }) => setValues(data.settings))
      .catch(() => toast.error("Failed to load platform settings"))
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const { data } = await api.put("/superadmin/settings", {
        free_monthly_credits: Number(values.free_monthly_credits),
        pro_monthly_credits: Number(values.pro_monthly_credits),
        team_monthly_credits: Number(values.team_monthly_credits),
        public_signup: !!values.public_signup,
        allow_workspace_deletion: !!values.allow_workspace_deletion,
        allow_subuser_deletion: !!values.allow_subuser_deletion,
        require_template_approval: !!values.require_template_approval,
      });
      setValues(data.settings);
      toast.success("Platform settings saved");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not save settings");
    } finally {
      setSaving(false);
    }
  };

  if (loading || !values) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg text-ink-dim">
        <Loader2 className="w-6 h-6 animate-spin text-ai" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg text-ink px-6 py-10 md:px-10">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-ai-tint flex items-center justify-center">
            <ShieldCheck className="w-5 h-5 text-ai" />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold">Super Admin</h1>
            <p className="text-sm text-ink-dim">Platform controls · applies to all workspaces</p>
          </div>
        </div>

        <div className="flex items-center gap-1 p-1 rounded-xl bg-surface-2 border border-white/10 w-fit mb-6">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                data-testid={`sa-tab-${t.id}`}
                className={`inline-flex items-center gap-2 h-9 px-4 rounded-lg text-sm font-semibold transition-colors ${
                  active ? "bg-ai text-black" : "text-ink-dim hover:text-ink"
                }`}
              >
                <Icon className="w-4 h-4" /> {t.label}
              </button>
            );
          })}
        </div>

        {tab === "workspaces" && <WorkspacesTab />}
        {tab === "users" && <UsersTab />}
        {tab === "invites" && <InvitesTab />}

        {tab === "settings" && (
        <>
        <div className="rounded-2xl border border-white/10 bg-surface-2 p-6">
          <div className="flex items-center gap-2 mb-5">
            <Coins className="w-4 h-4 text-ai" />
            <h2 className="text-sm font-bold tracking-wide uppercase text-ink-dim">
              Monthly AI credits per plan
            </h2>
          </div>

          <div className="space-y-5">
            {FIELDS.map((f) => (
              <div key={f.key} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                <div className="sm:w-40 shrink-0">
                  <div className="text-sm font-semibold">{f.label}</div>
                </div>
                <div className="flex-1">
                  <input
                    type="number"
                    min="0"
                    data-testid={`setting-${f.key}`}
                    value={values[f.key] ?? ""}
                    onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
                    className="w-32 bg-bg border border-white/10 rounded-lg px-3 py-2 text-ink focus:border-ai focus:outline-none"
                  />
                  <p className="text-xs text-ink-dim mt-1">{f.hint}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-white/10 bg-surface-2 p-6">
          <div className="flex items-center gap-2 mb-5">
            <ToggleRight className="w-4 h-4 text-ai" />
            <h2 className="text-sm font-bold tracking-wide uppercase text-ink-dim">
              Feature flags
            </h2>
          </div>

          <div className="divide-y divide-white/5">
            {FLAGS.map((f) => {
              const on = !!values[f.key];
              return (
                <div key={f.key} className="flex items-start justify-between gap-4 py-4 first:pt-0 last:pb-0">
                  <div className="flex-1">
                    <div className="text-sm font-semibold">{f.label}</div>
                    <p className="text-xs text-ink-dim mt-1">{on ? f.on : f.off}</p>
                  </div>
                  <Toggle
                    checked={on}
                    testId={`flag-${f.key}`}
                    onChange={(v) => setValues({ ...values, [f.key]: v })}
                  />
                </div>
              );
            })}
          </div>
        </div>

        <button
          type="button"
          data-testid="superadmin-save"
          onClick={save}
          disabled={saving}
          className="mt-7 inline-flex items-center gap-2 h-10 px-5 rounded-full bg-ai text-black font-bold text-sm hover:opacity-90 active:scale-95 disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save changes
        </button>
        </>
        )}
      </div>
    </div>
  );
}
