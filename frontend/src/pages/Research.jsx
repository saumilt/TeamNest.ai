import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { Sparkles } from "lucide-react";
import TopActionBar from "@/components/TopActionBar";

export default function Research() {
  const [threads, setThreads] = useState([]);
  const nav = useNavigate();

  const loadThreads = useCallback(() => {
    api.get("/ai/threads").then(({ data }) => setThreads(data));
  }, []);

  useEffect(() => {
    loadThreads();
  }, [loadThreads]);

  return (
    <div className="p-6 lg:p-10">
      <div className="mb-8">
        <TopActionBar />
      </div>
      <div className="mb-10">
        <div className="label-mono mb-3">WORKSPACE / AI RESEARCH</div>
        <h1 className="font-display text-4xl lg:text-5xl font-bold tracking-tighter">
          Research threads
        </h1>
        <p className="text-zinc-500 mt-3 max-w-xl">
          All AI research queries across the workspace. Click any thread to open its side-by-side comparison.
        </p>
      </div>

      <div className="border border-white/5">
        {threads.length === 0 && (
          <div className="p-8 text-center text-zinc-500">
            No research yet. Start a chat and click <span className="text-yellow-400">Research</span>.
          </div>
        )}
        {threads.map((t) => (
          <button
            key={t.id}
            data-testid={`research-thread-${t.id}`}
            onClick={() => nav(`/chats/${t.chat_id}?thread=${t.id}`)}
            className="w-full text-left p-5 border-b border-white/5 hover:bg-white/[0.03] block"
          >
            <div className="flex items-start gap-3">
              <Sparkles className="w-4 h-4 text-yellow-400 mt-1 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-sm text-zinc-100">{t.question}</div>
                <div className="flex flex-wrap gap-1 mt-2">
                  {t.selected_models.map((m) => (
                    <span key={m} className="text-[9px] font-mono uppercase tracking-widest border border-white/10 px-1.5 py-0.5 rounded-sm text-zinc-400">
                      {m}
                    </span>
                  ))}
                  <span className="text-[9px] font-mono uppercase tracking-widest text-zinc-600 ml-auto">
                    {new Date(t.created_at).toLocaleString()}
                  </span>
                </div>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
