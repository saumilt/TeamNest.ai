import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import {
  MessageSquare,
  Sparkles,
  ListTodo,
  FolderKanban,
  Bot,
  Plus,
  ArrowRight,
  Clock,
  UserPlus,
  X,
  Sunrise,
} from "lucide-react";

import { toast } from "sonner";

function StatCard({ icon: I, label, value, accent }) {
  return (
    <div className="bg-[#121214] border border-white/5 p-5 hover:border-white/10 transition-colors">
      <div className="flex items-center justify-between mb-4">
        <I className={`w-5 h-5 ${accent || "text-zinc-400"}`} />
        <span className="label-mono">{label}</span>
      </div>
      <div className="font-display text-4xl font-bold tracking-tighter">{value}</div>
    </div>
  );
}

function relativeTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

export default function Dashboard() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [memberCount, setMemberCount] = useState(null);
  const [standup, setStandup] = useState(null);
  const [standupBusy, setStandupBusy] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(() => {
    try { return localStorage.getItem("dash:invite-banner-dismissed") === "1"; } catch { return false; }
  });
  const nav = useNavigate();

  useEffect(() => {
    api.get("/dashboard").then(({ data }) => setData(data));
    api.get("/workspace/members").then(({ data }) => setMemberCount(data.length)).catch(() => {});
  }, []);

  const generateStandup = async () => {
    setStandupBusy(true);
    try {
      const { data: result } = await api.post("/standup/generate", {});
      setStandup(result);
      toast.success("Daily standup ready");
      window.dispatchEvent(new CustomEvent("teamnest:credits-changed"));
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not generate standup");
    } finally { setStandupBusy(false); }
  };

  const dismissBanner = () => {
    setBannerDismissed(true);
    try { localStorage.setItem("dash:invite-banner-dismissed", "1"); } catch (err) { console.warn(err); }
  };

  const showInviteBanner = !bannerDismissed && memberCount !== null && memberCount <= 2;

  if (!data) {
    return <div className="p-10 label-mono">Loading dashboard…</div>;
  }

  return (
    <div className="p-6 lg:p-10 max-w-[1600px]" data-testid="dashboard">
      <div className="flex items-end justify-between mb-10">
        <div>
          <div className="label-mono mb-3">WORKSPACE / OVERVIEW</div>
          <h1 className="font-display text-4xl lg:text-5xl font-bold tracking-tighter">
            Welcome back, {user?.name?.split(" ")[0]}.
          </h1>
        </div>
        <div className="hidden lg:flex gap-3">
          <Button
            data-testid="dash-new-chat"
            onClick={() => nav("/chats?new=group")}
            className="bg-white text-black hover:bg-zinc-200 rounded-sm font-mono uppercase tracking-widest text-xs h-10"
          >
            <Plus className="w-4 h-4 mr-2" /> New Group
          </Button>
          <Button
            data-testid="dash-new-folder"
            onClick={() => nav("/projects?new=1")}
            variant="outline"
            className="border-white/10 bg-transparent hover:bg-white/5 rounded-sm font-mono uppercase tracking-widest text-xs h-10"
          >
            <Plus className="w-4 h-4 mr-2" /> New Folder
          </Button>
          <Button
            data-testid="dash-standup-btn"
            onClick={generateStandup}
            disabled={standupBusy}
            variant="outline"
            className="border-yellow-400/40 bg-transparent text-yellow-300 hover:bg-yellow-400/10 hover:text-yellow-200 rounded-sm font-mono uppercase tracking-widest text-xs h-10"
          >
            <Sunrise className="w-4 h-4 mr-2" /> {standupBusy ? "Generating…" : "Daily Standup"}
          </Button>
        </div>
      </div>

      {/* Standup result */}
      {standup && (
        <div
          data-testid="dash-standup-result"
          className="relative border border-yellow-500/30 bg-[#0f0f10] rounded-sm p-6 mb-8"
        >
          <button
            data-testid="dash-standup-close"
            onClick={() => setStandup(null)}
            aria-label="Close standup"
            className="absolute top-3 right-3 text-zinc-500 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
          <div className="prose prose-invert prose-sm max-w-none whitespace-pre-wrap">
            {standup.markdown}
          </div>
          <div className="flex items-center gap-4 mt-4 pt-4 border-t border-white/5 text-[10px] font-mono uppercase tracking-widest text-zinc-500">
            <span>Open: <span className="text-zinc-200">{standup.stats?.open ?? 0}</span></span>
            <span>Closed yesterday: <span className="text-emerald-300">{standup.stats?.completed_yesterday ?? 0}</span></span>
            <span>Overdue: <span className="text-red-400">{standup.stats?.overdue ?? 0}</span></span>
            <span>Due today: <span className="text-yellow-300">{standup.stats?.due_today ?? 0}</span></span>
          </div>
        </div>
      )}

      {/* Invite banner */}
      {showInviteBanner && (
        <div
          data-testid="dash-invite-banner"
          className="relative border border-yellow-500/30 bg-gradient-to-r from-yellow-500/[0.08] to-yellow-500/[0.02] rounded-sm p-5 mb-8 flex items-center gap-4"
        >
          <div className="w-11 h-11 bg-yellow-500/20 border border-yellow-500/40 rounded-sm flex items-center justify-center shrink-0">
            <UserPlus className="w-5 h-5 text-yellow-400" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-display text-lg font-bold tracking-tight">
              TeamNest is more fun with friends.
            </div>
            <p className="text-xs text-zinc-400 mt-0.5">
              Your workspace has {memberCount} member{memberCount === 1 ? "" : "s"} so far. Invite your team in seconds — magic link, email, WhatsApp, or QR code.
            </p>
          </div>
          <Button
            data-testid="dash-banner-invite"
            onClick={() => nav("/find-friends")}
            className="bg-yellow-500 text-black hover:bg-yellow-400 rounded-sm font-mono uppercase text-[10px] tracking-widest h-9 px-3 shrink-0"
          >
            <UserPlus className="w-3.5 h-3.5 mr-1.5" /> Find Friends
          </Button>
          <button
            onClick={dismissBanner}
            title="Dismiss"
            data-testid="dash-banner-dismiss"
            className="text-zinc-500 hover:text-white shrink-0 p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-10">
        <StatCard icon={MessageSquare} label="ACTIVE CHATS" value={data.recent_chats.length} />
        <StatCard icon={Sparkles} label="AI THREADS" value={data.recent_threads.length} accent="text-yellow-400" />
        <StatCard icon={ListTodo} label="OPEN TASKS" value={data.open_tasks.length} />
        <StatCard icon={Clock} label="DUE TODAY" value={data.due_today.length} accent="text-red-400" />
        <StatCard icon={FolderKanban} label="PROJECT FOLDERS" value={data.folders.length} accent="text-blue-400" />
      </div>

      <div className="grid lg:grid-cols-3 gap-px bg-white/5 border border-white/5">
        {/* Recent chats */}
        <div className="bg-[#0a0a0a] p-6">
          <div className="flex items-center justify-between mb-5">
            <h3 className="font-display text-xl font-bold tracking-tight">Recent chats</h3>
            <Link to="/chats" className="text-[10px] font-mono tracking-widest text-zinc-500 hover:text-white">
              VIEW ALL <ArrowRight className="inline w-3 h-3" />
            </Link>
          </div>
          <div className="space-y-px">
            {data.recent_chats.slice(0, 6).map((c) => (
              <Link
                key={c.id}
                to={`/chats/${c.id}`}
                data-testid={`recent-chat-${c.id}`}
                className="block p-3 hover:bg-white/[0.03] border-b border-white/5 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] font-mono uppercase tracking-widest text-zinc-600">
                        {c.type === "group" ? "GRP" : c.type === "personal_ai" ? "AI" : "DM"}
                      </span>
                      <span className="font-medium truncate text-sm">{c.name || "Direct Message"}</span>
                    </div>
                    <div className="text-xs text-zinc-500 truncate mt-1">
                      {c.last_message?.body?.slice(0, 80) || c.description || "—"}
                    </div>
                  </div>
                  <span className="text-[10px] font-mono text-zinc-600">
                    {relativeTime(c.last_message?.created_at || c.created_at)}
                  </span>
                </div>
              </Link>
            ))}
            {data.recent_chats.length === 0 && (
              <div className="text-sm text-zinc-500">No chats yet.</div>
            )}
          </div>
        </div>

        {/* AI Research */}
        <div className="bg-[#0a0a0a] p-6">
          <div className="flex items-center justify-between mb-5">
            <h3 className="font-display text-xl font-bold tracking-tight">AI research</h3>
            <Link to="/research" className="text-[10px] font-mono tracking-widest text-zinc-500 hover:text-white">
              VIEW ALL <ArrowRight className="inline w-3 h-3" />
            </Link>
          </div>
          <div className="space-y-px">
            {data.recent_threads.slice(0, 5).map((t) => (
              <div
                key={t.id}
                className="p-3 border-b border-white/5 hover:bg-white/[0.03] cursor-pointer"
                onClick={() => nav(`/chats/${t.chat_id}?thread=${t.id}`)}
                data-testid={`recent-thread-${t.id}`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Sparkles className="w-3 h-3 text-yellow-400" />
                  <span className="text-[9px] font-mono uppercase tracking-widest text-zinc-600">
                    {t.selected_models.length} MODELS
                  </span>
                </div>
                <div className="text-sm line-clamp-2 text-zinc-200">{t.question}</div>
              </div>
            ))}
            {data.recent_threads.length === 0 && (
              <div className="text-sm text-zinc-500">No AI threads yet. Ask AI in any chat.</div>
            )}
          </div>
        </div>

        {/* Tasks + Folders */}
        <div className="bg-[#0a0a0a] p-6">
          <div className="flex items-center justify-between mb-5">
            <h3 className="font-display text-xl font-bold tracking-tight">My tasks</h3>
            <Link to="/tasks" className="text-[10px] font-mono tracking-widest text-zinc-500 hover:text-white">
              VIEW ALL <ArrowRight className="inline w-3 h-3" />
            </Link>
          </div>
          <div className="space-y-px mb-6">
            {data.open_tasks.slice(0, 4).map((t) => (
              <div
                key={t.id}
                className="p-3 border-b border-white/5"
                data-testid={`open-task-${t.id}`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-[9px] font-mono uppercase tracking-widest ${
                    t.priority === "urgent" ? "text-red-400" :
                    t.priority === "high" ? "text-yellow-400" :
                    "text-zinc-500"
                  }`}>{t.priority}</span>
                  <span className="text-[10px] font-mono text-zinc-600">
                    {t.due_date ? new Date(t.due_date).toLocaleDateString() : "no date"}
                  </span>
                </div>
                <div className="text-sm">{t.title}</div>
              </div>
            ))}
            {data.open_tasks.length === 0 && (
              <div className="text-sm text-zinc-500">No tasks yet.</div>
            )}
          </div>

          <div className="label-mono mb-3">PROJECT FOLDERS</div>
          <div className="grid grid-cols-1 gap-px">
            {data.folders.slice(0, 4).map((f) => (
              <Link
                key={f.id}
                to={`/projects/${f.id}`}
                data-testid={`folder-${f.id}`}
                className="p-2.5 border-b border-white/5 hover:bg-white/[0.03] flex items-center gap-2"
              >
                <FolderKanban className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                <span className="text-sm truncate">{f.name}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
