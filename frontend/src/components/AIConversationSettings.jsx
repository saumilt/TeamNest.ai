import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { MessagesSquare, Loader2, Shield, KeyRound, RotateCw, Building2 } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

const Toggle = ({ label, hint, checked, onChange, testid }) => (
  <label className="flex items-start gap-3 py-2 cursor-pointer" data-testid={testid}>
    <input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)}
      className="mt-1 accent-[var(--ai)]" />
    <span className="min-w-0">
      <span className="text-sm text-ink block">{label}</span>
      {hint && <span className="text-xs text-ink-mute block">{hint}</span>}
    </span>
  </label>
);

const Select = ({ label, value, onChange, options, testid }) => (
  <label className="flex items-center justify-between gap-3 py-2">
    <span className="text-sm text-ink">{label}</span>
    <select value={value} onChange={(e) => onChange(e.target.value)} data-testid={testid}
      className="h-9 rounded-lg bg-bg border border-line px-2 text-sm text-ink">
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  </label>
);

const TIMEOUTS = [
  { value: "", label: "Inherit workspace" },
  { value: "10", label: "10 minutes" },
  { value: "30", label: "30 minutes" },
  { value: "60", label: "1 hour" },
  { value: "0", label: "Until I exit" },
];
const THRESHOLDS = [
  { value: "", label: "Inherit workspace" },
  { value: "0.6", label: "Relaxed (continue more)" },
  { value: "0.75", label: "Balanced" },
  { value: "0.9", label: "Strict (ask more)" },
];
const WS_TIMEOUTS = TIMEOUTS.filter((t) => t.value !== "");
const WS_THRESHOLDS = THRESHOLDS.filter((t) => t.value !== "");

