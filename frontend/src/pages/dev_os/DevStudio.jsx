import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import { api } from "@/lib/api";
import {
  ChevronLeft, Sparkles, Loader2, FileCode, Eye, ListTodo, Rocket,
  MessageSquare, Share2, RefreshCw, ExternalLink, Info, Github, Blocks, ArrowUp, Lock,
} from "lucide-react";
import BuildProgressCard from "@/components/chat/BuildProgressCard";
import FileExplorerPanel from "@/pages/dev_os/FileExplorerPanel";
import TasksPanel from "@/pages/dev_os/TasksPanel";
import ReleasePanel from "@/pages/dev_os/ReleasePanel";
import BuildersHub from "@/pages/dev_os/BuildersHub";
import BuildersMenu from "@/components/dev_os/BuildersMenu";
import HireDevTeamButton from "@/components/chat/HireDevTeamButton";
import safeStorage from "@/lib/safeStorage";

/**
 * DevStudio — the Build Room. Exactly 5 simple tabs:
 *   Chat · Preview · Tasks · Files · Release
 *
 * One AI entity (@devmanager) handles everything — planning, coding, QA
 * and release. Chat is the left pane on desktop and a tab on mobile.
 */
const TABS = [
  { key: "chat", label: "Chat", icon: MessageSquare, mobileOnly: true },
  { key: "preview", label: "Preview", icon: Eye },
  { key: "builders", label: "Builders", icon: Blocks },
  { key: "tasks", label: "Tasks", icon: ListTodo },
  { key: "files", label: "Files", icon: FileCode },
  { key: "release", label: "Release", icon: Rocket },
];

// One-command actions. `send: true` fires immediately; otherwise the text
// prefills the composer for the user to finish.
const QUICK_ACTIONS = [
  { key: "build-app", label: "🚀 Build App", send: true,
    text: "Build the complete app from the project brief — all pages, navigation, working forms, demo data and demo login." },
  { key: "fix-bug", label: "🐛 Fix Bug", send: false, text: "Fix this bug: " },
  { key: "run-qa", label: "🧪 Run QA", send: true,
    text: "Run a full QA pass on the app: check every page, button, form and flow. Fix any bugs you find and summarize exactly what you checked and changed." },
  { key: "improve-design", label: "🎨 Improve Design", send: true,
    text: "Improve the visual design — spacing, colors, typography and mobile layout. Keep all functionality exactly the same." },
  { key: "add-feature", label: "✨ Add Feature", send: false, text: "Add a feature: " },
];

