import { useState } from "react";
import { Sparkles, Users, Split, MessageSquare } from "lucide-react";
import { Eyebrow, SectionTitle, SectionSub } from "@/components/web/atoms";
import { Reveal, BrowserFrame } from "@/components/web/home/primitives";

const VIEWS = {
  Human: {
    tone: "brand",
    points: [
      "Shows human conversation",
      "Keeps team discussion easy to follow",
      "Hides long AI research",
      "Displays only concise shared AI findings",
    ],
  },
  Combined: {
    tone: "brand",
    points: [
      "Shows human and AI activity together",
      "Useful when complete context is needed",
      "Long AI responses can be collapsed",
    ],
  },
  AI: {
    tone: "ai",
    points: [
      "Organizes AI research by participant",
      "Keeps individual research threads separate",
      "Makes it easy to open, continue, or share research",
    ],
  },
};

function ThreeViewMock({ view }) {
  return (
    <div className="w-full h-full flex flex-col bg-[var(--w-surface)]">
      <div className="h-12 px-4 flex items-center gap-3 border-b border-[var(--w-hairline)]">
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-rose-400 to-orange-400 text-white text-[12px] font-bold flex items-center justify-center">S</div>
        <div className="text-[13px] font-semibold text-[var(--w-text)]">Study group · Case brief</div>
        <Split className="w-4 h-4 text-[var(--w-text-mute)] ml-auto" />
      </div>
      <div className="flex-1 p-4 space-y-2.5 overflow-hidden">
        {view !== "AI" && (
          <>
            <div className="flex items-start gap-2">
              <span className="w-6 h-6 rounded-full bg-gradient-to-br from-emerald-400 to-teal-400 text-white text-[10px] font-bold flex items-center justify-center">P</span>
              <div className="bg-[var(--w-surface2)] rounded-[12px] rounded-tl-[4px] px-3 py-2 text-[12.5px] text-[var(--w-text)]">Can someone pull the precedent cases?</div>
            </div>
            <div className="flex justify-end">
              <div className="bg-[var(--w-brand-tint)] rounded-[12px] rounded-tr-[4px] px-3 py-2 text-[12.5px] text-[var(--w-text)]">On it — running AI research now.</div>
            </div>
          </>
        )}
        {view !== "Human" && (
          <div className="rounded-[12px] border border-[var(--w-ai)]/30 bg-[var(--w-ai-tint)]/40 p-3">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Sparkles className="w-3.5 h-3.5 text-[var(--w-ai)]" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--w-ai)]">
                {view === "AI" ? "AI research · by participant" : "Shared AI finding"}
              </span>
            </div>
            <p className="text-[12px] leading-5 text-[var(--w-text-dim)]">
              {view === "AI"
                ? "Priya · 3 sources compared · Sam · 2 follow-ups · Jordan · summary drafted."
                : "5 relevant precedents found — summary published to the group."}
            </p>
          </div>
        )}
        {view === "Human" && (
          <div className="flex justify-start">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[var(--w-brand)] text-black text-[12px] font-semibold">
              <Sparkles className="w-3.5 h-3.5" /> Concise AI finding shared
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

export default function HumanAiSection() {
  const [view, setView] = useState("Combined");
  const active = VIEWS[view];
  return (
    <section
      id="human-ai"
      className="relative py-20 md:py-28 px-5 border-t border-[var(--w-hairline)] scroll-mt-20"
      data-testid="home-human-ai"
    >
      <div className="max-w-6xl mx-auto">
        <Reveal className="max-w-3xl mb-12">
          <Eyebrow tone="brand" className="mb-4">Human and AI collaboration</Eyebrow>
          <SectionTitle>Keep human conversation clear. Keep AI research connected.</SectionTitle>
          <SectionSub className="mt-5">
            Every project can contain human discussion and individual AI research without
            turning the main chat into a long stream of AI answers.
          </SectionSub>
        </Reveal>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-14 items-center">
          <Reveal>
            <div className="inline-flex items-center rounded-full border border-[var(--w-hairline)] bg-[var(--w-bg2)] p-1 mb-4">
              {Object.keys(VIEWS).map((v) => (
                <button
                  key={v}
                  type="button"
                  data-testid={`human-ai-toggle-${v.toLowerCase()}`}
                  onClick={() => setView(v)}
                  className={`px-4 py-1.5 rounded-full text-[13px] font-semibold transition-all ${
                    view === v
                      ? v === "AI"
                        ? "bg-[var(--w-ai)] text-black"
                        : "bg-[var(--w-brand)] text-black"
                      : "text-[var(--w-text-dim)] hover:text-[var(--w-text)]"
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
            <BrowserFrame>
              <div className="h-[340px]">
                <ThreeViewMock view={view} />
              </div>
            </BrowserFrame>
          </Reveal>

          <Reveal delay={120}>
            <div
              className={`inline-flex items-center gap-2 mb-4 text-[11px] font-bold uppercase tracking-[0.16em] ${
                active.tone === "ai" ? "text-[var(--w-ai)]" : "text-[var(--w-brand)]"
              }`}
            >
              {view === "AI" ? <Sparkles className="w-4 h-4" /> : view === "Human" ? <Users className="w-4 h-4" /> : <MessageSquare className="w-4 h-4" />}
              {view} view
            </div>
            <ul className="space-y-3">
              {active.points.map((p) => (
                <li key={p} className="flex items-start gap-3 text-[15px] leading-6 text-[var(--w-text-dim)]">
                  <span className={`mt-2 w-1.5 h-1.5 rounded-full shrink-0 ${active.tone === "ai" ? "bg-[var(--w-ai)]" : "bg-[var(--w-brand)]"}`} />
                  {p}
                </li>
              ))}
            </ul>
            <p className="mt-8 text-[18px] font-semibold text-[var(--w-text)]" style={{ textWrap: "balance" }}>
              Research deeply without pushing the group conversation down.
            </p>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
