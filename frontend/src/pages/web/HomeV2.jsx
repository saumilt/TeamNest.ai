import { Link } from "react-router-dom";
import {
  Brain, MessageSquare, Sparkles, ListChecks, Mic, Download,
  ArrowRight, PlayCircle, Unlink, ArrowLeftRight,
} from "lucide-react";
import { WebThemeProvider } from "@/context/WebThemeContext";
import {
  Eyebrow, PrimaryButton, GhostButton, SectionTitle, SectionSub, LogoMark, Wordmark,
} from "@/components/web/atoms";
import { ChatListPanel, ChatDetailWithCompare } from "@/components/web/mocks";

/* ============================================================================
   TeamNest.ai — Website Rebuild (v2 preview).  Standalone route: /v2
   Repositioning around ONE idea: the Collective Intelligence Engine.
   This file ships Sections 1–3 (Hero · Problem · Engine) for sign-off before
   Sections 4–7 are built. Old marketing site (/) is untouched.
   ========================================================================== */

// ---- New nav (system IA, not a feature bundle) -----------------------------
function NavV2() {
  const links = [
    { label: "Product", href: "#engine" },
    { label: "How it works", href: "#proof" },
    { label: "Pricing", href: "/pricing" },
    { label: "About", href: "#about" },
  ];
  return (
    <header className="fixed top-0 inset-x-0 z-50 h-16 border-b border-[var(--w-hairline)] bg-[var(--w-bg)]/80 backdrop-blur-xl">
      <div className="max-w-6xl mx-auto h-full px-5 flex items-center justify-between">
        <Link to="/v2" className="flex items-center gap-2.5" data-testid="v2-logo">
          <LogoMark size={30} />
          <Wordmark size="md" />
        </Link>
        <nav className="hidden md:flex items-center gap-7">
          {links.map((l) => (
            <a key={l.label} href={l.href}
               className="text-[14px] font-medium text-[var(--w-text-dim)] hover:text-[var(--w-text)] transition-colors">
              {l.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-3">
          <Link to="/pricing" className="hidden sm:inline text-[14px] font-medium text-[var(--w-text-dim)] hover:text-[var(--w-text)]">
            Sign in
          </Link>
          <PrimaryButton as={Link} to="/login?demo=1" className="h-10 px-5 text-[14px]" data-testid="v2-nav-cta">
            Start free
          </PrimaryButton>
        </div>
      </div>
    </header>
  );
}

// ---- Recurring "engine" motif: faint node-grid backdrop ---------------------
function EngineBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div
        className="absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage:
            "radial-gradient(circle at center, var(--w-hairline) 1px, transparent 1px)",
          backgroundSize: "26px 26px",
          maskImage: "radial-gradient(ellipse 80% 60% at 50% 40%, black, transparent 75%)",
          WebkitMaskImage: "radial-gradient(ellipse 80% 60% at 50% 40%, black, transparent 75%)",
        }}
      />
      <div
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[720px] h-[720px] rounded-full opacity-[0.12] blur-[80px]"
        style={{ background: "radial-gradient(circle, var(--w-brand), transparent 60%)" }}
      />
    </div>
  );
}

// ---- Browser-chrome frame for pulled product surfaces -----------------------
function BrowserFrame({ children, className = "" }) {
  return (
    <div className={`rounded-[16px] border border-[var(--w-hairline)] bg-[var(--w-surface)] overflow-hidden shadow-[0_40px_120px_-40px_rgba(0,0,0,0.7)] ${className}`}>
      <div className="h-9 px-4 flex items-center gap-2 border-b border-[var(--w-hairline)] bg-[var(--w-bg2)]">
        <span className="w-3 h-3 rounded-full bg-[#FF5F57]" />
        <span className="w-3 h-3 rounded-full bg-[#FEBC2E]" />
        <span className="w-3 h-3 rounded-full bg-[#28C840]" />
        <div className="ml-3 h-5 px-3 flex items-center rounded-md bg-[var(--w-surface2)] text-[11px] text-[var(--w-text-mute)]">
          teamnest.ai
        </div>
      </div>
      {children}
    </div>
  );
}

