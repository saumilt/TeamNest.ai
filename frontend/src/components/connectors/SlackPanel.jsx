import { useEffect, useState } from "react";
import { toast } from "sonner";
import { MessageSquare, Check, Loader2, Send, AlertTriangle } from "lucide-react";
import { api } from "@/lib/api";

/**
 * Workspace-level Slack panel — owner/admin only. Connects nothing itself (the
 * bot token lives on the server); it shows connection status and lets an admin
 * pick a default channel + toggle what auto-posts (@ai answers, budget alerts),
 * then fire a test message.
 */
function Toggle({ checked, onChange, label, desc, testId, disabled }) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onChange(!checked)}
      data-testid={testId}
      disabled={disabled}
      className="w-full flex items-start justify-between gap-3 py-2.5 text-left disabled:opacity-50"
    >
      <div className="min-w-0">
        <div className="text-sm text-ink font-medium">{label}</div>
        <div className="text-xs text-ink-dim">{desc}</div>
      </div>
      <span className={`shrink-0 mt-0.5 w-10 h-6 rounded-full transition-colors relative ${checked ? "bg-ai" : "bg-white/15"}`}>
        <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-black transition-all ${checked ? "left-[18px]" : "left-0.5"}`} />
      </span>
    </button>
  );
}

export default function SlackPanel() {
  const [status, setStatus] = useState(null);
  const [hidden, setHidden] = useState(false);
  const [channels, setChannels] = useState([]);
  const [cfg, setCfg] = useState(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    api.get("/connectors/slack/status")
      .then((r) => { setStatus(r.data); setCfg(r.data.config); })
      .catch((e) => { if (e?.response?.status === 403) setHidden(true); });
  }, []);

  useEffect(() => {
    if (status?.connected) {
      api.get("/connectors/slack/channels")
        .then((r) => setChannels(r.data.channels || []))
        .catch(() => {});
    }
  }, [status?.connected]);

  const patch = async (p) => {
    setSaving(true);
    const next = { ...cfg, ...p };
    setCfg(next);
    try {
      const { data } = await api.put("/connectors/slack/config", p);
      setCfg(data.config);
    } catch {
      toast.error("Could not save Slack settings");
      setCfg(cfg);
    } finally { setSaving(false); }
  };

  const pickChannel = (id) => {
    const ch = channels.find((c) => c.id === id);
    patch({ default_channel_id: id, default_channel_name: ch ? ch.name : null });
  };

  const sendTest = async () => {
    setTesting(true);
    try {
      await api.post("/connectors/slack/test");
      toast.success(`Test message sent to #${cfg?.default_channel_name || "channel"}`);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Test failed");
    } finally { setTesting(false); }
  };

  if (hidden) return null;

  return (
    <section className="mb-8" data-testid="slack-panel">
      <h2 className="text-sm font-bold text-ink mb-3 flex items-center gap-2">
        <MessageSquare className="w-4 h-4 text-ai" /> Slack notifications
      </h2>
      <div className="rounded-2xl border border-line bg-surface p-4">
        {!status ? (
          <div className="py-6 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-ai" /></div>
        ) : !status.configured ? (
          <div className="flex items-center gap-2 text-sm text-ink-dim" data-testid="slack-not-configured">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            Slack isn&apos;t set up on the server yet. Add a bot token (SLACK_BOT_TOKEN) to enable it.
          </div>
        ) : !status.connected ? (
          <div className="flex items-center gap-2 text-sm text-red-400" data-testid="slack-error">
            <AlertTriangle className="w-4 h-4" /> Slack token invalid: {status.error || "auth failed"}
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 flex items-center gap-1" data-testid="slack-connected-badge">
                  <Check className="w-3 h-3" /> Connected
                </span>
                <span className="text-sm text-ink-dim">{status.team ? `to ${status.team}` : ""}</span>
              </div>
              {saving && <Loader2 className="w-4 h-4 animate-spin text-ink-mute" />}
            </div>

            <label className="text-[11px] uppercase tracking-widest text-ink-mute">Default channel</label>
            <select
              value={cfg?.default_channel_id || ""}
              onChange={(e) => pickChannel(e.target.value)}
              data-testid="slack-channel-select"
              className="w-full mt-1 mb-4 h-11 rounded-xl bg-bg border border-line px-3 text-ink text-sm"
            >
              <option value="">Select a channel…</option>
              {channels.map((c) => (
                <option key={c.id} value={c.id}>{c.is_private ? "🔒 " : "# "}{c.name}</option>
              ))}
            </select>

            <div className="border-t border-line pt-1">
              <Toggle
                testId="slack-toggle-enabled"
                checked={!!cfg?.enabled}
                onChange={(v) => patch({ enabled: v })}
                label="Enable Slack posting"
                desc="Master switch for all auto-posts to the channel above."
              />
              <Toggle
                testId="slack-toggle-ai"
                checked={!!cfg?.post_ai_answers}
                onChange={(v) => patch({ post_ai_answers: v })}
                disabled={!cfg?.enabled}
                label="Post @ai & ZIP answers"
                desc="Mirror each @ai answer (and knowledge-ZIP insights) into Slack."
              />
              <Toggle
                testId="slack-toggle-budget"
                checked={!!cfg?.post_budget_alerts}
                onChange={(v) => patch({ post_budget_alerts: v })}
                disabled={!cfg?.enabled}
                label="Post AI-credit budget alerts"
                desc="Warn the channel when a credit cap hits 80% / 100%."
              />
            </div>

            <div className="mt-4">
              <button
                onClick={sendTest}
                disabled={testing || !cfg?.default_channel_id}
                data-testid="slack-send-test"
                className="text-xs px-3 py-2 rounded-lg bg-ai text-black font-semibold flex items-center gap-1.5 disabled:opacity-50"
              >
                {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                Send test message
              </button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