export default function DevStudio() {
  const { projectId } = useParams();
  const [project, setProject] = useState(null);
  const [activeTab, setActiveTab] = useState("preview");
  const [history, setHistory] = useState([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const chatEndRef = useRef(null);
  const composerRef = useRef(null);
  const [chatW, setChatW] = useState(() => {
    const v = safeStorage.getNumber("ds-chatw", 40);
    return v >= 25 && v <= 65 ? v : 40;
  });
  const [splitDragging, setSplitDragging] = useState(false);
  const draggingRef = useRef(false);

  useEffect(() => {
    const move = (e) => {
      if (!draggingRef.current) return;
      const pct = Math.min(65, Math.max(25, (e.clientX / window.innerWidth) * 100));
      setChatW(pct);
    };
    const up = () => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      setSplitDragging(false);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      setChatW((w) => { safeStorage.set("ds-chatw", Math.round(w)); return w; });
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [history.length]);

  // Auto-grow the composer up to its max height.
  useEffect(() => {
    const el = composerRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 280)}px`;
  }, [text]);

  const previewBase = `/api/dev-projects/${projectId}/preview/index.html`;
  const previewSrc = `${previewBase}?r=${refreshKey}`;

  const loadProject = useCallback(async () => {
    try {
      const { data } = await api.get(`/dev-projects/${projectId}`);
      setProject(data);
    } catch { /* noop */ }
  }, [projectId]);

  useEffect(() => { loadProject(); }, [loadProject]);

  // ─── Demo-mode build meter ──────────────────────────────────────────
  const [demoQuota, setDemoQuota] = useState(null);
  const loadDemoQuota = useCallback(() => {
    api.get("/demo/quota")
      .then(({ data }) => setDemoQuota(data.is_demo ? data : null))
      .catch(() => {});
  }, []);
  useEffect(() => { loadDemoQuota(); }, [loadDemoQuota]);

  // ─── Preview presence heartbeat ────────────────────────────────────
  const [coViewers, setCoViewers] = useState([]);
  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    let consecutiveAuthFailures = 0;
    let interval = null;
    const beat = async () => {
      try {
        const { data } = await api.post(`/dev-projects/${projectId}/presence/heartbeat`);
        if (!cancelled) setCoViewers(data?.others || []);
        consecutiveAuthFailures = 0;
      } catch (err) {
        const status = err?.response?.status;
        if (status === 401 || status === 403) {
          consecutiveAuthFailures += 1;
          if (consecutiveAuthFailures >= 2 && interval) {
            clearInterval(interval);
            interval = null;
          }
        }
      }
    };
    beat();
    interval = setInterval(beat, 30_000);
    const leave = () => {
      try {
        fetch(
          `${process.env.REACT_APP_BACKEND_URL}/api/dev-projects/${projectId}/presence`,
          { method: "DELETE", credentials: "include", keepalive: true },
        );
      } catch { /* ignore */ }
    };
    window.addEventListener("beforeunload", leave);
    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
      window.removeEventListener("beforeunload", leave);
      api.delete(`/dev-projects/${projectId}/presence`).catch(() => {});
    };
  }, [projectId]);

  // ─── Talk-to-Build send (streamed via live activity card) ───────────
  const submit = async (instruction) => {
    const value = (instruction ?? text).trim();
    if (!value || busy) return;
    setBusy(true);
    setText("");
    const id = Date.now();
    setHistory((h) => [
      ...h,
      { id, kind: "user", text: value, at: new Date().toISOString() },
    ]);
    try {
      const { data } = await api.post(`/dev-projects/${projectId}/talk`, {
        instruction: value,
      });
      setHistory((h) => [...h, { id: id + 0.1, kind: "activity", activityId: data.activity_id }]);
    } catch (e) {
      setBusy(false);
      if (e?.response?.status === 402) {
        toast.error("Hire @devmanager to start building — use the Hire button in the toolbar.");
      } else if (e?.response?.status === 429) {
        toast.error("Demo build limit reached — the meter resets within the hour.");
        loadDemoQuota();
      } else {
        toast.error(e?.response?.data?.detail || "Request failed");
      }
    }
  };

  const onActivityDone = useCallback(async (activity) => {
    setBusy(false);
    loadDemoQuota();
    if (activity.status === "done") {
      setRefreshKey((k) => k + 1);
      if ((activity.files_changed || []).length > 0) {
        toast.success(`Updated ${activity.files_changed.length} file(s)`);
      }
      if (activity.smoke && !activity.smoke.passed) {
        toast.warning(`Smoke check failed: ${activity.smoke.failures?.[0] || "see Release tab"}`);
      }
      try {
        const { data } = await api.get(`/dev-projects/${projectId}/build-ideas`);
        if (data.ideas?.length) {
          setHistory((h) => [...h, { id: Date.now(), kind: "ideas", ideas: data.ideas }]);
        }
      } catch { /* noop */ }
    } else {
      toast.error(activity.summary || "Couldn't apply the change");
    }
  }, [projectId, loadDemoQuota]);

  const runQuickAction = (a) => {
    if (a.send) submit(a.text);
    else setText(a.text);
  };

  const onShare = () => {
    const url = `${window.location.origin}${previewBase}`;
    navigator.clipboard.writeText(url).then(
      () => toast.success("Preview URL copied to clipboard"),
      () => toast.error("Could not copy"),
    );
  };

  if (!project) {
    return (
      <div className="h-[100dvh] flex items-center justify-center text-ink-mute">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading project…
      </div>
    );
  }

  // ─── Chat pane (left column on desktop, "Chat" tab on mobile) ───────
  const hired = !!project.dev_team_hired;
  const chatPane = (
    <>
      <div className="px-4 py-3 border-b border-hairline flex items-center gap-2 shrink-0">
        <Sparkles className="w-4 h-4 text-amber-300" />
        <div className="text-[12px] font-semibold uppercase tracking-wider text-amber-200">@devmanager</div>
        <span className="text-[11px] text-ink-mute ml-1 normal-case font-normal tracking-normal truncate">
          One AI runs it all — plans, builds, tests & ships. Just describe what you want.
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-2" data-testid="ds-chat-log">
        {history.length === 0 && (
          <div className="text-[12px] text-ink-mute mb-2">
            Tell @devmanager what to build or change — in plain English. Use the
            quick actions below, or open <span className="text-amber-200">Builders</span> for
            guided forms (rules, roles, data, workflows, reports…).
          </div>
        )}
        {history.map((m) => {
          if (m.kind === "user") {
            return (
              <div key={m.id} className="flex justify-end">
                <div className="max-w-[88%] rounded-2xl rounded-br-md bg-brand-tint text-brand px-3 py-1.5 text-[13px]">
                  {m.text}
                </div>
              </div>
            );
          }
          if (m.kind === "activity") {
            return (
              <div key={m.id} className="flex">
                <BuildProgressCard activityId={m.activityId} onDone={onActivityDone} />
              </div>
            );
          }
          if (m.kind === "ideas") {
            return (
              <div key={m.id} className="rounded-xl bg-surface ring-1 ring-hairline p-3" data-testid="ds-ideas-card">
                <div className="text-[11px] text-amber-200 font-medium mb-2 inline-flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" /> Potential improvements — tap to queue
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {m.ideas.map((idea, i) => (
                    <button key={i} type="button" data-testid={`ds-idea-chip-${i}`}
                      onClick={() => setText(idea.prompt.replace(/^@dev\w+\s*/i, ""))}
                      className="h-7 px-2.5 rounded-full text-[11px] bg-surface-2 ring-1 ring-hairline text-ink-dim hover:text-amber-200 hover:ring-amber-400/30">
                      {idea.label}
                    </button>
                  ))}
                </div>
              </div>
            );
          }
          return (
            <div key={m.id} className="flex">
              <div className={`max-w-[88%] rounded-2xl rounded-bl-md px-3 py-2 text-[13px] ${m.ok ? "bg-surface-2 text-ink" : "bg-rose-500/10 text-rose-200 ring-1 ring-rose-500/30"}`}>
                <div>{m.text}</div>
                {m.files?.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {m.files.map((p) => (
                      <span key={p} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 text-[10px] font-mono">
                        <FileCode className="w-3 h-3" /> {p}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        <div ref={chatEndRef} />
      </div>

      {/* Quick actions + Builders */}
      <div className="px-3 pt-2 flex flex-wrap items-center gap-1.5 shrink-0">
        {QUICK_ACTIONS.map((a) => (
          <button
            key={a.key}
            type="button"
            onClick={() => runQuickAction(a)}
            disabled={busy}
            data-testid={`ds-quick-${a.key}`}
            className="text-[11px] px-2.5 py-1 rounded-full bg-surface-2 hover:bg-surface-3 text-ink-dim hover:text-ink ring-1 ring-hairline disabled:opacity-40"
          >
            {a.label}
          </button>
        ))}
        <BuildersMenu onSubmit={(instruction) => submit(instruction)} disabled={busy} />
      </div>

      {!hired && project.related_chat_id && (
        <div className="mx-3 mt-2 rounded-xl border border-amber-400/30 bg-amber-400/[0.06] p-2.5 flex items-center gap-2 shrink-0" data-testid="ds-hire-banner">
          <Lock className="w-3.5 h-3.5 text-amber-300 shrink-0" />
          <span className="text-[11px] text-ink-dim flex-1 min-w-0">
            Hire @devmanager once to start building.
          </span>
          <HireDevTeamButton chatId={project.related_chat_id} variant="pill" />
        </div>
      )}

      <form
        onSubmit={(e) => { e.preventDefault(); submit(); }}
        className="px-3 py-3 border-t-0 flex items-end gap-2 shrink-0"
      >
        <textarea
          ref={composerRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submit(); }
          }}
          disabled={busy}
          rows={3}
          placeholder="Describe what to build or change — Enter for a new line, ↑ to send"
          data-testid="ds-input"
          className="flex-1 px-4 py-3 rounded-2xl bg-surface-2 ring-1 ring-hairline focus:ring-amber-400/40 outline-none text-[13px] text-ink placeholder:text-ink-mute resize-none leading-relaxed max-h-[280px]"
        />
        <button
          type="submit"
          disabled={busy || !text.trim()}
          data-testid="ds-send"
          title="Send to @devmanager (Ctrl+Enter)"
          className="h-11 w-11 shrink-0 rounded-full bg-amber-300 hover:bg-amber-200 text-black inline-flex items-center justify-center active:scale-[0.95] disabled:opacity-40"
        >
          {busy ? <Loader2 className="w-4.5 h-4.5 animate-spin" /> : <ArrowUp className="w-5 h-5" strokeWidth={2.5} />}
        </button>
      </form>
    </>
  );

  return (
    <div className="flex flex-col h-[100dvh] bg-bg" data-testid="dev-studio">
      {/* ── Top toolbar ───────────────────────────────────────────── */}
      <div className="px-4 md:px-6 h-14 shrink-0 flex items-center gap-3 border-b border-hairline bg-surface">
        <Link to="/dev-os" className="text-ink-mute hover:text-ink p-1.5 rounded-md hover:bg-surface-2" title="Back to Dev OS">
          <ChevronLeft className="w-4 h-4" />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-semibold text-ink truncate">{project.name}</div>
          <div className="text-[11px] text-ink-mute truncate">{project.status} · v{project.version || "0.1.0"}</div>
        </div>
        {coViewers.length > 0 && <CoViewersChip viewers={coViewers} />}
        {demoQuota && (
          <span
            data-testid="ds-demo-meter"
            title={`Demo mode — ${demoQuota.remaining} of ${demoQuota.limit} AI builds left this hour`}
            className={`hidden sm:inline-flex items-center gap-1.5 h-9 px-3 rounded-pill text-[12px] font-medium ring-1 ${
              demoQuota.remaining === 0
                ? "bg-rose-500/10 text-rose-300 ring-rose-500/30"
                : "bg-amber-400/10 text-amber-200 ring-amber-400/30"
            }`}
          >
            ⚡ Demo · {demoQuota.remaining}/{demoQuota.limit} builds left
          </span>
        )}
        <button
          type="button"
          onClick={onShare}
          data-testid="ds-share"
          className="inline-flex items-center gap-1.5 h-9 px-3 rounded-pill bg-surface-2 hover:bg-surface-3 text-ink text-[13px]"
        >
          <Share2 className="w-3.5 h-3.5" /> Share
        </button>
        {!hired && project.related_chat_id && (
          <HireDevTeamButton chatId={project.related_chat_id} variant="toolbar" />
        )}
        <button
          type="button"
          onClick={() => setActiveTab("release")}
          data-testid="ds-publish"
          className="inline-flex items-center gap-1.5 h-9 px-4 rounded-pill bg-amber-300 hover:bg-amber-200 text-black font-semibold text-[13px]"
        >
          <Rocket className="w-3.5 h-3.5" /> Release
        </button>
      </div>

      {/* ── Main area ──────────────────────────────────────────────── */}
      <div className="flex-1 flex min-h-0">
        {/* LEFT — Chat (desktop only; mobile uses the Chat tab) */}
        <div
          className="hidden md:flex min-w-[320px] border-r border-hairline flex-col bg-surface shrink-0"
          style={{ width: `${chatW}%` }}
        >
          {chatPane}
        </div>

        {/* Drag handle — resize chat ↔ preview split */}
        <div
          data-testid="ds-split-handle"
          onMouseDown={(e) => {
            e.preventDefault();
            draggingRef.current = true;
            setSplitDragging(true);
            document.body.style.cursor = "col-resize";
            document.body.style.userSelect = "none";
          }}
          onDoubleClick={() => { setChatW(40); safeStorage.set("ds-chatw", 40); }}
          title="Drag to resize · double-click to reset"
          className="hidden md:block w-1.5 -ml-1 cursor-col-resize shrink-0 relative z-10 group"
        >
          <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-[3px] rounded-full bg-transparent group-hover:bg-amber-400/40 transition-colors" />
        </div>

        {/* RIGHT — 5 simple tabs */}
        <div className="flex-1 flex flex-col min-w-0" style={splitDragging ? { pointerEvents: "none" } : undefined}>
          <div className="px-3 h-11 shrink-0 flex items-center gap-1 border-b border-hairline bg-surface">
            {TABS.map((t) => {
              const isActive = activeTab === t.key;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setActiveTab(t.key)}
                  data-testid={`ds-tab-${t.key}`}
                  className={`h-8 px-3 rounded-pill text-[12px] font-medium inline-flex items-center gap-1.5 ${
                    t.mobileOnly ? "md:hidden " : ""
                  }${isActive ? "bg-brand-tint text-brand" : "text-ink-dim hover:text-ink hover:bg-surface-2"}`}
                >
                  <t.icon className="w-3.5 h-3.5" />
                  {t.label}
                  {t.key === "builders" && !hired && (
                    <Lock className="w-3 h-3 text-amber-300" data-testid="ds-builders-lock" />
                  )}
                </button>
              );
            })}
            <div className="flex-1" />
            <button
              type="button"
              onClick={() => setRefreshKey((k) => k + 1)}
              data-testid="ds-refresh"
              className="h-8 w-8 rounded-pill text-ink-mute hover:text-ink hover:bg-surface-2 flex items-center justify-center"
              title="Refresh"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Tab content */}
          <div className="flex-1 min-h-0 bg-bg">
            {activeTab === "chat" && (
              <div className="h-full flex flex-col md:hidden bg-surface">{chatPane}</div>
            )}

            {activeTab === "builders" && (
              <BuildersHub
                projectId={projectId}
                busy={busy}
                locked={!hired}
                relatedChatId={project.related_chat_id}
                onBuild={(instruction) => {
                  submit(instruction);
                  if (window.matchMedia("(max-width: 767px)").matches) setActiveTab("chat");
                }}
              />
            )}

            {activeTab === "preview" && (
              <div className="h-full flex flex-col">
                <MockupNotice projectId={projectId} relatedChatId={project.related_chat_id} hired={hired} />
                <div className="px-4 py-2 border-b border-hairline flex items-center justify-between bg-surface text-[11px] text-ink-mute">
                  <span className="font-mono">{previewBase}</span>
                  <a
                    href={`${window.location.origin}${previewSrc}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-brand hover:underline"
                  >
                    Open in new tab <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
                <iframe
                  key={refreshKey}
                  src={previewSrc}
                  data-testid="ds-preview-iframe"
                  title="App preview"
                  className="flex-1 w-full bg-white"
                />
              </div>
            )}

            {activeTab === "tasks" && <TasksPanel projectId={projectId} />}

            {activeTab === "files" && (
              <div className="h-full overflow-y-auto p-4">
                <FileExplorerPanel
                  projectId={projectId}
                  previewUrl={previewBase}
                  refreshKey={refreshKey}
                />
              </div>
            )}

            {activeTab === "release" && (
              <ReleasePanel project={project} refreshKey={refreshKey} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}


/**
 * MockupNotice — banner above the Preview iframe with demo credentials and
 * the upgrade path. Collapsible; collapse state persists per project.
 */
function MockupNotice({ projectId, relatedChatId, hired }) {
  const storageKey = `devstudio:mockup-notice-collapsed:${projectId}`;
  const [collapsed, setCollapsed] = useState(
    () => safeStorage.get(storageKey) === "1",
  );

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    safeStorage.set(storageKey, next ? "1" : "0");
  };

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={toggle}
        data-testid="ds-mockup-notice-collapsed"
        className="w-full px-4 py-1.5 flex items-center gap-2 text-[11px] text-amber-200/90 bg-amber-400/[0.06] border-b border-amber-400/20 hover:bg-amber-400/[0.1] text-left"
        title="Show preview details"
      >
        <Info className="w-3 h-3 shrink-0" />
        <span className="font-medium">Working preview</span>
        <span className="text-ink-mute">·</span>
        <span className="text-ink-dim truncate">
          Sign in with <code className="text-amber-300">demo@example.com</code> / <code className="text-amber-300">demo</code> · data stays in your browser
        </span>
      </button>
    );
  }

  return (
    <div
      data-testid="ds-mockup-notice"
      className="px-4 py-3 bg-amber-400/[0.08] border-b border-amber-400/25"
    >
      <div className="flex items-start gap-3">
        <div className="shrink-0 w-8 h-8 rounded-lg bg-amber-400/15 ring-1 ring-amber-400/30 text-amber-300 flex items-center justify-center mt-0.5">
          <Info className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-semibold text-amber-100">
            Working preview · sign in with the demo credentials
          </div>
          <div className="text-[12px] text-ink-dim leading-snug mt-1">
            Use <code className="text-amber-300 font-mono">demo@example.com</code> /{" "}
            <code className="text-amber-300 font-mono">demo</code> to sign in.
            The preview is a fully working SPA — login, dashboard and CRUD all
            run end-to-end against an in-browser fake backend (
            <code className="font-mono">localStorage</code>). Your real
            production-ready FastAPI server with auth, DB and SQL schema is
            already generated at <code className="font-mono">backend/server.py</code>{" "}
            and exports as-is to GitHub. Want @devmanager to wire it up and
            deploy for you?
          </div>
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            {hired ? null : relatedChatId ? (
              <HireDevTeamButton chatId={relatedChatId} variant="pill" />
            ) : (
              <span className="text-[11px] text-ink-mute italic">
                Open the linked chat to hire the dev team.
              </span>
            )}
            <a
              href="/dev-os-guide"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[11px] text-ink-dim hover:text-ink underline-offset-2 hover:underline"
              data-testid="ds-mockup-notice-learn-more"
            >
              <Github className="w-3 h-3" />
              How GitHub export works
            </a>
          </div>
        </div>
        <button
          type="button"
          onClick={toggle}
          data-testid="ds-mockup-notice-collapse"
          className="shrink-0 text-[10px] text-ink-mute hover:text-ink uppercase tracking-wider px-2 py-1 rounded-md hover:bg-white/5"
          title="Collapse"
        >
          Hide
        </button>
      </div>
    </div>
  );
}


