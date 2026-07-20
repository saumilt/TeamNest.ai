import { Trophy, CheckCheck, BookOpen, ThumbsUp, Sparkles, ChevronLeft, Layers } from "lucide-react";

/**
 * TEMP visual mock — "Option B: comparison rendered inline as chat messages".
 * Not wired to real data. Used only to preview the UX for the user to compare
 * against Option A (full-screen panel). Safe to delete after the decision.
 */
const MODELS = [
  {
    name: "GPT-5.4 mini",
    conf: 78,
    answer:
      "Yes — Union Square is generally a strong location if you want visibility, foot traffic, and a central Manhattan address. Expect premium rent (~$120–180/sqft) but excellent transit access via the 4/5/6/L/N/Q/R/W.",
  },
  {
    name: "Claude Sonnet",
    conf: 91,
    answer:
      "Union Square works well for a flagship or brand presence. The trade-off is cost vs. conversion — if your customers are commuters and students, footfall is huge; if you're B2B, a quieter address may convert better per dollar.",
  },
  {
    name: "Gemini Pro",
    conf: 74,
    answer:
      "Strong yes for retail/consumer. High dwell time around the park and greenmarket days. Watch out for seasonality and weekend crowds skewing your traffic data.",
  },
];

const VOTES = [
  { label: "Best", icon: Trophy },
  { label: "Accurate", icon: CheckCheck },
  { label: "Citations", icon: BookOpen },
  { label: "Useful", icon: ThumbsUp },
];

export default function CompareInlineDemo() {
  return (
    <div className="min-h-[100dvh] bg-black text-white flex flex-col">
      {/* fake chat header */}
      <div className="sticky top-0 bg-black/95 backdrop-blur border-b border-white/10 px-3 py-2.5 flex items-center gap-3">
        <ChevronLeft className="w-5 h-5 text-zinc-300" />
        <div className="w-9 h-9 rounded-full bg-emerald-500 flex items-center justify-center font-bold text-black">QL</div>
        <div className="min-w-0">
          <div className="text-[15px] font-semibold leading-tight">Q2 Product Launch</div>
          <div className="text-[12px] text-zinc-500">Option B · inline messages preview</div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-3">
        {/* user question bubble */}
        <div className="flex justify-end">
          <div className="max-w-[80%] bg-yellow-500/15 border border-yellow-500/20 rounded-2xl rounded-br-sm px-3.5 py-2.5 text-[14px]">
            @ai compare — is Union Square a good location?
          </div>
        </div>

        {/* thin "AI compared 3 models" divider */}
        <div className="flex items-center gap-2 py-1">
          <div className="h-px flex-1 bg-white/10" />
          <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-yellow-400">
            <Layers className="w-3 h-3" /> AI compared 3 models
          </div>
          <div className="h-px flex-1 bg-white/10" />
        </div>

        {/* each model = its own message */}
        {MODELS.map((m) => (
          <div key={m.name} className="flex justify-start">
            <div className="max-w-[88%] w-full bg-[#0e0e0e] border border-white/10 rounded-2xl rounded-bl-sm overflow-hidden">
              <div className="flex items-center justify-between px-3.5 pt-2.5">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">Model</span>
                  <span className="text-[13px] font-bold">{m.name}</span>
                </div>
                <span className="text-[11px] font-mono text-yellow-400">{m.conf}% conf</span>
              </div>
              <div className="px-3.5 py-2 text-[13.5px] text-zinc-200 leading-relaxed">{m.answer}</div>
              <div className="px-3.5 pb-2.5 flex flex-wrap gap-1.5">
                {VOTES.map((v) => (
                  <button
                    key={v.label}
                    className="border border-white/10 hover:border-yellow-500/40 text-[10px] font-mono uppercase tracking-widest text-zinc-400 px-2 py-1 rounded-full inline-flex items-center gap-1"
                  >
                    <v.icon className="w-3 h-3" />
                    {v.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ))}

        {/* synthesized final answer as a highlighted message */}
        <div className="flex justify-start">
          <div className="max-w-[92%] w-full bg-yellow-500/[0.06] border border-yellow-500/30 rounded-2xl rounded-bl-sm px-3.5 py-3">
            <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-yellow-400 mb-1.5">
              <Sparkles className="w-3 h-3" /> Synthesized final answer
            </div>
            <p className="text-[14px] text-zinc-100 leading-relaxed">
              Yes — Union Square is a strong pick for a consumer-facing launch: unmatched transit + foot traffic,
              at a premium rent. Validate with a 4–6 week pop-up before committing to a long lease.
            </p>
            <div className="mt-2.5 flex flex-wrap gap-2">
              <button className="bg-white text-black text-[10px] font-mono uppercase tracking-widest px-3 py-1.5 rounded-full">
                Copy answer
              </button>
              <button className="border border-blue-400/40 text-blue-300 text-[10px] font-mono uppercase tracking-widest px-3 py-1.5 rounded-full">
                Share
              </button>
              <button className="bg-yellow-500 text-black text-[10px] font-mono uppercase tracking-widest px-3 py-1.5 rounded-full">
                Create task
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* fake composer */}
      <div className="border-t border-white/10 px-3 py-3">
        <div className="h-11 rounded-full bg-white/5 border border-white/10 flex items-center px-4 text-[13px] text-zinc-500">
          Message Q2 Product Launch…
        </div>
      </div>
    </div>
  );
}
