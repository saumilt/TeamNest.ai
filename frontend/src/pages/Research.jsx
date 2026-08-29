import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { Sparkles } from "lucide-react";
import TopActionBar from "@/components/TopActionBar";

const RESEARCH_EXAMPLES = [
  "Compare three competitors in my industry and summarize their strengths",
  "Research a market trend and outline the key opportunities",
  "Summarize my uploaded documents into a one-page brief",
  "Explain a complex topic simply, with pros and cons",
];

export default function Research() {
  const [threads, setThreads] = useState([]);
  const [ask, setAsk] = useState("");
  const nav = useNavigate();

  const loadThreads = useCallback(() => {
    api.get("/ai/threads").then(({ data }) => setThreads(data));
  }, []);

  useEffect(() => {
    loadThreads();
  }, [loadThreads]);

  const submitAsk = () => {
    const q = ask.trim();
    if (!q) return;
    nav(`/my-ai?ask=${encodeURIComponent(q)}`);
  };

  return (
    <div className="p-6 lg:p-10">
      <div className="mb-8">
        <TopActionBar items={["my-ai", "compare", "upload", "new-chat", "hire-ai"]} />
      </div>
      <div className="mb-6">
        <div className="label-mono mb-3">WORKSPACE / AI RESEARCH</div>
        <h1 className="font-display text-4xl lg:text-5xl font-bold tracking-tighter">
          Research threads
        </h1>
        <p className="text-zinc-500 mt-3 max-w-xl">
          All AI research queries across the workspace. Click any thread to open its side-by-side comparison.
        </p>
      </div>

      {/* Ask composer — start research right here */}
      <div className="mb-8 rounded-2xl border border-yellow-400/30 bg-gradient-to-br from-yellow-400/[0.06] to-transparent p-4">
        <label className="label-mono mb-2 block">ASK · START NEW RESEARCH</label>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            data-testid="research-ask-input"
            value={ask}
            onChange={(e) => setAsk(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submitAsk()}
            placeholder="Ask anything — TeamNest queries the models and saves the answer here"
            className="flex-1 bg-[#0a0a0a] border border-white/10 rounded-sm px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-yellow-400/40"
          />
          <button
            data-testid="research-ask-btn"
            onClick={submitAsk}
            disabled={!ask.trim()}
            className="bg-yellow-500 text-black hover:bg-yellow-400 disabled:opacity-60 text-sm font-semibold rounded-sm px-4 py-2.5 inline-flex items-center justify-center gap-2"
          >
            <Sparkles className="w-4 h-4" /> Ask AI
          </button>
        </div>
      </div>

      <div className="border border-white/5">
        {threads.length === 0 && (
          <div className="p-8 sm:p-12">
            <div className="max-w-lg">
              <Sparkles className="w-6 h-6 text-yellow-400 mb-4" />
              <h3 className="font-display text-2xl font-bold tracking-tight mb-2">No research yet</h3>
              <p className="text-zinc-500 mb-6">
                Ask your AI anything — it queries multiple models and saves the answer here.
                Try one of these to get started:
              </p>
              <div className="flex flex-col gap-2">
                {RESEARCH_EXAMPLES.map((ex) => (
                  <button
                    key={ex}
                    type="button"
                    data-testid={`research-example-${ex.slice(0, 16).replace(/\s+/g, "-").toLowerCase()}`}
                    onClick={() => nav(`/my-ai?ask=${encodeURIComponent(ex)}`)}
                    className="group flex items-center gap-3 text-left rounded-xl border border-white/10 bg-white/[0.02] hover:bg-white/[0.06] hover:border-yellow-400/40 px-4 py-3 transition-colors"
                  >
                    <Sparkles className="w-4 h-4 text-zinc-500 group-hover:text-yellow-400 shrink-0" strokeWidth={1.8} />
                    <span className="text-sm text-zinc-200">{ex}</span>
                  </button>
                ))}
              </div>
            </div>
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
