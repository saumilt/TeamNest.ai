import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import axios from "axios";
import { API } from "@/lib/api";
import { Sparkles, Trophy, ExternalLink } from "lucide-react";

const VOTE_LABELS = {
  best: "Best",
  most_accurate: "Accurate",
  best_citations: "Citations",
  most_useful: "Useful",
};

export default function PublicSnapshot() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    axios.get(`${API}/public/snapshot/${token}`)
      .then(({ data }) => setData(data))
      .catch((e) => setErr(e?.response?.data?.detail || "Snapshot not found"));
  }, [token]);

  if (err) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] text-white flex items-center justify-center">
        <div className="text-center">
          <div className="font-display text-4xl font-bold mb-3">404</div>
          <div className="text-zinc-500">{err}</div>
        </div>
      </div>
    );
  }
  if (!data) {
    return <div className="min-h-screen bg-[#0a0a0a] text-white flex items-center justify-center label-mono">Loading snapshot…</div>;
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      {/* Header */}
      <header className="border-b border-white/5 px-6 lg:px-12 py-5 flex items-center justify-between">
        <a href="/" className="flex items-center gap-3" data-testid="public-brand">
          <div className="w-9 h-9 bg-yellow-400 text-black flex items-center justify-center font-display font-extrabold text-base">TN</div>
          <div className="leading-none">
            <div className="font-display font-bold tracking-tight text-lg">teamnest<span className="text-yellow-400">.ai</span></div>
            <div className="text-[9px] font-mono tracking-widest text-zinc-500 mt-1">PUBLIC RESEARCH SNAPSHOT</div>
          </div>
        </a>
        <a href="/" className="text-[10px] font-mono uppercase tracking-widest text-zinc-400 hover:text-yellow-400 flex items-center gap-1">
          GET YOUR OWN <ExternalLink className="w-3 h-3" />
        </a>
      </header>

      <div className="max-w-6xl mx-auto px-6 lg:px-12 py-10">
        <div className="label-mono mb-3">{data.workspace_name} · AI RESEARCH</div>
        <h1 className="font-display text-3xl lg:text-5xl font-bold tracking-tighter mb-3 leading-[0.95]">
          {data.thread.question}
        </h1>
        <div className="flex flex-wrap gap-2 mb-10">
          {data.thread.selected_models.map((m) => (
            <span key={m} className="text-[10px] font-mono uppercase tracking-widest border border-white/10 px-2 py-1 rounded-sm text-zinc-400">
              {m}
            </span>
          ))}
          <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-600 ml-auto">
            {new Date(data.thread.created_at).toLocaleDateString()}
          </span>
        </div>

        {data.thread.final_answer && (
          <div className="bg-black border border-yellow-500/30 p-6 mb-10 fade-in">
            <div className="label-mono text-yellow-400 mb-3 flex items-center gap-2">
              <Sparkles className="w-3 h-3" /> SYNTHESIZED FINAL ANSWER
            </div>
            <div className="text-base leading-relaxed whitespace-pre-wrap">{data.thread.final_answer}</div>
          </div>
        )}

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-px bg-white/10 border border-white/10">
          {data.responses.map((r) => (
            <div
              key={r.model_key}
              data-testid={`snapshot-model-${r.model_key}`}
              className={`bg-[#0a0a0a] p-5 border-t-2 ${r.selected_as_best ? "border-yellow-400" : "border-transparent"}`}
            >
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="label-mono text-zinc-500">MODEL</div>
                  <div className="font-display font-bold text-lg tracking-tight">{r.model_name}</div>
                </div>
                {r.selected_as_best && (
                  <div className="flex items-center gap-1 text-yellow-400 text-[10px] font-mono uppercase tracking-widest">
                    <Trophy className="w-3 h-3" /> Best
                  </div>
                )}
              </div>
              {r.confidence_score != null && (
                <div className="text-[10px] font-mono uppercase tracking-widest text-yellow-400 mb-3">
                  CONFIDENCE · {r.confidence_score}%
                </div>
              )}
              <div className="text-sm text-zinc-200 whitespace-pre-wrap leading-relaxed mb-4">{r.answer}</div>
              <div className="grid grid-cols-2 gap-2 mb-3">
                <div>
                  <div className="label-mono mb-1">STRENGTHS</div>
                  <ul className="text-[11px] text-zinc-400 space-y-0.5">
                    {(r.strengths || []).map((s, i) => <li key={`s-${i}-${s.slice(0, 16)}`}>+ {s}</li>)}
                  </ul>
                </div>
                <div>
                  <div className="label-mono mb-1">WEAKNESSES</div>
                  <ul className="text-[11px] text-zinc-400 space-y-0.5">
                    {(r.weaknesses || []).map((s, i) => <li key={`w-${i}-${s.slice(0, 16)}`}>– {s}</li>)}
                  </ul>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(r.vote_counts || {}).map(([k, n]) => (
                  n > 0 ? (
                    <span key={k} className="text-[10px] font-mono uppercase tracking-widest border border-yellow-500/30 text-yellow-300 px-1.5 py-0.5 rounded-sm">
                      {VOTE_LABELS[k] || k} {n}
                    </span>
                  ) : null
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-10 pt-6 border-t border-white/5 flex items-center justify-between text-zinc-500 text-xs">
          <div>Read-only public snapshot · Shared by {data.workspace_name}</div>
          <a href="/" className="hover:text-yellow-400 font-mono uppercase tracking-widest text-[10px]">
            Powered by teamnest.ai
          </a>
        </div>
      </div>
    </div>
  );
}
