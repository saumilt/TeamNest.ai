import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Sparkles, MessageSquare, Layers, ArrowRight } from "lucide-react";
import HomeLookSwitcher from "@/components/HomeLookSwitcher";
import IntelligenceBanner from "@/components/IntelligenceBanner";
import SetupChecklist from "@/components/SetupChecklist";
import HomeComposer from "@/components/HomeComposer";
import FeatureShortcuts from "@/components/FeatureShortcuts";
import { personaConfig } from "@/lib/persona";

const CHIPS = [
  "Help me plan my week",
  "Compare Claude and ChatGPT on this",
  "Summarize this document",
  "Turn our meeting into tasks",
];

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return "Working late";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

/** "Focus" Home — Claude-style calm workspace. Warm greeting + composer, then
 *  a two-column "jump back in" + all features. */
export default function FocusHome({ variant, onChangeLook }) {
  const { user } = useAuth();
  const nav = useNavigate();
  const [data, setData] = useState(null);
  const first = user?.name?.split(" ")[0];
  const cfg = personaConfig(user?.persona);

  useEffect(() => {
    api.get("/dashboard").then(({ data }) => setData(data)).catch(() => {});
  }, []);

  return (
    <div className="p-6 lg:p-10 max-w-[1100px] mx-auto w-full" data-testid="home-focus">
      <div className="flex justify-end mb-5">
        <HomeLookSwitcher current={variant} onChange={onChangeLook} />
      </div>

      <IntelligenceBanner />
      <SetupChecklist />

      <div className="mb-3">
        <h1 className="font-display text-3xl lg:text-4xl font-bold tracking-tight">
          {greeting()}{first ? `, ${first}` : ""}.
        </h1>
        <p className="text-zinc-500 mt-2">What would you like to think through today?</p>
      </div>
      <HomeComposer chips={cfg?.chips || CHIPS} placeholder="Ask, research, or draft — I'll bring the right AI." />

      <div className="grid lg:grid-cols-2 gap-4 mt-10">
        {/* Jump back in */}
        <div className="rounded-2xl border border-white/10 bg-[#0c0c0e] p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display text-base font-bold tracking-tight">Jump back in</h3>
            <Link to="/research" className="text-[10px] font-mono tracking-widest text-zinc-500 hover:text-white">
              RESEARCH <ArrowRight className="inline w-3 h-3" />
            </Link>
          </div>
          <div className="space-y-px">
            {data?.recent_threads?.slice(0, 3).map((t) => (
              <button
                key={t.id}
                type="button"
                data-testid={`focus-thread-${t.id}`}
                onClick={() => nav(`/chats/${t.chat_id}?thread=${t.id}`)}
                className="w-full text-left p-2.5 rounded-lg hover:bg-white/[0.04]"
              >
                <div className="flex items-center gap-2">
                  <Sparkles className="w-3 h-3 text-yellow-400 shrink-0" />
                  <span className="text-[13px] text-zinc-200 line-clamp-1">{t.question}</span>
                </div>
              </button>
            ))}
            {data?.recent_chats?.slice(0, 3).map((c) => (
              <Link
                key={c.id}
                to={`/chats/${c.id}`}
                data-testid={`focus-chat-${c.id}`}
                className="flex items-center gap-2 p-2.5 rounded-lg hover:bg-white/[0.04]"
              >
                <MessageSquare className="w-3 h-3 text-zinc-500 shrink-0" />
                <span className="text-[13px] text-zinc-200 line-clamp-1">{c.name || "Direct Message"}</span>
              </Link>
            ))}
            {data?.folders?.slice(0, 2).map((f) => (
              <Link
                key={f.id}
                to={`/projects/${f.id}`}
                data-testid={`focus-folder-${f.id}`}
                className="flex items-center gap-2 p-2.5 rounded-lg hover:bg-white/[0.04]"
              >
                <Layers className="w-3 h-3 text-blue-400 shrink-0" />
                <span className="text-[13px] text-zinc-200 line-clamp-1">{f.name}</span>
              </Link>
            ))}
            {!data?.recent_threads?.length && !data?.recent_chats?.length && (
              <div className="text-sm text-zinc-600 p-2.5">Nothing yet — start above.</div>
            )}
          </div>
        </div>

        {/* Everything TeamNest can do */}
        <div className="rounded-2xl border border-white/10 bg-[#0c0c0e] p-5">
          <h3 className="font-display text-base font-bold tracking-tight mb-4">Everything you can do</h3>
          <FeatureShortcuts order={cfg?.featureOrder} />
        </div>
      </div>
    </div>
  );
}
