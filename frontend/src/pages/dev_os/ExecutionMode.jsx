import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import {
  ChevronLeft, Activity, Cpu, Database, Globe, Bot, Loader2, Send,
  AlertTriangle, Bug as BugIcon, Sparkles, MessageSquare, ExternalLink, Power,
} from "lucide-react";
import { api } from "@/lib/api";
import AppBar from "@/components/ui-v2/AppBar";
import Pill from "@/components/ui-v2/Pill";

const POLL_MS = 4000;

const STATUS_TONE = {
  healthy:  "green",
  degraded: "amber",
  down:     "red",
  idle:     "default",
};

const LEVEL_COLOR = {
  info: "text-ink-dim",
  warn: "text-amber-300",
  err:  "text-red-300",
};

const TIER_ICON = {
  api:      Cpu,
  db:       Database,
  frontend: Globe,
  agent:    Bot,
  qa:       Activity,
  security: Activity,
};

/**
 * /dev-os/projects/:projectId/execution — full-screen "App running" view.
 * Polls /dev-projects/{id}/execution every few seconds for stats, health,
 * logs, and recent feedback. Lets the user submit feedback (comment/bug/
 * feature) which auto-creates a bug report when kind === "bug".
 */
export default function ExecutionMode() {
  const { projectId } = useParams();
  const [project, setProject] = useState(null);
  const [snap, setSnap] = useState(null);
  const [paused, setPaused] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState({ kind: "comment", message: "", screen: "" });
  const logBoxRef = useRef(null);
  const stickyBottom = useRef(true);

  const loadProject = useCallback(async () => {
    try {
      const { data } = await api.get(`/dev-projects/${projectId}`);
      setProject(data);
    } catch { /* noop */ }
  }, [projectId]);

  const loadSnap = useCallback(async () => {
    try {
      const { data } = await api.get(`/dev-projects/${projectId}/execution`);
      setSnap(data);
    } catch { /* noop */ }
  }, [projectId]);

  useEffect(() => { loadProject(); loadSnap(); }, [loadProject, loadSnap]);

  useEffect(() => {
    if (paused) return;
    const t = setInterval(loadSnap, POLL_MS);
    return () => clearInterval(t);
  }, [paused, loadSnap]);

  // Auto-scroll log stream to bottom unless user scrolled up.
  useEffect(() => {
    const el = logBoxRef.current;
    if (!el || !stickyBottom.current) return;
    el.scrollTop = el.scrollHeight;
  }, [snap?.logs]);

  const onLogScroll = () => {
    const el = logBoxRef.current;
    if (!el) return;
    stickyBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  };

  const submitFeedback = async () => {
    if (!feedback.message.trim()) return toast.error("Add a message first");
    setBusy(true);
    try {
      const { data } = await api.post(`/dev-projects/${projectId}/execution/feedback`, feedback);
      if (data.kind === "bug") toast.success(`Bug logged · #${data.linked_bug_id?.slice(0,6)}`);
      else toast.success("Feedback recorded");
      setFeedback({ kind: "comment", message: "", screen: "" });
      loadSnap();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Could not send feedback");
    } finally {
      setBusy(false);
    }
  };

  if (!project || !snap) {
    return (
      <div className="min-h-[100dvh] bg-bg flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-ink-dim" />
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-bg text-ink" data-testid="execution-mode">
      <AppBar
        left={
          <Link
            to={`/dev-os/projects/${projectId}/console`}
            className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-white/5"
            data-testid="exec-back"
          >
            <ChevronLeft className="w-5 h-5" />
          </Link>
        }
        center={
          <div className="flex items-center gap-2">
            <div className="text-[15px] font-semibold truncate max-w-[200px]">{project.name}</div>
            <Pill tone={snap.is_running ? "green" : "default"} size="sm">
              {snap.is_running ? "running" : "idle"}
            </Pill>
          </div>
        }
        right={
          <button
            type="button"
            onClick={() => setPaused((p) => !p)}
            data-testid="exec-toggle-poll"
            className="h-9 px-3 rounded-full bg-surface-2 text-ink text-[12px] font-medium flex items-center gap-1.5 hover:bg-white/10"
            title={paused ? "Resume live updates" : "Pause live updates"}
          >
            <Power className={`w-3.5 h-3.5 ${paused ? "text-ink-mute" : "text-tn-green"}`} />
            {paused ? "Paused" : "Live"}
          </button>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-[1fr_320px] gap-3 p-3 md:p-4">
        {/* MAIN */}
        <div className="space-y-3" data-testid="exec-main">
          <HealthRow health={snap.health} />

          <StatRow stats={snap.stats} previewUrl={snap.preview_url} />

          {/* Log stream */}
          <div className="rounded-2xl bg-surface overflow-hidden" data-testid="exec-log-card">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-hairline">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-brand" />
                <div className="text-[12px] font-semibold uppercase tracking-wider text-ink">
                  Live log stream
                </div>
              </div>
              <Pill tone="default" size="sm">{snap.logs.length} lines</Pill>
            </div>
            <div
              ref={logBoxRef}
              onScroll={onLogScroll}
              className="bg-bg/40 font-mono text-[11px] leading-relaxed p-3 max-h-[44vh] md:max-h-[52vh] overflow-y-auto"
              data-testid="exec-log-stream"
            >
              {snap.logs.length === 0 ? (
                <div className="text-ink-mute text-center py-10">
                  No activity yet. Run a build from the console to start the runtime.
                </div>
              ) : (
                snap.logs.map((l, i) => {
                  const Icon = TIER_ICON[l.tier] || Activity;
                  return (
                    <div key={i} className="flex items-start gap-2 py-0.5" data-testid={`exec-log-line-${i}`}>
                      <span className="text-ink-mute shrink-0">{(l.ts || "").slice(11, 19)}</span>
                      <Icon className="w-3 h-3 text-ink-mute shrink-0 mt-[3px]" />
                      <span className="text-ink-mute shrink-0 w-14">[{l.tier}]</span>
                      <span className={`${LEVEL_COLOR[l.level] || "text-ink"} flex-1 break-all`}>{l.msg}</span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* SIDE */}
        <div className="space-y-3" data-testid="exec-side">
          {/* Feedback form */}
          <div className="rounded-2xl bg-surface p-4" data-testid="exec-feedback-card">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-mute mb-2.5">
              Send feedback to the AI team
            </div>

            <div className="flex items-center gap-1.5 mb-2.5">
              {[
                { v: "comment", label: "Comment", Icon: MessageSquare },
                { v: "bug",     label: "Bug",     Icon: BugIcon },
                { v: "feature", label: "Idea",    Icon: Sparkles },
              ].map(({ v, label, Icon }) => (
                <button
                  key={v}
                  type="button"
                  data-testid={`exec-kind-${v}`}
                  onClick={() => setFeedback((f) => ({ ...f, kind: v }))}
                  className={`flex-1 h-8 rounded-lg text-[12px] font-medium flex items-center justify-center gap-1 transition-colors ${
                    feedback.kind === v
                      ? v === "bug"
                        ? "bg-red-500/15 text-red-300 ring-1 ring-red-500/30"
                        : v === "feature"
                          ? "bg-brand/15 text-brand ring-1 ring-brand/30"
                          : "bg-white/10 text-ink"
                      : "bg-surface-2 text-ink-mute hover:bg-white/5"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" /> {label}
                </button>
              ))}
            </div>

            <input
              type="text"
              placeholder="Screen / route (optional)"
              value={feedback.screen}
              onChange={(e) => setFeedback((f) => ({ ...f, screen: e.target.value }))}
              data-testid="exec-feedback-screen"
              className="w-full px-2.5 py-2 rounded-lg bg-bg border border-hairline text-[12px] mb-2 focus:outline-none focus:ring-1 focus:ring-brand/40"
            />
            <textarea
              rows={4}
              value={feedback.message}
              onChange={(e) => setFeedback((f) => ({ ...f, message: e.target.value }))}
              placeholder={
                feedback.kind === "bug"
                  ? "What broke? Steps to reproduce…"
                  : feedback.kind === "feature"
                    ? "What should we build next?"
                    : "Anything to share with the agents…"
              }
              data-testid="exec-feedback-message"
              className="w-full px-2.5 py-2 rounded-lg bg-bg border border-hairline text-[12px] resize-none focus:outline-none focus:ring-1 focus:ring-brand/40"
            />
            <button
              type="button"
              onClick={submitFeedback}
              disabled={busy || !feedback.message.trim()}
              data-testid="exec-feedback-submit"
              className="mt-2 w-full h-9 rounded-xl bg-brand text-black text-[13px] font-semibold flex items-center justify-center gap-1.5 hover:bg-brand-deep disabled:opacity-60"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {feedback.kind === "bug" ? "Log bug" : "Send"}
            </button>
            {feedback.kind === "bug" && (
              <div className="text-[10px] text-ink-mute mt-2 leading-snug flex items-start gap-1.5">
                <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0 text-amber-300" />
                Creates a Bug report on the project for the QA agent to reproduce.
              </div>
            )}
          </div>

          {/* Recent feedback */}
          <div className="rounded-2xl bg-surface p-4" data-testid="exec-recent-feedback">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-mute mb-2.5">
              Recent feedback
            </div>
            {snap.feedback.length === 0 ? (
              <div className="text-[12px] text-ink-mute">No feedback yet.</div>
            ) : (
              <div className="space-y-2">
                {snap.feedback.slice(0, 8).map((f) => (
                  <div key={f.id} className="text-[12px] border-l-2 border-hairline pl-2.5 py-0.5" data-testid={`exec-fb-${f.id}`}>
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <Pill
                        tone={f.kind === "bug" ? "red" : f.kind === "feature" ? "brand" : "default"}
                        size="sm"
                      >
                        {f.kind}
                      </Pill>
                      {f.screen && <span className="text-[10px] text-ink-mute font-mono">{f.screen}</span>}
                      <span className="ml-auto text-[10px] text-ink-mute">{(f.created_at || "").slice(11, 16)}</span>
                    </div>
                    <div className="text-ink-dim line-clamp-2">{f.message}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function HealthRow({ health }) {
  const tiles = useMemo(() => ([
    { key: "api",      label: "API",      Icon: Cpu,      h: health.api },
    { key: "db",       label: "Database", Icon: Database, h: health.db },
    { key: "frontend", label: "Frontend", Icon: Globe,    h: health.frontend },
    { key: "agents",   label: "Agents",   Icon: Bot,      h: { ...health.agents, p95_ms: null, uptime_pct: null } },
  ]), [health]);

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2" data-testid="exec-health-row">
      {tiles.map(({ key, label, Icon, h }) => (
        <div key={key} className="rounded-2xl bg-surface p-3" data-testid={`exec-health-${key}`}>
          <div className="flex items-center gap-2 mb-1.5">
            <Icon className="w-3.5 h-3.5 text-ink-mute" />
            <div className="text-[11px] font-semibold text-ink-mute uppercase tracking-wider">{label}</div>
            <div className="ml-auto">
              <Pill tone={STATUS_TONE[h.status] || "default"} size="sm">{h.status}</Pill>
            </div>
          </div>
          <div className="text-[18px] font-semibold text-ink">
            {key === "agents"
              ? `${h.active || 0} active`
              : h.uptime_pct
                ? `${h.uptime_pct}%`
                : "—"}
          </div>
          <div className="text-[10px] text-ink-mute mt-0.5 font-mono">
            {key === "agents"
              ? "AI engineers online"
              : h.p95_ms
                ? `p95 ${h.p95_ms}ms`
                : "no traffic"}
          </div>
        </div>
      ))}
    </div>
  );
}

function StatRow({ stats, previewUrl }) {
  return (
    <div className="rounded-2xl bg-surface p-4" data-testid="exec-stats">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Requests / min" value={stats.requests_per_min} />
        <Stat label="Error rate" value={`${stats.error_rate_pct}%`} tone={stats.error_rate_pct > 1 ? "red" : "default"} />
        <Stat label="Active users" value={stats.active_users} />
        <Stat label="Credits today" value={stats.credits_burned_today} />
      </div>
      {previewUrl && (
        <a
          href={previewUrl}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="exec-preview-link"
          className="mt-3 inline-flex items-center gap-1.5 text-[12px] text-brand hover:underline font-mono break-all"
        >
          {previewUrl} <ExternalLink className="w-3 h-3" />
        </a>
      )}
    </div>
  );
}

function Stat({ label, value, tone = "default" }) {
  const color = tone === "red" ? "text-red-300" : "text-ink";
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-ink-mute">{label}</div>
      <div className={`text-[20px] font-semibold ${color} tabular-nums`}>{value}</div>
    </div>
  );
}