// ---- Section 1: Hero --------------------------------------------------------
function Hero() {
  return (
    <section className="relative pt-28 pb-20 md:pt-32 md:pb-24 px-5">
      <EngineBackdrop />
      <div className="relative max-w-6xl mx-auto">
        <div className="max-w-3xl">
          <Eyebrow tone="brand" className="mb-5">Collective intelligence for teams</Eyebrow>
          <h1 className="text-[40px] sm:text-[56px] lg:text-[64px] leading-[1.03] font-bold tracking-[-0.03em] text-[var(--w-text)]"
              style={{ textWrap: "balance" }}>
            Your team&apos;s intelligence shouldn&apos;t disappear when the call ends.
          </h1>
          <p className="mt-6 text-[18px] sm:text-[20px] leading-8 text-[var(--w-text-dim)] max-w-[62ch]"
             style={{ textWrap: "pretty" }}>
            TeamNest captures what your people know, what they say, and what AI can reason on top of both — one system that remembers, so your team&apos;s intelligence compounds instead of evaporating.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <PrimaryButton as={Link} to="/login?demo=1" data-testid="v2-hero-primary">
              Start free <ArrowRight className="w-4 h-4" />
            </PrimaryButton>
            <GhostButton as="a" href="#engine" data-testid="v2-hero-secondary">
              <PlayCircle className="w-4 h-4" /> See it in action
            </GhostButton>
          </div>
          <div className="mt-5 text-[13px] text-[var(--w-text-mute)]">
            Free to start · no credit card · one workspace in under a minute
          </div>
        </div>

        {/* Product surface, reframed to point at the Engine */}
        <div className="relative mt-14 max-w-5xl">
          <BrowserFrame>
            <div className="grid grid-cols-1 md:grid-cols-[240px_1fr] h-[460px]">
              <div className="hidden md:block border-r border-[var(--w-hairline)]">
                <ChatListPanel active="launch" />
              </div>
              <ChatDetailWithCompare />
            </div>
          </BrowserFrame>
          <div className="mt-4 flex items-start gap-2.5 max-w-[46ch]">
            <Brain className="w-4 h-4 text-[var(--w-brand)] mt-0.5 shrink-0" />
            <p className="text-[13px] leading-5 text-[var(--w-text-dim)]">
              One thread — human conversation <em>and</em> multi-model reasoning, both captured into your team&apos;s memory. That&apos;s the Engine, not four apps.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

// ---- Section 2: The Problem (Fragmentation) --------------------------------
function Problem() {
  const tools = [
    { name: "Slack", has: "the conversation" },
    { name: "Zoom", has: "the meeting" },
    { name: "Notion", has: "the notes" },
    { name: "ChatGPT", has: "the answer" },
  ];
  return (
    <section id="problem" className="relative py-20 md:py-24 px-5 border-t border-[var(--w-hairline)] bg-[var(--w-bg2)]">
      <div className="max-w-6xl mx-auto">
        <div className="max-w-3xl">
          <Eyebrow tone="default" className="mb-4">The problem</Eyebrow>
          <SectionTitle>Your team&apos;s intelligence is scattered across tools that don&apos;t talk.</SectionTitle>
          <SectionSub className="mt-5">
            Slack has the conversation. Zoom has the meeting. Notion has the notes. ChatGPT has the answer. None of them talk to each other — so what your team knows leaks out in the gaps between them.
          </SectionSub>
        </div>

        {/* Broken-chain visual */}
        <div className="mt-12 flex flex-wrap items-center justify-center gap-3 md:gap-4">
          {tools.map((t, i) => (
            <div key={t.name} className="flex items-center gap-3 md:gap-4">
              <div className="w-[150px] rounded-[14px] border border-[var(--w-hairline)] bg-[var(--w-surface)] px-4 py-4 text-center"
                   data-testid={`frag-tool-${t.name.toLowerCase()}`}>
                <div className="text-[15px] font-bold text-[var(--w-text)]">{t.name}</div>
                <div className="text-[12px] text-[var(--w-text-mute)] mt-0.5">has {t.has}</div>
              </div>
              {i < tools.length - 1 && (
                <Unlink className="w-5 h-5 text-[var(--w-red)]/70 shrink-0" />
              )}
            </div>
          ))}
        </div>

        <p className="mt-10 text-center text-[18px] md:text-[22px] font-semibold text-[var(--w-text)]"
           style={{ textWrap: "balance" }}>
          Four tools. Zero shared memory. Every decision re-litigated from scratch.
        </p>
      </div>
    </section>
  );
}

// ---- Section 3: The Collective Intelligence Engine -------------------------
const SPOKES = [
  { key: "conversation", label: "Conversation", sub: "Group chat", icon: MessageSquare, angle: -90 },
  { key: "reasoning", label: "Reasoning", sub: "Multi-model AI", icon: Sparkles, angle: -18 },
  { key: "action", label: "Action", sub: "Tasks & deadlines", icon: ListChecks, angle: 54 },
  { key: "import", label: "Import", sub: "WhatsApp history", icon: Download, angle: 126 },
  { key: "capture", label: "Capture", sub: "Voice / video", icon: Mic, angle: 198 },
];
const R = 40; // % radius for spoke placement

function pos(angleDeg) {
  const rad = (angleDeg * Math.PI) / 180;
  return { left: 50 + R * Math.cos(rad), top: 50 + R * Math.sin(rad) };
}

function SpokeNode({ spoke, compact = false }) {
  const Icon = spoke.icon;
  return (
    <div
      data-testid={`engine-spoke-${spoke.key}`}
      className={`rounded-[14px] border border-[var(--w-hairline)] bg-[var(--w-surface)] ${compact ? "px-3 py-2.5 flex items-center gap-2.5 w-full" : "px-3 py-3 w-[132px] text-center"}`}
    >
      <div className={`${compact ? "" : "mx-auto mb-1.5"} w-8 h-8 rounded-full bg-[var(--w-brand-tint)] flex items-center justify-center shrink-0`}>
        <Icon className="w-4 h-4 text-[var(--w-brand)]" />
      </div>
      <div className={compact ? "text-left" : ""}>
        <div className="text-[13px] font-bold text-[var(--w-text)] leading-4">{spoke.label}</div>
        <div className="text-[11px] text-[var(--w-text-mute)]">{spoke.sub}</div>
      </div>
    </div>
  );
}

function EngineDiagram() {
  return (
    <>
      {/* Desktop radial */}
      <div className="hidden md:block relative w-full max-w-[560px] aspect-square mx-auto" data-testid="engine-diagram">
        <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
          <defs>
            <linearGradient id="spokeLine" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="var(--w-brand)" stopOpacity="0.5" />
              <stop offset="100%" stopColor="var(--w-ai)" stopOpacity="0.5" />
            </linearGradient>
          </defs>
          {SPOKES.map((s) => {
            const p = pos(s.angle);
            return (
              <line key={s.key} x1="50" y1="50" x2={p.left} y2={p.top}
                    stroke="url(#spokeLine)" strokeWidth="0.5" strokeDasharray="1.5 1.5" />
            );
          })}
        </svg>

        {/* Center: Persistent Memory */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[150px] h-[150px] rounded-full border border-[var(--w-ai)]/40 bg-[var(--w-ai-tint)] flex flex-col items-center justify-center text-center shadow-[0_0_60px_-10px_var(--w-ai)]"
             data-testid="engine-center">
          <div className="w-11 h-11 rounded-full bg-[var(--w-ai)]/20 border border-[var(--w-ai)]/50 flex items-center justify-center mb-1.5">
            <Brain className="w-6 h-6 text-[var(--w-ai)]" />
          </div>
          <div className="text-[13px] font-bold text-[var(--w-text)] leading-4">Persistent<br />Memory</div>
          <div className="text-[10px] text-[var(--w-text-mute)] mt-1 px-2">the compounding core</div>
        </div>

        {/* Spokes */}
        {SPOKES.map((s) => {
          const p = pos(s.angle);
          return (
            <div key={s.key} className="absolute" style={{ left: `${p.left}%`, top: `${p.top}%`, transform: "translate(-50%,-50%)" }}>
              <SpokeNode spoke={s} />
            </div>
          );
        })}
      </div>

      {/* Mobile vertical stack fallback */}
      <div className="md:hidden mx-auto max-w-sm" data-testid="engine-diagram-mobile">
        <div className="rounded-[16px] border border-[var(--w-ai)]/40 bg-[var(--w-ai-tint)] px-4 py-4 flex items-center gap-3">
          <div className="w-11 h-11 rounded-full bg-[var(--w-ai)]/20 border border-[var(--w-ai)]/50 flex items-center justify-center shrink-0">
            <Brain className="w-6 h-6 text-[var(--w-ai)]" />
          </div>
          <div>
            <div className="text-[14px] font-bold text-[var(--w-text)]">Persistent Memory</div>
            <div className="text-[12px] text-[var(--w-text-mute)]">the compounding core every surface feeds</div>
          </div>
        </div>
        <div className="flex flex-col items-center">
          <div className="w-px h-5 bg-[var(--w-hairline-strong)]" />
        </div>
        <div className="space-y-2.5">
          {SPOKES.map((s) => <SpokeNode key={s.key} spoke={s} compact />)}
        </div>
      </div>
    </>
  );
}

function Engine() {
  return (
    <section id="engine" className="relative py-20 md:py-28 px-5 border-t border-[var(--w-hairline)] scroll-mt-20">
      <EngineBackdrop />
      <div className="relative max-w-6xl mx-auto">
        <div className="max-w-3xl">
          <Eyebrow tone="ai" className="mb-4">The Collective Intelligence Engine</Eyebrow>
          <SectionTitle>One engine underneath every surface.</SectionTitle>
          <SectionSub className="mt-5">
            TeamNest isn&apos;t five tools bolted together. Every feature is a surface of one system: conversation, reasoning, capture and action all feed a persistent memory — and pull from it. That&apos;s why multi-model AI here isn&apos;t a novelty. You get the collective judgment of GPT-4o, Claude, Gemini and more, <span className="text-[var(--w-text)] font-medium">grounded in your team&apos;s actual context and history</span> — something no single-model tool can do, because no single-model tool has your team&apos;s memory.
          </SectionSub>
        </div>

        <div className="mt-14 grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-8 items-center">
          <EngineDiagram />

          {/* The Engine at work — a real product surface, annotated */}
          <div className="relative">
            <div className="inline-flex items-center gap-1.5 mb-3 text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--w-ai)]">
              <ArrowLeftRight className="w-3.5 h-3.5" /> The Engine at work
            </div>
            <BrowserFrame>
              <div className="h-[420px]">
                <ChatDetailWithCompare />
              </div>
            </BrowserFrame>
            <p className="mt-3 text-[13px] leading-5 text-[var(--w-text-dim)] max-w-[48ch]">
              One thread: a human question, three AI models reasoning side-by-side, a synthesized answer — all captured into project memory the moment it happens.
            </p>
          </div>
        </div>

        {/* feeds-in / pulls-out caption */}
        <div className="mt-12 flex flex-wrap justify-center gap-x-8 gap-y-2 text-[13px] text-[var(--w-text-mute)]">
          <span className="inline-flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-[var(--w-brand)]" /> Every surface <span className="text-[var(--w-text-dim)]">feeds</span> the memory</span>
          <span className="inline-flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-[var(--w-ai)]" /> Every surface <span className="text-[var(--w-text-dim)]">pulls from</span> the memory</span>
        </div>
      </div>
    </section>
  );
}

// ---- Review checkpoint banner ----------------------------------------------
function ReviewStop() {
  return (
    <section id="about" className="py-16 px-5 border-t border-[var(--w-hairline)] bg-[var(--w-bg2)]">
      <div className="max-w-2xl mx-auto text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[var(--w-brand)]/30 bg-[var(--w-brand-tint)] text-[var(--w-brand)] text-[12px] font-bold mb-4">
          Preview · Sections 1–3
        </div>
        <h3 className="text-[22px] font-bold text-[var(--w-text)]">The rest of the site is built around this.</h3>
        <p className="mt-3 text-[15px] leading-7 text-[var(--w-text-dim)]">
          Per the plan, we stop here for sign-off on the Engine — the one new structural idea. Approve this and the next pass adds the reframed feature surfaces (Conversation · Reasoning · Memory · Action), a single narrative walkthrough, social proof, and the closing CTA.
        </p>
      </div>
    </section>
  );
}

function FooterV2() {
  return (
    <footer className="py-8 px-5 border-t border-[var(--w-hairline)]">
      <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-2.5"><LogoMark size={24} /><Wordmark size="sm" /></div>
        <div className="text-[12px] text-[var(--w-text-mute)]">Collective intelligence for teams · rebuild preview</div>
      </div>
    </footer>
  );
}

export default function WebHomeV2() {
  return (
    <WebThemeProvider forceDark>
      <div className="min-h-screen bg-[var(--w-bg)] text-[var(--w-text)]">
        <NavV2 />
        <main className="pt-16">
          <Hero />
          <Problem />
          <Engine />
          <ReviewStop />
        </main>
        <FooterV2 />
      </div>
    </WebThemeProvider>
  );
}
