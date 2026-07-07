import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Sparkles, ArrowRight, Rocket, Bot, Terminal, GitBranch, Workflow, Brain,
  Eye, MessageSquare, AtSign, Coins, CheckCircle2,
} from "lucide-react";
import SeoHelmet from "@/components/web/SeoHelmet";
import { Eyebrow, Pill, PrimaryButton, GhostButton, SectionTitle, SectionSub } from "@/components/web/atoms";

/* /dev-os-info — public marketing + how-to for Dev OS.
 * Mirrors the visual conventions of /pages/web/Home.jsx so the
 * landing → docs jump feels seamless. */
export default function WebDevOsInfo() {
  return (
    <>
      <SeoHelmet
        title="Dev OS — TeamNest.ai’s AI engineering team inside your chat"
        description="Dev OS gives you @devmanager — one AI engineer that plans, codes, tests in a real browser, and publishes your app to a live URL or your own custom domain. All from chat."
        path="/dev-os-guide"
      />
      <Hero />
      <CoreConcepts />
      <SlashCommands />
      <MentionRoster />
      <Workflow6Steps />
      <CreditCosts />
      <CTASection />
    </>
  );
}

function Hero() {
  return (
    <section className="relative pt-20 pb-12 md:pt-24 md:pb-16 overflow-hidden">
      <div
        aria-hidden
        className="absolute -top-[150px] -right-[150px] w-[600px] h-[600px] rounded-full pointer-events-none"
        style={{ background: "radial-gradient(circle, rgba(255,210,63,0.12), transparent 60%)" }}
      />
      <div className="max-w-[1100px] mx-auto px-4 sm:px-6 relative">
        <Pill tone="ai" className="mb-5">
          <Rocket className="w-3.5 h-3.5" /> Dev OS · How it works
        </Pill>
        <h1
          className="font-bold tracking-[-0.025em] text-[var(--w-text)] mb-5"
          style={{ fontSize: "clamp(36px, 5.5vw, 64px)", lineHeight: 1.06 }}
          data-testid="devos-info-headline"
        >
          One AI engineer. Your whole dev team.
        </h1>
        <p className="text-[18px] leading-[30px] text-[var(--w-text-dim)] max-w-[640px] mb-6">
          Dev OS is a chat where <strong>@devmanager</strong> — a single AI that plans,
          codes, tests and ships — turns plain English into working software. Live preview,
          browser-tested QA, one-click publish, even your own custom domain.
        </p>
        <div className="flex flex-wrap gap-2">
          {["@devmanager does it all", "Browser-tested builds", "Publish to /p/ or your domain", "Plain-English Builders"].map((t) => (
            <span key={t} className="px-3 h-7 inline-flex items-center rounded-full bg-amber-500/10 text-amber-500 border border-amber-500/30 text-[12px] font-medium">
              {t}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

function CoreConcepts() {
  const concepts = [
    {
      icon: MessageSquare,
      title: "A Dev OS chat is a chat",
      body: "Same composer, same members, same notifications. The only difference: it’s linked to a Dev OS project, and the right side of the screen shows a live workspace pane.",
    },
    {
      icon: Bot,
      title: "@devmanager is the only hire",
      body: "One AI in the room — it reads every message, plans, codes, runs QA and releases, speaking in first person. No sub-agents to coordinate, no hand-offs to babysit.",
    },
    {
      icon: Eye,
      title: "The 5-tab Build Room",
      body: "Chat · Preview · Tasks · Files · Release. Your app updates live in the Preview tab as you talk; the Release tab handles publishing, custom domains and env vars.",
    },
    {
      icon: Brain,
      title: "Persistent memory",
      body: "Every agent reply is indexed and tagged by role. Future replies retrieve relevant prior context — your team never re-explains decisions.",
    },
  ];
  return (
    <section className="py-16 md:py-20 border-t border-[var(--w-border)]">
      <div className="max-w-[1100px] mx-auto px-4 sm:px-6">
        <Eyebrow>The Core Concepts</Eyebrow>
        <SectionTitle>4 things to know before you start.</SectionTitle>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-10">
          {concepts.map((c) => (
            <div key={c.title} className="rounded-2xl p-5 bg-[var(--w-card-bg)] border border-[var(--w-border)]">
              <c.icon className="w-5 h-5 text-amber-500 mb-3" />
              <div className="text-[18px] font-semibold text-[var(--w-text)] mb-1">{c.title}</div>
              <div className="text-[14px] leading-[22px] text-[var(--w-text-dim)]">{c.body}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function SlashCommands() {
  const rows = [
    { cmd: "/dev-os new <name>",   does: "Create a project + link it to this chat. Idempotent — re-running returns the existing project." },
    { cmd: "/dev-os plan",         does: "Print the linked project’s product brief + pillars right in chat." },
    { cmd: "/dev-os task <title>", does: "Add a backlog task to the linked project’s Kanban board." },
    { cmd: "/dev-os bug <desc>",   does: "File a bug (severity: medium). QA agent reproduces it within SLA." },
    { cmd: "/dev-os scan",         does: "AI scans the last ~30 messages and drafts improvement proposals." },
    { cmd: "/dev-os help",         does: "Show this list inside the chat." },
  ];
  return (
    <section className="py-16 md:py-20 border-t border-[var(--w-border)]">
      <div className="max-w-[1100px] mx-auto px-4 sm:px-6">
        <Eyebrow>Slash Commands</Eyebrow>
        <SectionTitle>Type the slash. Skip the meeting.</SectionTitle>
        <SectionSub className="max-w-[640px]">
          Slash commands work in any chat that has a linked Dev OS project. No project linked? Just tap the 🚀 in the chat header.
        </SectionSub>
        <div className="mt-10 rounded-2xl border border-[var(--w-border)] overflow-hidden" data-testid="devos-info-slash-table">
          {rows.map((r, i) => (
            <div key={r.cmd} className={`grid grid-cols-1 md:grid-cols-[260px_1fr] gap-2 md:gap-6 px-5 py-3 ${i ? "border-t border-[var(--w-border)]" : ""} hover:bg-amber-500/5`}>
              <code className="font-mono text-[13px] text-amber-500">{r.cmd}</code>
              <div className="text-[14px] text-[var(--w-text-dim)] leading-[22px]">{r.does}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const ROSTER = [
  { tag: "🚀 Build App", role: "Full app from your brief", emoji: "🚀" },
  { tag: "🐛 Fix Bug", role: "Describe it, it gets fixed", emoji: "🐛" },
  { tag: "🧪 Run QA", role: "Full pass + browser test", emoji: "🧪" },
  { tag: "🎨 Improve Design", role: "Polish without breaking", emoji: "🎨" },
  { tag: "Business Logic", role: "When X happens, do Y", emoji: "🧩" },
  { tag: "Roles & Permissions", role: "Who can see & do what", emoji: "🛡️" },
  { tag: "Data Model", role: "Track a new kind of thing", emoji: "🗄️" },
  { tag: "Workflow", role: "Automate multi-step actions", emoji: "⚡" },
  { tag: "Forms", role: "Collect & save data", emoji: "📋" },
  { tag: "Reports", role: "Charts & summaries", emoji: "📊" },
  { tag: "Integrations", role: "Connect outside services", emoji: "🔌" },
  { tag: "@devmanager", role: "…or just say it in chat", emoji: "🎯", note: "Handles everything" },
];

function MentionRoster() {
  return (
    <section className="py-16 md:py-20 border-t border-[var(--w-border)]">
      <div className="max-w-[1100px] mx-auto px-4 sm:px-6">
        <Eyebrow>One-command actions & Builders</Eyebrow>
        <SectionTitle>No code. Just plain English.</SectionTitle>
        <SectionSub className="max-w-[640px]">
          Quick actions and guided Builders sit right above the chat box — fill in a
          sentence and @devmanager wires it into your app.
        </SectionSub>
        <div className="mt-10 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3" data-testid="devos-info-roster">
          {ROSTER.map((r) => (
            <div key={r.tag} className="rounded-xl p-3 bg-[var(--w-card-bg)] border border-[var(--w-border)] flex items-center gap-3">
              <div className="text-[22px] leading-none">{r.emoji}</div>
              <div className="min-w-0 flex-1">
                <code className="font-mono text-[13px] text-amber-500 truncate block">{r.tag}</code>
                <div className="text-[11px] text-[var(--w-text-dim)] truncate">{r.role}{r.note ? ` · ${r.note}` : ""}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Workflow6Steps() {
  const steps = [
    { n: 1, title: "Spin up a dev chat", body: 'New chat → "Development project" — or start from a template with a live demo you can try first.' },
    { n: 2, title: "Tell @devmanager what to build", body: "Plain English — even paste your current website's URL and it imports the content and brand colors." },
    { n: 3, title: "Watch it build live", body: "A progress card streams every step; the Preview tab shows your working app in ~60 seconds, demo login included." },
    { n: 4, title: "Iterate in the Build Room", body: "Quick actions (Build App, Fix Bug, Run QA, Improve Design) and guided Builders for rules, roles, data, workflows, forms and reports." },
    { n: 5, title: "QA gates + browser test", body: "Every build passes security & QA gates plus a real headless-browser check: page loads, demo login works, zero JS errors." },
    { n: 6, title: "Publish — even on your domain", body: "One click to /p/your-app, or add a CNAME and serve it on your own custom domain. Opt in to the Built with TeamNest showcase." },
  ];
  return (
    <section className="py-16 md:py-20 border-t border-[var(--w-border)]">
      <div className="max-w-[1100px] mx-auto px-4 sm:px-6">
        <Eyebrow>The Workflow</Eyebrow>
        <SectionTitle>From idea to live URL in 6 steps.</SectionTitle>
        <div className="mt-10 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="devos-info-workflow">
          {steps.map((s) => (
            <div key={s.n} className="rounded-2xl p-5 bg-[var(--w-card-bg)] border border-[var(--w-border)] relative">
              <div className="absolute -top-3 -left-3 w-8 h-8 rounded-full bg-amber-500 text-black font-bold text-[13px] flex items-center justify-center">
                {s.n}
              </div>
              <div className="text-[16px] font-semibold text-[var(--w-text)] mb-1 mt-1">{s.title}</div>
              <div className="text-[14px] leading-[22px] text-[var(--w-text-dim)]">{s.body}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function CreditCosts() {
  const [pricing, setPricing] = useState(null);
  useEffect(() => {
    fetch(`${process.env.REACT_APP_BACKEND_URL}/api/public/credit-pricing`)
      .then((r) => r.json())
      .then(setPricing)
      .catch(() => setPricing(null));
  }, []);

  const rows = pricing?.rows || [];
  const packs = pricing?.packs || [];

  return (
    <section className="py-16 md:py-20 border-t border-[var(--w-border)] bg-amber-500/[0.03]" data-testid="devos-info-pricing">
      <div className="max-w-[1100px] mx-auto px-4 sm:px-6">
        <Eyebrow><Coins className="w-3.5 h-3.5 inline mr-1" />Credit Pricing</Eyebrow>
        <SectionTitle>Pay only for what your AI team does.</SectionTitle>
        <SectionSub className="max-w-[640px]">
          Dev OS bills your workspace in TeamNest <strong>credits</strong> —
          simple usage-based pricing on the same top-tier models.
        </SectionSub>

        <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-4">
          {packs.map((p) => (
            <div
              key={p.key}
              className={`rounded-2xl p-5 border ${p.pop ? "border-amber-500 bg-amber-500/5" : "border-[var(--w-border)] bg-[var(--w-card-bg)]"}`}
            >
              {p.pop && <div className="text-[10px] font-mono uppercase tracking-widest text-amber-500 mb-1">Most popular</div>}
              <div className="text-[14px] text-[var(--w-text-dim)] mb-1">{p.label}</div>
              <div className="flex items-baseline gap-2 mb-1">
                <div className="text-[28px] font-bold text-[var(--w-text)]">${p.price_usd}</div>
                <div className="text-[12px] text-[var(--w-text-dim)]">/ pack</div>
              </div>
              <div className="text-[14px] font-mono text-amber-500">{p.credits.toLocaleString()} credits</div>
              {p.bonus && <div className="text-[11px] text-emerald-500 mt-1">{p.bonus}</div>}
            </div>
          ))}
        </div>

        <div className="mt-10 rounded-2xl border border-[var(--w-border)] overflow-hidden" data-testid="devos-info-cost-table">
          <div className="grid grid-cols-[1fr_120px_110px] px-5 py-2.5 text-[11px] font-mono uppercase tracking-widest text-[var(--w-text-dim)] bg-[var(--w-card-bg)]">
            <div>Task</div>
            <div className="text-right">You pay</div>
            <div className="text-right">Credits</div>
          </div>
          {rows.map((r, i) => (
            <div key={r.key} className={`grid grid-cols-[1fr_120px_110px] px-5 py-3 text-[13px] ${i ? "border-t border-[var(--w-border)]" : ""}`}>
              <div className="text-[var(--w-text)]">{r.label}</div>
              <div className="text-right font-mono text-amber-500">${r.user_usd.toFixed(4)}</div>
              <div className="text-right font-mono text-[var(--w-text)]">{r.credits}</div>
            </div>
          ))}
        </div>

        <div className="mt-6 text-[12px] text-[var(--w-text-dim)] max-w-[640px] leading-[20px]">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 inline mr-1" />
          Free actions: spinning up a project, opening PRs (no LLM call), triggering deploys,
          and slash commands that don’t hit an LLM (<code>/dev-os task</code>, <code>/dev-os bug</code>,
          <code>/dev-os plan</code>). Only LLM-backed actions consume credits.
        </div>
      </div>
    </section>
  );
}

function CTASection() {
  return (
    <section className="py-16 md:py-20 border-t border-[var(--w-border)]">
      <div className="max-w-[900px] mx-auto px-4 sm:px-6 text-center">
        <SectionTitle>Ship your first Dev OS project today.</SectionTitle>
        <SectionSub className="max-w-[480px] mx-auto">
          Free trial includes 2,500 credits — enough for ~50 AI replies or 5 full Dev OS scans.
        </SectionSub>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <PrimaryButton as={Link} to="/welcome" data-testid="devos-info-cta-start">
            Start a Dev OS chat <ArrowRight className="w-4 h-4" />
          </PrimaryButton>
          <GhostButton as={Link} to="/pricing" data-testid="devos-info-cta-pricing">
            Full pricing
          </GhostButton>
        </div>
      </div>
    </section>
  );
}