export default function AIConversationSettings() {
  const { user } = useAuth();
  const isAdmin = ["owner", "admin"].includes(user?.role);
  const [prefs, setPrefs] = useState(null);
  const [ws, setWs] = useState(null);
  const [sec, setSec] = useState(null);
  const [accounts, setAccounts] = useState(null);
  const [savingP, setSavingP] = useState(false);
  const [savingW, setSavingW] = useState(false);

  const load = useCallback(async () => {
    try {
      const p = await api.get("/ai-conversation/preferences");
      setPrefs(p.data.preferences);
      setWs(p.data.workspace);
      if (isAdmin) {
        const s = await api.get("/admin/security-settings");
        setSec(s.data);
        const a = await api.get("/admin/provisioned-accounts");
        setAccounts(a.data);
      }
    } catch { toast.error("Failed to load settings"); }
  }, [isAdmin]);
  useEffect(() => { load(); }, [load]);

  const savePrefs = async () => {
    setSavingP(true);
    try {
      await api.put("/ai-conversation/preferences", {
        auto_continue_enabled: prefs.auto_continue_enabled,
        ask_when_ambiguous: prefs.ask_when_ambiguous,
        show_recipient_indicator: prefs.show_recipient_indicator,
        session_timeout_minutes: prefs.session_timeout_minutes,
        follow_up_threshold: prefs.follow_up_threshold,
      });
      toast.success("Preferences saved");
    } catch { toast.error("Failed to save"); } finally { setSavingP(false); }
  };

  const saveWs = async () => {
    setSavingW(true);
    try {
      await api.put("/ai-conversation/workspace-settings", {
        enabled: ws.enabled, allow_in_group_chats: ws.allow_in_group_chats,
        default_timeout_minutes: ws.default_timeout_minutes,
        follow_up_threshold: ws.follow_up_threshold,
      });
      toast.success("Workspace settings saved");
    } catch { toast.error("Failed to save"); } finally { setSavingW(false); }
  };

  const saveSecurity = async () => {
    try {
      await api.put("/admin/security-settings", { temp_password_expiry_days: sec.temp_password_expiry_days });
      toast.success("Security settings saved");
      load();
    } catch { toast.error("Failed to save"); }
  };

  const rotate = async (acc) => {
    try {
      const { data } = await api.post(`/admin/provisioned-accounts/${acc.id}/rotate`);
      toast.success(`New temporary password for ${data.email}: ${data.temporary_password}`, { duration: 12000 });
      load();
    } catch { toast.error("Failed to rotate"); }
  };

  if (!prefs) return null;

  return (
    <div className="space-y-4" data-testid="ai-conversation-settings">
      {/* User preferences */}
      <section className="rounded-2xl border border-line bg-surface p-5">
        <h2 className="text-sm font-bold text-ink mb-1 flex items-center gap-2">
          <MessagesSquare className="w-4 h-4 text-ai" /> AI Conversation Mode
        </h2>
        <p className="text-xs text-ink-mute mb-3">Mention AI once, then continue naturally — control how follow-ups are routed to the AI.</p>
        <Toggle label="Continue AI conversations automatically" testid="pref-auto-continue"
          hint="After you mention @ai, related follow-ups continue with the AI without another mention."
          checked={prefs.auto_continue_enabled} onChange={(v) => setPrefs({ ...prefs, auto_continue_enabled: v })} />
        <Toggle label="Ask when uncertain" testid="pref-ask-ambiguous"
          hint="Show a small 'Continue with AI?' choice for borderline messages instead of auto-routing."
          checked={prefs.ask_when_ambiguous} onChange={(v) => setPrefs({ ...prefs, ask_when_ambiguous: v })} />
        <Toggle label="Show the 'Continuing with @ai' indicator" testid="pref-show-indicator"
          checked={prefs.show_recipient_indicator} onChange={(v) => setPrefs({ ...prefs, show_recipient_indicator: v })} />
        <Select label="Keep AI mode active for" testid="pref-timeout"
          value={prefs.session_timeout_minutes ?? ""}
          onChange={(v) => setPrefs({ ...prefs, session_timeout_minutes: v === "" ? null : Number(v) })}
          options={TIMEOUTS} />
        <Select label="Follow-up sensitivity" testid="pref-threshold"
          value={prefs.follow_up_threshold ?? ""}
          onChange={(v) => setPrefs({ ...prefs, follow_up_threshold: v === "" ? null : Number(v) })}
          options={THRESHOLDS} />
        <button onClick={savePrefs} disabled={savingP} data-testid="pref-save"
          className="mt-3 h-9 px-4 rounded-xl bg-ai text-black font-bold text-sm flex items-center gap-2 disabled:opacity-50">
          {savingP && <Loader2 className="w-4 h-4 animate-spin" />} Save preferences
        </button>
      </section>

      {/* Workspace admin settings */}
      {isAdmin && ws && (
        <section className="rounded-2xl border border-line bg-surface p-5">
          <h2 className="text-sm font-bold text-ink mb-1 flex items-center gap-2">
            <Building2 className="w-4 h-4 text-ai" /> Workspace defaults <span className="text-[10px] text-ink-mute">(admin)</span>
          </h2>
          <Toggle label="Enable AI Conversation Mode for the workspace" testid="ws-enabled"
            checked={ws.enabled} onChange={(v) => setWs({ ...ws, enabled: v })} />
          <Toggle label="Allow AI follow-ups in group chats" testid="ws-allow-group"
            checked={ws.allow_in_group_chats} onChange={(v) => setWs({ ...ws, allow_in_group_chats: v })} />
          <Select label="Default timeout" testid="ws-timeout"
            value={String(ws.default_timeout_minutes)}
            onChange={(v) => setWs({ ...ws, default_timeout_minutes: Number(v) })} options={WS_TIMEOUTS} />
          <Select label="Default follow-up sensitivity" testid="ws-threshold"
            value={String(ws.follow_up_threshold)}
            onChange={(v) => setWs({ ...ws, follow_up_threshold: Number(v) })} options={WS_THRESHOLDS} />
          <button onClick={saveWs} disabled={savingW} data-testid="ws-save"
            className="mt-3 h-9 px-4 rounded-xl bg-ai text-black font-bold text-sm flex items-center gap-2 disabled:opacity-50">
            {savingW && <Loader2 className="w-4 h-4 animate-spin" />} Save workspace defaults
          </button>
        </section>
      )}

      {/* Security — temporary password expiry */}
      {isAdmin && sec && (
        <section className="rounded-2xl border border-line bg-surface p-5" data-testid="security-settings">
          <h2 className="text-sm font-bold text-ink mb-1 flex items-center gap-2">
            <Shield className="w-4 h-4 text-ai" /> Temporary password expiry <span className="text-[10px] text-ink-mute">(admin)</span>
          </h2>
          <p className="text-xs text-ink-mute mb-3">Provisioned accounts that never complete first login lose their temporary password after this many days. Use 0 to never expire.</p>
          <div className="flex items-center gap-2">
            <input type="number" min="0" value={sec.temp_password_expiry_days} data-testid="sec-expiry-days"
              onChange={(e) => setSec({ ...sec, temp_password_expiry_days: Number(e.target.value) })}
              className="h-9 w-24 rounded-lg bg-bg border border-line px-2 text-sm text-ink" />
            <span className="text-sm text-ink-mute">days</span>
            <button onClick={saveSecurity} data-testid="sec-save"
              className="h-9 px-4 rounded-xl bg-ai text-black font-bold text-sm">Save</button>
          </div>
          <div className="mt-4">
            <h3 className="text-xs font-bold text-ink-mute uppercase tracking-wide mb-2 flex items-center gap-1"><KeyRound className="w-3.5 h-3.5" /> Provisioned accounts</h3>
            {!accounts || accounts.accounts.length === 0 ? (
              <p className="text-sm text-ink-mute">No pending provisioned accounts.</p>
            ) : (
              <div className="space-y-2" data-testid="provisioned-accounts">
                {accounts.accounts.map((a) => (
                  <div key={a.id} className="flex items-center justify-between gap-3 rounded-xl border border-line p-3" data-testid={`provisioned-${a.id}`}>
                    <div className="min-w-0">
                      <p className="text-sm text-ink truncate">{a.name} · {a.email}</p>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full ${a.expired ? "bg-red-500/15 text-red-400" : "bg-white/5 text-ink-mute"}`}>
                        {a.expired ? "Expired" : "Active"}
                      </span>
                    </div>
                    <button onClick={() => rotate(a)} data-testid={`rotate-${a.id}`}
                      className="h-8 px-3 rounded-lg border border-line text-ink-mute hover:text-ink text-xs flex items-center gap-1">
                      <RotateCw className="w-3.5 h-3.5" /> Re-issue
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