/** CoViewersChip — teammates currently viewing this project's preview. */
function CoViewersChip({ viewers }) {
  if (!viewers || viewers.length === 0) return null;
  const names = viewers.map((v) => v.user_name || "Teammate");
  const initials = (n) => n.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  const visible = viewers.slice(0, 3);
  const extra = viewers.length - visible.length;
  const label =
    viewers.length === 1
      ? `${names[0]} is viewing the live preview`
      : `${viewers.length} teammates are viewing the live preview`;
  return (
    <div
      data-testid="ds-co-viewers"
      title={label}
      className="hidden sm:inline-flex items-center gap-2 h-9 px-2.5 rounded-pill bg-emerald-500/10 ring-1 ring-emerald-500/30 text-emerald-200 text-[12px]"
    >
      <span className="relative flex -space-x-1.5">
        {visible.map((v) => (
          <span
            key={v.user_id}
            className="w-5 h-5 rounded-full bg-emerald-400/30 ring-2 ring-surface text-[10px] font-semibold text-emerald-100 flex items-center justify-center"
            title={v.user_name}
          >
            {initials(v.user_name || "T")}
          </span>
        ))}
        {extra > 0 && (
          <span className="w-5 h-5 rounded-full bg-surface-2 ring-2 ring-surface text-[10px] font-semibold text-ink-mute flex items-center justify-center">
            +{extra}
          </span>
        )}
      </span>
      <span className="hidden md:inline">
        <span className="font-medium">{names[0]}</span>
        {viewers.length === 1 ? " is viewing" : ` + ${viewers.length - 1} viewing`}
      </span>
    </div>
  );
}
