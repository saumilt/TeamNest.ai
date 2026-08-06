import { Link } from "react-router-dom";
import {
  ArrowRight, Briefcase, Users, Sparkles, ListChecks, FileText, Search, Split,
} from "lucide-react";
import { Eyebrow, PrimaryButton, GhostButton } from "@/components/web/atoms";
import { EngineBackdrop, BrowserFrame, Reveal, trackHomeEvent } from "@/components/web/home/primitives";

/* Hero visual: a single connected project workspace — people + multiple AI
   models + research + tasks + the Human | Combined | AI views. */
function HeroWorkspaceMock() {
  const people = [
    { n: "Sam", c: "from-rose-400 to-orange-400" },
    { n: "Priya", c: "from-emerald-400 to-teal-400" },
    { n: "Jordan", c: "from-sky-400 to-indigo-400" },
  ];
  const models = [
    { n: "OpenAI", c: "bg-emerald-400" },
    { n: "Claude", c: "bg-orange-400" },
    { n: "Gemini", c: "bg-sky-400" },
  ];
  const research = ["Competitor analysis", "Customer research", "Financial model"];
  const tasks = [
    { t: "Prepare presentation", done: false },
    { t: "Verify sources", done: true },
    { t: "Submit report", done: false },
  ];
  return (
    <div className="grid grid-cols-1 md:grid-cols-[210px_1fr] h-full bg-[var(--w-surface)]">
      {/* Left rail */}
      <aside className="hidden md:flex flex-col border-r border-[var(--w-hairline)] p-4 gap-4">
        <div>
          <div className="flex items-center gap-2 text-[13px] font-bold text-[var(--w-text)]">
            <span className="w-6 h-6 rounded-lg bg-[var(--w-brand-tint)] flex items-center justify-center">
              <Briefcase className="w-3.5 h-3.5 text-[var(--w-brand)]" />
            </span>
            Market Expansion
          </div>
          <div className="text-[11px] text-[var(--w-text-mute)] mt-1 pl-8">Study · Project</div>
        </div>
        <div>
          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-[var(--w-text-mute)] mb-2">
            <Users className="w-3 h-3" /> People
          </div>
          <div className="space-y-1.5">
            {people.map((p) => (
              <div key={p.n} className="flex items-center gap-2">
                <span className={`w-5 h-5 rounded-full bg-gradient-to-br ${p.c} text-white text-[9px] font-bold flex items-center justify-center`}>{p.n[0]}</span>
                <span className="text-[12px] text-[var(--w-text-dim)]">{p.n}</span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-[var(--w-ai)] mb-2">
            <Sparkles className="w-3 h-3" /> AI models
          </div>
          <div className="space-y-1.5">
            {models.map((m) => (
              <div key={m.n} className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${m.c}`} />
                <span className="text-[12px] text-[var(--w-text-dim)]">{m.n}</span>
              </div>
            ))}
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex flex-col min-w-0">
        {/* Three-view toggle */}
        <div className="h-11 px-4 flex items-center gap-2 border-b border-[var(--w-hairline)]">
          <div className="flex items-center rounded-full border border-[var(--w-hairline)] bg-[var(--w-bg2)] p-0.5 text-[11px] font-semibold">
            <span className="px-2.5 py-1 rounded-full text-[var(--w-text-dim)]">Human</span>
            <span className="px-2.5 py-1 rounded-full bg-[var(--w-brand)] text-black">Combined</span>
            <span className="px-2.5 py-1 rounded-full text-[var(--w-ai)]">AI Research</span>
          </div>
          <Split className="w-3.5 h-3.5 text-[var(--w-text-mute)] ml-auto" />
        </div>

        <div className="flex-1 p-4 grid grid-cols-1 sm:grid-cols-[1fr_150px] gap-3 overflow-hidden">
          <div className="space-y-2.5 min-w-0">
            <div className="flex justify-end">
              <div className="max-w-[85%] bg-[var(--w-brand-tint)] rounded-[12px] rounded-tr-[4px] px-3 py-2 text-[12px] text-[var(--w-text)]">
                Which region should we expand into first?
              </div>
            </div>
            <div className="rounded-[12px] border border-[var(--w-ai)]/30 bg-[var(--w-ai-tint)]/40 p-3">
              <div className="flex items-center gap-1.5 mb-1.5">
                <Sparkles className="w-3.5 h-3.5 text-[var(--w-ai)]" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--w-ai)]">3 models compared</span>
              </div>
              <p className="text-[12px] leading-5 text-[var(--w-text-dim)]">
                Consensus: lead with the US for volume, then EU once compliance is signed.
              </p>
            </div>
            <div className="rounded-[10px] border border-[var(--w-hairline)] bg-[var(--w-surface2)] p-2.5">
              <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-[var(--w-text-mute)] mb-1.5">
                <Search className="w-3 h-3" /> Research
              </div>
              {research.map((r) => (
                <div key={r} className="text-[11.5px] text-[var(--w-text-dim)] py-0.5 flex items-center gap-1.5">
                  <FileText className="w-3 h-3 text-[var(--w-text-mute)]" /> {r}
                </div>
              ))}
            </div>
          </div>

          {/* Tasks column */}
          <div className="rounded-[10px] border border-[var(--w-hairline)] bg-[var(--w-surface2)] p-2.5 h-fit">
            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-[var(--w-text-mute)] mb-2">
              <ListChecks className="w-3 h-3" /> Tasks
            </div>
            <div className="space-y-1.5">
              {tasks.map((t) => (
                <div key={t.t} className="flex items-start gap-1.5">
                  <span className={`mt-0.5 w-3 h-3 rounded-[4px] border flex items-center justify-center ${t.done ? "bg-[var(--w-green)] border-[var(--w-green)]" : "border-[var(--w-hairline-strong)]"}`}>
                    {t.done && <span className="w-1.5 h-1.5 rounded-[1px] bg-black" />}
                  </span>
                  <span className={`text-[11px] leading-4 ${t.done ? "text-[var(--w-text-mute)] line-through" : "text-[var(--w-text-dim)]"}`}>{t.t}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const HERO_COPY = {
  default: {
    headline: "Where people and AI think together.",
    sub: "TeamNest brings human conversations, multiple AI models, research, files, tasks, and knowledge into one connected workspace. Work independently, collaborate with classmates, manage a team, or build intelligence across an entire organization.",
  },
  alt: {
    headline: "Your work, research, and AI — in one place.",
    sub: "Use multiple AI assistants, collaborate with people, organize research, manage tasks, and keep everything you learn connected by project.",
  },
};

export default function Hero({ variant = "default" }) {
  const copy = HERO_COPY[variant] || HERO_COPY.default;
  return (
    <section className="relative pt-28 pb-16 md:pt-32 md:pb-20 px-5" data-testid="home-hero" data-hero-variant={variant}>
      <EngineBackdrop />
      <div className="relative max-w-6xl mx-auto">
        <div className="max-w-3xl">
          <Reveal>
            <Eyebrow tone="brand" className="mb-5">
              For individuals, students, teams, and businesses
            </Eyebrow>
          </Reveal>
          <Reveal delay={60}>
            <h1
              className="text-[40px] sm:text-[56px] lg:text-[64px] leading-[1.03] font-bold tracking-[-0.03em] text-[var(--w-text)]"
              style={{ textWrap: "balance" }}
              data-testid="hero-headline"
            >
              {copy.headline}
            </h1>
          </Reveal>
          <Reveal delay={120}>
            <p
              className="mt-6 text-[18px] sm:text-[20px] leading-8 text-[var(--w-text-dim)] max-w-[64ch]"
              style={{ textWrap: "pretty" }}
            >
              {copy.sub}
            </p>
          </Reveal>
          <Reveal delay={180}>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <PrimaryButton
                as={Link}
                to="/signup"
                data-testid="hero-start-free"
                onClick={() => trackHomeEvent("hero_start_free_click", { source: "hero" })}
              >
                Start Free <ArrowRight className="w-4 h-4" />
              </PrimaryButton>
              <GhostButton
                as={Link}
                to="/business"
                data-testid="hero-explore-business"
                onClick={() => trackHomeEvent("explore_business_click", { source: "hero" })}
              >
                <Briefcase className="w-4 h-4" /> Explore TeamNest for Business
              </GhostButton>
            </div>
          </Reveal>
          <Reveal delay={240}>
            <div className="mt-5 text-[13px] text-[var(--w-text-mute)]">
              Research alone. Collaborate with others. Build knowledge that lasts.
            </div>
          </Reveal>
        </div>

        <Reveal delay={200} className="relative mt-14 max-w-5xl">
          <BrowserFrame>
            <div className="h-[440px]">
              <HeroWorkspaceMock />
            </div>
          </BrowserFrame>
        </Reveal>
      </div>
    </section>
  );
}
