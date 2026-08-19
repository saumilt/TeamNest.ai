import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import {
  Sparkles,
  MessageSquare,
  Video,
  FolderKanban,
  CheckSquare,
  FileUp,
  Brain,
  Bot,
  Library,
  ArrowRight,
  Layers,
} from "lucide-react";
import HomeLookSwitcher from "@/components/HomeLookSwitcher";
import IntelligenceBanner from "@/components/IntelligenceBanner";
import SetupChecklist from "@/components/SetupChecklist";
import { personaConfig } from "@/lib/persona";

const CARDS = [
  { key: "chat", title: "Start or Join a Chat", desc: "Message your team or an AI assistant.", icon: MessageSquare, to: "/chats?new=chat" },
  { key: "meeting", title: "Host a Meeting", desc: "Meet, transcribe, summarize, and turn action items into tasks — automatically.", icon: Video, to: "/calls" },
  { key: "project", title: "Create a Project", desc: "Organize chats, tasks, and research in one place.", icon: FolderKanban, to: "/projects?new=1" },
  { key: "task", title: "Create a Task", desc: "Capture an action item and assign it.", icon: CheckSquare, to: "/tasks?new=1" },
  { key: "docs", title: "Upload & Ask Documents", desc: "Upload a PDF, Word, spreadsheet, ZIP or notes and ask with citations.", icon: FileUp, to: "/knowledge" },
  { key: "memory", title: "Ask My Memory", desc: "Ask what TeamNest remembers about your work.", icon: Brain, to: "/ai-memory" },
  { key: "employee", title: "Hire / Build an AI Employee", desc: "Add an AI teammate that works in your chats.", icon: Bot, to: "/employees" },
  { key: "knowledge", title: "Explore Team Knowledge", desc: "Browse and query your team's shared knowledge.", icon: Library, to: "/knowledge" },
];

function ActionCard({ card, onClick }) {
  const I = card.icon;
  return (
    <button
      type="button"
      data-testid={`start-card-${card.key}`}
      onClick={onClick}
      className="group text-left rounded-2xl border border-white/10 bg-[#121214] p-5 hover:border-white/20 hover:bg-white/[0.04] transition-all active:scale-[0.99]"
    >
      <div className="w-11 h-11 rounded-xl bg-white/5 text-zinc-200 group-hover:text-white flex items-center justify-center mb-4">
        <I className="w-5 h-5" strokeWidth={1.8} />
      </div>
      <div className="font-display text-lg font-bold tracking-tight mb-1 flex items-center gap-1.5">
        {card.title}
        <ArrowRight className="w-4 h-4 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all text-yellow-400" />
      </div>
      <p className="text-[13px] text-zinc-500 leading-relaxed">{card.desc}</p>
    </button>
  );
}

function ContinueColumn({ label, to, empty, children }) {
  return (
    <div className="bg-[#0a0a0a] p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-display text-base font-bold tracking-tight">{label}</h3>
        {to && (
          <Link to={to} className="text-[10px] font-mono tracking-widest text-zinc-500 hover:text-white">
            VIEW ALL <ArrowRight className="inline w-3 h-3" />
          </Link>
        )}
      </div>
      <div className="space-y-px">{children || <div className="text-sm text-zinc-600">{empty}</div>}</div>
    </div>
  );
}

/** "Start Center" Home — organizes the whole product around
 *  "What do you want to work on?" rather than a chat list. */
export default function StartCenterHome({ variant, onChangeLook }) {
  const { user } = useAuth();
  const nav = useNavigate();
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get("/dashboard").then(({ data }) => setData(data)).catch(() => {});
  }, []);

  const cfg = personaConfig(user?.persona);
  const cards = cfg
    ? [...CARDS].sort((a, b) => {
        const ia = cfg.cardOrder.indexOf(a.key);
        const ib = cfg.cardOrder.indexOf(b.key);
        return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
      })
    : CARDS;

  return (
    <div className="p-6 lg:p-10 max-w-[1600px]" data-testid="home-start-center">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-8">
        <div>
          <div className="label-mono mb-3">WORKSPACE / HOME</div>
          <h1 className="font-display text-4xl lg:text-5xl font-bold tracking-tighter">
            What do you want to work on{user?.name ? `, ${user.name.split(" ")[0]}` : ""}?
          </h1>
          <p className="text-zinc-500 mt-3 max-w-xl">
            Start with AI, people, a meeting, a document, or a task.
          </p>
        </div>
        <HomeLookSwitcher current={variant} onChange={onChangeLook} />
      </div>

      <IntelligenceBanner />
      <SetupChecklist />

      {/* Featured — AI Research */}
      <div className="label-mono mb-3">START SOMETHING</div>
      <button
        type="button"
        data-testid="start-card-research"
        onClick={() => nav("/research")}
        className="group w-full text-left rounded-2xl border border-yellow-400/30 bg-gradient-to-br from-yellow-400/[0.10] to-yellow-400/[0.02] p-6 mb-3 hover:border-yellow-400/50 transition-all active:scale-[0.995]"
      >
        <div className="flex items-start gap-5">
          <div className="w-14 h-14 rounded-2xl bg-yellow-400 text-black flex items-center justify-center shrink-0">
            <Sparkles className="w-7 h-7" strokeWidth={1.8} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-display text-2xl font-bold tracking-tight mb-1 flex items-center gap-2">
              Start AI Research
              <span className="text-[9px] font-mono uppercase tracking-widest bg-yellow-400/20 text-yellow-300 px-1.5 py-0.5 rounded-sm">
                Popular
              </span>
            </div>
            <p className="text-sm text-zinc-300 max-w-2xl">
              Ask one AI or compare multiple models side-by-side, synthesize the best answer, and save
              everything to your project — continue later anytime.
            </p>
            <div className="flex flex-wrap gap-2 mt-4">
              <span data-testid="research-ask-one" onClick={(e) => { e.stopPropagation(); nav("/my-ai"); }} className="text-xs font-semibold rounded-lg border border-white/15 bg-black/20 px-3 py-1.5 hover:bg-white/10 transition-colors">
                Ask One AI
              </span>
              <span data-testid="research-compare" onClick={(e) => { e.stopPropagation(); nav("/research"); }} className="text-xs font-semibold rounded-lg border border-white/15 bg-black/20 px-3 py-1.5 hover:bg-white/10 transition-colors">
                Compare Models
              </span>
              <span data-testid="research-deep" onClick={(e) => { e.stopPropagation(); nav("/research"); }} className="text-xs font-semibold rounded-lg border border-white/15 bg-black/20 px-3 py-1.5 hover:bg-white/10 transition-colors">
                Deep Research
              </span>
            </div>
          </div>
          <ArrowRight className="w-6 h-6 text-yellow-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-1" />
        </div>
      </button>

      {/* Other actions */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-10">
        {cards.map((c) => (
          <ActionCard key={c.key} card={c} onClick={() => nav(c.to)} />
        ))}
      </div>

      {/* Continue working */}
      <div className="label-mono mb-3">CONTINUE WORKING</div>
      <div className="grid lg:grid-cols-3 gap-px bg-white/5 border border-white/5 mb-10">
        <ContinueColumn label="Recent research" to="/research" empty="No research yet — start one above.">
          {data?.recent_threads?.length
            ? data.recent_threads.slice(0, 5).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  data-testid={`continue-thread-${t.id}`}
                  onClick={() => nav(`/chats/${t.chat_id}?thread=${t.id}`)}
                  className="w-full text-left p-3 border-b border-white/5 hover:bg-white/[0.03]"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Sparkles className="w-3 h-3 text-yellow-400 shrink-0" />
                    <span className="text-[9px] font-mono uppercase tracking-widest text-zinc-600">
                      {t.selected_models?.length || 1} MODELS
                    </span>
                  </div>
                  <div className="text-[13px] line-clamp-2 text-zinc-200">{t.question}</div>
                </button>
              ))
            : null}
        </ContinueColumn>

        <ContinueColumn label="Recent chats" to="/chats" empty="No chats yet.">
          {data?.recent_chats?.length
            ? data.recent_chats.slice(0, 5).map((c) => (
                <Link
                  key={c.id}
                  to={`/chats/${c.id}`}
                  data-testid={`continue-chat-${c.id}`}
                  className="block p-3 border-b border-white/5 hover:bg-white/[0.03]"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] font-mono uppercase tracking-widest text-zinc-600">
                      {c.type === "group" ? "GRP" : c.type === "personal_ai" ? "AI" : "DM"}
                    </span>
                    <span className="text-[13px] font-medium truncate">{c.name || "Direct Message"}</span>
                  </div>
                  <div className="text-xs text-zinc-500 truncate mt-1">
                    {c.last_message?.body?.slice(0, 70) || c.description || "—"}
                  </div>
                </Link>
              ))
            : null}
        </ContinueColumn>

        <ContinueColumn label="Active projects" to="/projects" empty="No projects yet.">
          {data?.folders?.length
            ? data.folders.slice(0, 5).map((f) => (
                <Link
                  key={f.id}
                  to={`/projects/${f.id}`}
                  data-testid={`continue-folder-${f.id}`}
                  className="flex items-center gap-2 p-3 border-b border-white/5 hover:bg-white/[0.03]"
                >
                  <Layers className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                  <span className="text-[13px] truncate">{f.name}</span>
                </Link>
              ))
            : null}
        </ContinueColumn>
      </div>

      {/* Continue working ends here — memory/intelligence now lives up top. */}
    </div>
  );
}
