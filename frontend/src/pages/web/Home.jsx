import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import {
  Sparkles, ArrowRight, MessageSquare, ListChecks, Phone, Folder,
  Megaphone, Briefcase, Scale, Calculator, CheckCircle2, Rocket, Bot, Terminal,
  Brain, ShieldCheck, Plug, Mail,
} from "lucide-react";
import SeoHelmet from "@/components/web/SeoHelmet";
import { Eyebrow, Pill, PrimaryButton, GhostButton, SectionTitle, SectionSub } from "@/components/web/atoms";
import { isInviteOnly, useLaunchConfig } from "@/hooks/useLaunchConfig";

function HeroCtas({ center = false }) {
  const cfg = useLaunchConfig();
  const gated = isInviteOnly(cfg);
  if (gated) {
    return (
      <div className={center ? "text-center" : ""}>
        <p className="text-[14px] font-semibold text-amber-500 mb-3" data-testid="web-invite-only-note">
          TeamNest.ai is currently invite-only.
        </p>
        <div className={`flex flex-wrap items-center gap-3 mb-5 ${center ? "justify-center" : ""}`}>
          <PrimaryButton as={Link} to="/waitlist" data-testid="web-hero-request-invite">
            Request Invite <ArrowRight className="w-4 h-4" />
          </PrimaryButton>
          <GhostButton as={Link} to="/invite" data-testid="web-hero-enter-code">
            Enter Invite Code
          </GhostButton>
          <GhostButton as={Link} to="/product" data-testid="web-hero-how-it-works">
            See How It Works
          </GhostButton>
        </div>
      </div>
    );
  }
  return (
    <div className={`flex flex-wrap items-center gap-3 mb-5 ${center ? "justify-center" : ""}`}>
      <PrimaryButton as={Link} to="/login?demo=1" data-testid="web-hero-try-demo">
        Try the demo
        <ArrowRight className="w-4 h-4" />
      </PrimaryButton>
      <GhostButton as={Link} to="/pricing" data-testid="web-hero-see-pricing">
        See pricing
      </GhostButton>
    </div>
  );
}
import {
  ChatListPanel,
  ChatDetailWithCompare,
  SixModelStrip,
  GroupChatMock,
  TaskCardMock,
  CallTranscriptMock,
  FolderTabsMock,
} from "@/components/web/mocks";

function Hero() {
  return (
    <section className="relative pt-20 pb-20 md:pt-24 md:pb-28 overflow-hidden">
      {/* Quiet radial amber glow upper-right */}
      <div
        aria-hidden
        className="absolute -top-[200px] -right-[200px] w-[700px] h-[700px] rounded-full pointer-events-none"
        style={{ background: "radial-gradient(circle, rgba(255,210,63,0.12), transparent 60%)" }}
      />

      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 relative">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center">
          {/* Copy */}
          <div className="lg:col-span-7">
            <Pill tone="ai" className="mb-6">
              <Sparkles className="w-3.5 h-3.5" />
              New · @devmanager builds working apps from chat
            </Pill>
            <h1
              className="font-bold tracking-[-0.03em] text-[var(--w-text)] mb-6"
              style={{ fontSize: "clamp(40px, 6vw, 76px)", lineHeight: 1.02, textWrap: "balance" }}
              data-testid="web-hero-headline"
            >
              Chat with your team — and 6&nbsp;AIs at once.
            </h1>
            <p
              className="text-[19px] leading-[30px] text-[var(--w-text-dim)] mb-8 max-w-[34ch]"
              style={{ textWrap: "pretty" }}
            >
              Ask ChatGPT, Claude, Gemini, DeepSeek, Perplexity and Grok the same question.
              Compare answers side-by-side. Turn decisions into tasks — without leaving the chat.
            </p>
            <HeroCtas />
            <p className="text-[12px] text-[var(--w-text-mute)]">
              Free forever · 300 AI credits / month · SOC 2 in flight
            </p>
          </div>

          {/* Product surface */}
          <div className="lg:col-span-5 relative">
            <div
              aria-hidden
              className="absolute -inset-8 rounded-[40px] pointer-events-none"
              style={{ background: "radial-gradient(60% 60% at 70% 30%, rgba(255,210,63,0.18), transparent)" }}
            />
            <div className="relative rounded-[24px] border border-[var(--w-hairline)] bg-[var(--w-bg-2)] shadow-[0_40px_80px_-32px_rgba(0,0,0,0.5)] overflow-hidden grid grid-cols-[140px_1fr] md:grid-cols-[180px_1fr] h-[480px]">
              <div className="border-r border-[var(--w-hairline)]">
                <ChatListPanel />
              </div>
              <div>
                <ChatDetailWithCompare />
              </div>
            </div>
            {/* Accessible text alternative */}
            <span className="sr-only">
              Product mockup: TeamNest chat sidebar with three chats. Main panel shows a user asking
              an AI compare question, with three model columns (GPT-4o, Claude Sonnet, Gemini Pro)
              showing one-sentence answers and confidence bars, plus a synthesize button.
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

function FeatureGlance() {
  const features = [
    { icon: Rocket,    title: "Dev OS Build Room",         body: "Chat → working app in ~60s. Five simple tabs: Chat, Preview, Tasks, Files, Release." },
    { icon: Bot,       title: "@devmanager",               body: "One AI engineer that plans, codes, runs QA and ships — no juggling sub-agents." },
    { icon: Terminal,  title: "Plain-English Builders",    body: "Business rules, roles & permissions, data models, workflows, forms, reports — no code." },
    { icon: Sparkles,  title: "6-model AI synthesizer",    body: "Ask ChatGPT, Claude, Gemini, DeepSeek, Perplexity, Grok at once." },
    { icon: MessageSquare, title: "Group chat that thinks", body: "Personal AI per user, billing per group, group AI research with @mentions." },
    { icon: Folder,    title: "Project folders",           body: "Memory, files, decisions persist across chats — every reply gets context." },
    { icon: Phone,     title: "AI-assisted calls",         body: "Live transcription, action items, summaries — built into every call." },
    { icon: ListChecks,title: "Tasks + Kanban + Bugs",     body: "Promote any chat line to a task. Tickets ship to GitHub PRs automatically." },
    { icon: Megaphone, title: "AI Employees",              body: "Dedicated personas: Bookkeeper, Marketing, Legal, Recruiter — they remember." },
    { icon: ShieldCheck, title: "Role Intelligence",       body: "Capture a role's approved work as institutional memory and hand it to a successor — identity-safe." },
    { icon: Brain,     title: "AI Memory",                 body: "Personal + workspace memory that learns your preferences and personalizes every answer." },
    { icon: Plug,      title: "Live Connectors",           body: "Gmail + Microsoft 365 / Teams (read-only) train AI employees in your real voice — redacted." },
    { icon: CheckCircle2, title: "Browser-tested builds",  body: "Every build runs a real headless-browser QA pass: loads, logs in, zero JS errors." },
    { icon: Briefcase, title: "Custom domains",            body: "Publish to /p/your-app, then serve it on your own domain with one CNAME." },
    { icon: Rocket,    title: "Templates + live demos",    body: "Start from working apps like AP Ledger — try the live demo before you build." },
  ];
  return (
    <section className="py-12 md:py-16 border-b border-[var(--w-border)]" data-testid="home-feature-glance">
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6">
        <Eyebrow className="mb-2">Everything in TeamNest</Eyebrow>
        <SectionTitle className="!text-[28px] md:!text-[36px] mb-8">
          One workspace. Fifteen superpowers.
        </SectionTitle>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {features.map((f) => (
            <div
              key={f.title}
              className="flex items-start gap-3 p-3 rounded-xl bg-[var(--w-card-bg)]/40 border border-[var(--w-border)] hover:border-amber-500/30 transition-colors"
            >
              <div className="w-7 h-7 rounded-lg bg-amber-500/15 text-amber-500 flex items-center justify-center shrink-0">
                <f.icon className="w-3.5 h-3.5" />
              </div>
              <div className="min-w-0">
                <div className="text-[13px] font-semibold text-[var(--w-text)] mb-0.5">{f.title}</div>
                <div className="text-[12px] leading-[18px] text-[var(--w-text-dim)]">{f.body}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}


// One chat — everything connected: compare AIs → decide → tasks → AI employees
// pick them up → @devmanager ships the software. Same thread, no app-switching.
function ConnectedStory() {
  const steps = [
    {
      icon: MessageSquare, accent: "text-sky-400",
      title: "It starts in chat",
      body: "Your team and 6 AIs share one thread. Ask a question once — ChatGPT, Claude, Gemini and more answer side-by-side.",
      chip: "@ai compare 3 — US or EU launch first?",
    },
    {
      icon: ListChecks, accent: "text-amber-400",
      title: "Decisions become tasks",
      body: "Highlight any message and turn it into a task with an owner and a due date — without leaving the conversation.",
      chip: "→ Task: “Draft EU pricing page” · @Priya · Fri",
    },
    {
      icon: Bot, accent: "text-emerald-400",
      title: "AI employees pick them up",
      body: "Assign tasks to hired AI employees — the CMO drafts the campaign, Sales writes the outreach, right in the thread.",
      chip: "@AI CMO owns “Launch campaign” · in progress",
    },
    {
      icon: Terminal, accent: "text-violet-400",
      title: "@devmanager ships the software",
      body: "Need a tool, not a doc? Your AI IT team turns the same conversation into a working, tested app you can publish.",
      chip: "@devmanager built “EU price calculator” ✓ smoke-tested",
    },
  ];
  return (
    <section className="py-16 md:py-24 bg-[var(--w-bg-2)]" data-testid="home-connected-story">
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6">
        <div className="max-w-[640px] mb-12">
          <Eyebrow className="mb-3">One collaborative surface</Eyebrow>
          <SectionTitle>
            Compare AIs. Assign tasks. Hire AI employees. Ship apps.{" "}
            <span className="text-amber-500">All in the same chat.</span>
          </SectionTitle>
          <SectionSub className="mt-4">
            TeamNest isn&apos;t five tools bolted together — it&apos;s one conversation where
            answers turn into decisions, decisions into tasks, and tasks into shipped work.
          </SectionSub>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {steps.map((s, i) => (
            <div
              key={s.title}
              data-testid={`connected-step-${i + 1}`}
              className="relative rounded-[20px] border border-[var(--w-hairline)] bg-[var(--w-surface)] p-6 flex flex-col"
            >
              <div className="flex items-center gap-2.5 mb-3">
                <span className="w-6 h-6 rounded-full bg-[var(--w-bg)] border border-[var(--w-hairline)] inline-flex items-center justify-center text-[11px] font-bold text-[var(--w-text-dim)]">
                  {i + 1}
                </span>
                <s.icon className={`w-5 h-5 ${s.accent}`} />
              </div>
              <div className="text-[16px] font-semibold text-[var(--w-text)] mb-2">{s.title}</div>
              <p className="text-[13.5px] leading-[21px] text-[var(--w-text-dim)] flex-1">{s.body}</p>
              <div className="mt-4 rounded-xl bg-[var(--w-bg)] border border-[var(--w-hairline)] px-3 py-2 text-[11.5px] font-mono text-[var(--w-text-mute)] truncate">
                {s.chip}
              </div>
              {i < steps.length - 1 && (
                <ArrowRight className="hidden xl:block absolute -right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--w-text-mute)] z-10" />
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function DevOsSection() {
  return (
    <section className="py-16 md:py-24 relative overflow-hidden" data-testid="home-devos-section">
      <div
        aria-hidden
        className="absolute -top-[100px] -left-[100px] w-[600px] h-[600px] rounded-full pointer-events-none"
        style={{ background: "radial-gradient(circle, rgba(255,210,63,0.10), transparent 60%)" }}
      />
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 relative">
        <div className="flex flex-col items-center text-center mb-12">
          <Pill tone="ai" className="mb-5">
            <Rocket className="w-3.5 h-3.5" />
            New · Dev OS — one AI engineer
          </Pill>
          <SectionTitle>
            Meet <span className="text-amber-500">@devmanager</span> — your whole dev team in one AI.
          </SectionTitle>
          <SectionSub className="max-w-[620px]">
            Describe your app in plain English. @devmanager plans it, builds it, tests it
            in a real browser, and publishes it to a live URL — even your own domain.
            No sub-agents to manage. No code to write.
          </SectionSub>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-5 mb-10">
          <DevOsFeatureCard
            icon={Bot}
            title="One agent. Every skill."
            body="@devmanager handles product planning, architecture, frontend, backend, QA, security and release — in first person, inside your chat. Say '@devmanager build me an inventory app' and watch it happen live."
          />
          <DevOsFeatureCard
            icon={Terminal}
            title="Builders — no code, just words"
            body="Guided builders for business rules, roles & permissions, data models, workflows, forms, reports and integrations. Fill in a sentence, @devmanager wires it into your app."
          />
          <DevOsFeatureCard
            icon={Rocket}
            title="Browser-tested, then live"
            body="Every build passes a real headless-browser QA gate — loads, logs in, zero JS errors. Then publish to /p/your-app or your own custom domain with one CNAME."
          />
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3">
          <PrimaryButton as={Link} to="/dev-os-guide" data-testid="home-devos-howto-cta">
            How Dev OS works <ArrowRight className="w-4 h-4" />
          </PrimaryButton>
          <GhostButton as={Link} to="/showcase" data-testid="home-devos-showcase-cta">
            See apps built with TeamNest
          </GhostButton>
        </div>
      </div>
    </section>
  );
}


function ShowcaseTeaser() {
  const [apps, setApps] = useState([]);
  useEffect(() => {
    fetch(`${process.env.REACT_APP_BACKEND_URL}/api/showcase`)
      .then((r) => (r.ok ? r.json() : { apps: [] }))
      .then((d) => setApps((d.apps || []).slice(0, 3)))
      .catch(() => {});
  }, []);
  return (
    <section className="py-16 md:py-20 border-t border-[var(--w-hairline)]" data-testid="home-showcase-teaser">
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
          <div>
            <Eyebrow className="mb-2">Built with TeamNest</Eyebrow>
            <SectionTitle className="!text-[28px] md:!text-[36px]">
              Real apps, shipped from a chat.
            </SectionTitle>
          </div>
          <GhostButton as={Link} to="/showcase" data-testid="home-showcase-see-all">
            Browse the showcase <ArrowRight className="w-4 h-4" />
          </GhostButton>
        </div>
        {apps.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {apps.map((app) => (
              <a
                key={app.slug}
                href={`/p/${app.slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="group rounded-2xl border border-[var(--w-hairline)] bg-[var(--w-surface)] p-5 hover:border-amber-500/40 transition-colors"
              >
                <div className="flex items-center gap-2 mb-1">
                  <div className="text-[15px] font-bold text-[var(--w-text)] truncate">{app.name}</div>
                  <span className="px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 text-[9px] font-bold uppercase tracking-wider">Live</span>
                </div>
                <p className="text-[12px] text-[var(--w-text-dim)] line-clamp-2">{app.tagline}</p>
              </a>
            ))}
          </div>
        ) : (
          <p className="text-[14px] text-[var(--w-text-mute)]">
            Publish your app and opt in from the Release tab to be featured here.
          </p>
        )}
      </div>
    </section>
  );
}

function DevOsFeatureCard({ icon: Icon, title, body }) {
  return (
    <div className="rounded-2xl p-5 bg-[var(--w-card-bg)] border border-[var(--w-border)] hover:border-amber-500/40 transition-colors">
      <div className="w-10 h-10 rounded-xl bg-amber-500/15 text-amber-500 flex items-center justify-center mb-3">
        <Icon className="w-5 h-5" />
      </div>
      <div className="text-[17px] font-semibold text-[var(--w-text)] mb-2">{title}</div>
      <div className="text-[14px] leading-[22px] text-[var(--w-text-dim)]">{body}</div>
    </div>
  );
}


function TrustLine() {
  // No fabricated logos. Quiet caption only — as per the brief.
  return (
    <section className="border-y border-[var(--w-hairline)] bg-[var(--w-bg)]/60">
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-10 text-center">
        <p className="text-[12px] uppercase tracking-[0.16em] font-semibold text-[var(--w-text-mute)]">
          Trusted by teams shipping fast
        </p>
      </div>
    </section>
  );
}

function HookSection() {
  return (
    <section className="bg-[var(--w-bg-2)] py-20 md:py-[120px]">
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6">
        <div className="text-center mb-12">
          <Eyebrow className="mb-3">The Hook</Eyebrow>
          <SectionTitle className="!text-[40px] sm:!text-[44px] mb-4">
            Six AIs. One thread. One synthesized answer.
          </SectionTitle>
          <SectionSub className="mx-auto text-center">
            Stop tab-juggling. Ask once. Compare side-by-side. Save the winner to a project.
          </SectionSub>
        </div>
        <SixModelStrip />
      </div>
    </section>
  );
}

function FeatureCard({ eyebrow, title, body, link, mock, span = "lg:col-span-6", icon: Icon }) {
  return (
    <div className={`group rounded-[20px] border border-[var(--w-hairline)] bg-[var(--w-surface)] overflow-hidden hover:border-[var(--w-hairline-strong)] transition-colors duration-200 flex flex-col ${span}`}>
      <div className="p-7 pb-4">
        <div className="flex items-center gap-2 mb-3">
          {Icon && (
            <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-[var(--w-brand-tint)] text-[var(--w-brand)]">
              <Icon className="w-3.5 h-3.5" />
            </span>
          )}
          <Eyebrow>{eyebrow}</Eyebrow>
        </div>
        <h3 className="text-[24px] font-bold tracking-[-0.01em] text-[var(--w-text)] mb-2" style={{ textWrap: "balance" }}>
          {title}
        </h3>
        <p className="text-[15px] leading-6 text-[var(--w-text-dim)] mb-3">{body}</p>
        <Link
          to={link}
          className="inline-flex items-center gap-1 text-[14px] font-semibold text-[var(--w-text-dim)] group-hover:text-[var(--w-brand)] transition-colors"
        >
          Learn more <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>
      <div className="px-7 pb-0 mt-auto">
        <div className="-mb-px translate-y-1">{mock}</div>
      </div>
    </div>
  );
}

function FeatureGrid() {
  return (
    <section className="py-20 md:py-[120px]">
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6">
        <div className="mb-12">
          <Eyebrow className="mb-3">The product</Eyebrow>
          <SectionTitle className="max-w-[24ch]">
            Everything a research-heavy team needs, in one inbox.
          </SectionTitle>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <FeatureCard
            span="lg:col-span-7"
            icon={MessageSquare}
            eyebrow="Group chat"
            title="Chat that knows your team."
            body="Direct messages, group chats, project chats, AI threads. @mention people, @task to create tasks, @ai to ask any model — all in one inbox."
            link="/product#chat"
            mock={<GroupChatMock />}
          />
          <FeatureCard
            span="lg:col-span-5"
            icon={ListChecks}
            eyebrow="Tasks"
            title="Decisions become tasks — automatically."
            body="Type @task in any message and TeamNest creates a task, assigns it, and reminds the right person on the due date."
            link="/product#tasks"
            mock={<TaskCardMock />}
          />
          <FeatureCard
            span="lg:col-span-5"
            icon={Phone}
            eyebrow="Calls"
            title="Calls with live captions."
            body="Audio, video, and screen-share calls. Real-time transcription with speaker tags. AI auto-summary the moment the call ends."
            link="/product#calls"
            mock={<CallTranscriptMock />}
          />
          <FeatureCard
            span="lg:col-span-7"
            icon={Folder}
            eyebrow="Project folders"
            title="Project folders save everything."
            body="Group chats, AI threads, tasks, decisions, files — all under one folder. Slice your workspace however your team thinks."
            link="/product#folders"
            mock={<FolderTabsMock />}
          />
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    {
      title: "Bring your team in.",
      body: "Create a workspace. Invite teammates by email. Make project folders for what you're working on.",
    },
    {
      title: "Ask any AI from any chat.",
      body: "Type @ai to ask one model, or 'compare 3 models' to fan out. Save the answer to a folder.",
    },
    {
      title: "Decisions become work.",
      body: "Type @task in any message and TeamNest creates a task, assigns it, and reminds the right person.",
    },
  ];
  return (
    <section className="bg-[var(--w-bg-2)] py-20 md:py-[120px]">
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6">
        <div className="text-center mb-12">
          <Eyebrow className="mb-3">How it works</Eyebrow>
          <SectionTitle>How TeamNest works.</SectionTitle>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
          {steps.map((s, i) => (
            <div key={s.title} className="flex flex-col gap-4">
              <div className="w-10 h-10 rounded-full bg-[var(--w-brand)] text-black font-bold text-[15px] flex items-center justify-center">
                {i + 1}
              </div>
              <h3 className="text-[22px] font-bold tracking-[-0.01em] text-[var(--w-text)]" style={{ textWrap: "balance" }}>
                {s.title}
              </h3>
              <p className="text-[15px] leading-6 text-[var(--w-text-dim)]">{s.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function AICompareDeepDive() {
  const stats = [
    { v: "6", label: "models you can ask in parallel" },
    { v: "300", label: "free AI credits, every month" },
    { v: "< 3s", label: "to all six answers, in flight together" },
  ];
  return (
    <section className="py-20 md:py-[120px]">
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
          <div className="lg:col-span-7">
            <Eyebrow tone="ai" className="mb-3">AI Compare</Eyebrow>
            <SectionTitle className="mb-4 max-w-[16ch]">
              One question, six answers, side-by-side.
            </SectionTitle>
            <SectionSub className="mb-8">
              We auto-synthesize the best answer so you don&apos;t have to compare them yourself.
            </SectionSub>
            <SixModelStrip />
          </div>
          <div className="lg:col-span-5 lg:sticky lg:top-24 space-y-4">
            {stats.map((s) => (
              <div key={s.label} className="rounded-[16px] border border-[var(--w-hairline)] bg-[var(--w-surface)] p-6">
                <div className="text-[40px] font-bold tracking-[-0.02em] text-[var(--w-brand)] leading-none mb-1">
                  {s.v}
                </div>
                <div className="text-[14px] text-[var(--w-text-dim)]">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function PricingTeaser() {
  const plans = [
    { name: "Free", price: "$0", line: "Best for trying it out.", credits: "300 credits / month" },
    { name: "Pro", price: "$9.99", unit: "/ seat / mo", line: "Pay per seat. Audio + video calls with transcription.", credits: "3,000 credits / seat" },
    { name: "Team", price: "$19.99", unit: "/ seat / mo", line: "Live transcription FREE + unlimited recordings.", credits: "9,000 credits / seat", highlighted: true },
  ];
  return (
    <section className="bg-[var(--w-bg-2)] py-20 md:py-[120px]">
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6">
        <div className="text-center mb-12">
          <Eyebrow className="mb-3">Pricing</Eyebrow>
          <SectionTitle>Built for AI usage.</SectionTitle>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 max-w-[960px] mx-auto">
          {plans.map((p) => (
            <div
              key={p.name}
              className={`relative rounded-[20px] border p-7 ${
                p.highlighted
                  ? "border-[var(--w-brand)] bg-[var(--w-brand-tint)]/30 shadow-[0_24px_60px_-32px_rgba(255,210,63,0.4)]"
                  : "border-[var(--w-hairline)] bg-[var(--w-surface)]"
              }`}
            >
              {p.highlighted && (
                <span className="absolute -top-2.5 right-5 px-2.5 py-1 rounded-full bg-[var(--w-brand)] text-black text-[10px] font-bold uppercase tracking-widest">
                  Most popular
                </span>
              )}
              <div className={`text-[15px] font-bold mb-1 ${p.highlighted ? "text-[var(--w-brand)]" : "text-[var(--w-text)]"}`}>
                {p.name}
              </div>
              <div className="text-[36px] font-bold tracking-tight text-[var(--w-text)] leading-none mb-3">
                {p.price}
                <span className="text-[14px] text-[var(--w-text-dim)] font-medium"> {p.unit || "/ mo"}</span>
              </div>
              <p className="text-[14px] text-[var(--w-text-dim)] mb-3">{p.line}</p>
              <p className="text-[13px] text-[var(--w-text-mute)]">{p.credits}</p>
            </div>
          ))}
        </div>
        <div className="text-center mt-10">
          <Link
            to="/pricing"
            data-testid="web-pricing-teaser-link"
            className="inline-flex items-center gap-1 text-[15px] font-semibold text-[var(--w-text-dim)] hover:text-[var(--w-brand)]"
          >
            See full plan comparison <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}

function FinalCTA() {
  return (
    <section className="bg-[var(--w-bg-2)] py-20 md:py-[120px]">
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 text-center">
        <Eyebrow className="mb-3">Start free</Eyebrow>
        <h2
          className="text-[40px] sm:text-[48px] leading-[1.1] font-bold tracking-[-0.02em] text-[var(--w-text)] mb-5 max-w-[20ch] mx-auto"
          style={{ textWrap: "balance" }}
        >
          Your team. Six AIs. One inbox.
        </h2>
        <p className="text-[17px] leading-7 text-[var(--w-text-dim)] mb-8 max-w-[56ch] mx-auto" style={{ textWrap: "pretty" }}>
          Free forever. No credit card. Spin up a workspace in under a minute.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <HeroCtas center />
          <GhostButton as={Link} to="/product">Read the docs</GhostButton>
        </div>
      </div>
    </section>
  );
}

const WHATS_NEW = [
  {
    icon: ShieldCheck,
    tag: "Enterprise",
    title: "Role Intelligence",
    body: "Capture a departing employee's approved work as institutional memory, then hand it to their successor — without sharing anyone's personal identity. Successor handoffs, an \"Ask the Role\" grounded chat, expertise & risk maps, and storage billing.",
    to: "/product",
  },
  {
    icon: Brain,
    tag: "New",
    title: "AI Memory",
    body: "Like ChatGPT/Claude memory, but for your team. The AI learns durable personal and workspace preferences from your chats and gets more tailored over time — say \"@ai remember …\" or manage everything from the AI Memory screen. You're always in control.",
    to: "/product",
  },
  {
    icon: Plug,
    tag: "New",
    title: "Live Connectors",
    body: "Connect Gmail and Microsoft 365 / Outlook / Teams (read-only) to train an AI employee in your real writing voice. Every sample is redacted before analysis — we learn style, not secrets — and you review before anything is saved.",
    to: "/product",
  },
  {
    icon: Bot,
    tag: "AI Employees",
    title: "AI Employee Builder + Marketplace",
    body: "Build, train and deploy AI teammates into your chats, then publish them to the marketplace with revenue share. Content-aware hiring suggests the right AI employee based on what a chat is actually about.",
    to: "/employees-info",
  },
];

function WhatsNewSection() {
  return (
    <section className="py-16 md:py-24 bg-[var(--w-bg-2)] border-b border-[var(--w-border)]" data-testid="home-whats-new">
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6">
        <Eyebrow className="mb-2">Just shipped</Eyebrow>
        <SectionTitle className="!text-[28px] md:!text-[36px] mb-3">New in TeamNest</SectionTitle>
        <SectionSub className="mb-10 max-w-[640px]">
          The latest capabilities that turn TeamNest from a chat app into an AI-native operating system for your team&apos;s knowledge and work.
        </SectionSub>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {WHATS_NEW.map((f) => (
            <Link
              key={f.title}
              to={f.to}
              data-testid={`whats-new-${f.title.toLowerCase().replace(/[^a-z]+/g, "-")}`}
              className="group flex flex-col p-6 rounded-2xl bg-[var(--w-card-bg)]/60 border border-[var(--w-border)] hover:border-amber-500/40 transition-colors"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/15 text-amber-500 flex items-center justify-center shrink-0">
                  <f.icon className="w-5 h-5" />
                </div>
                <span className="text-[11px] font-semibold uppercase tracking-wider text-amber-500 bg-amber-500/10 border border-amber-500/20 rounded-full px-2.5 py-1">{f.tag}</span>
              </div>
              <h3 className="text-[19px] font-bold text-[var(--w-text)] mb-2">{f.title}</h3>
              <p className="text-[14px] leading-[22px] text-[var(--w-text-dim)] flex-1">{f.body}</p>
              <span className="mt-4 inline-flex items-center gap-1.5 text-[13px] font-semibold text-amber-500">
                Learn more <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

export default function WebHome() {
  return (
    <>
      <SeoHelmet
        title="TeamNest.ai — Chat with your team, and 6 AIs at once."
        description="AI-native team chat. Ask ChatGPT, Claude, Gemini, DeepSeek, Perplexity and Grok the same question. Compare side-by-side. Turn decisions into tasks."
        path="/"
      />
      <Hero />
      <WhatsNewSection />
      <DevOsSection />
      <FeatureGlance />
      <ConnectedStory />
      <TrustLine />
      <ShowcaseTeaser />
      <HookSection />
      <FeatureGrid />
      <AIEmployeesHomeSection />
      <BuildAndEarnSection />
      <HowItWorks />
      <AICompareDeepDive />
      <PricingTeaser />
      <FinalCTA />
    </>
  );
}

const HOME_EMPLOYEES = [
  {
    key: "cmo",
    icon: Megaphone,
    name: "AI CMO",
    price: 149,
    hook: "Turn one-line briefs into 30-day marketing calendars.",
    bullets: ["Grand opening campaigns", "Meta + Google ad briefs", "Weekly performance reports"],
    accent: "amber",
  },
  {
    key: "sales",
    icon: Briefcase,
    name: "AI Sales Employee",
    price: 99,
    hook: "Research prospects + draft outreach + queue follow-ups.",
    bullets: ["Cold emails under 90 words", "5-step follow-up sequences", "Discovery call briefs"],
    accent: "emerald",
  },
  {
    key: "paralegal",
    icon: Scale,
    name: "AI Paralegal",
    price: 199,
    hook: "Extract every deadline + red flag from contracts.",
    bullets: ["Leases, LOIs, franchise agreements", "Side-by-side version diff", "Closing checklists"],
    accent: "violet",
  },
  {
    key: "bookkeeper",
    icon: Calculator,
    name: "AI QuickBooks Bookkeeper",
    price: 249,
    hook: "Categorize statements, ask staff in chat, sync to QuickBooks.",
    bullets: ["CSV / PDF / OFX import", "Suspense Q&A in your chat", "QuickBooks OAuth + write-back"],
    accent: "amber",
  },
];

const HOME_ACCENT_BG = {
  amber: "bg-amber-500/10 text-amber-500 border-amber-500/20",
  emerald: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  violet: "bg-violet-500/10 text-violet-500 border-violet-500/20",
};

function AIEmployeesHomeSection() {
  return (
    <section
      className="py-20 md:py-28 border-t border-[var(--w-hairline)] bg-[var(--w-surface)]"
      data-testid="home-ai-employees-section"
    >
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6">
        <div className="text-center max-w-3xl mx-auto mb-12">
          <Pill tone="ai" className="mb-5 mx-auto">
            <Sparkles className="w-3.5 h-3.5" /> New · Phase 6
          </Pill>
          <h2
            className="font-bold tracking-[-0.02em] text-[var(--w-text)] mb-4"
            style={{ fontSize: "clamp(32px, 5vw, 56px)", lineHeight: 1.05, textWrap: "balance" }}
          >
            Hire an AI employee. <span className="text-amber-500">Pay per role, not per seat.</span>
          </h2>
          <p className="text-[17px] leading-[26px] text-[var(--w-text-dim)]">
            Four specialized AI employees that live inside your TeamNest chats and projects.
            Fixed monthly fees, 7-day trials, included credits — they do the work, your team approves it.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {HOME_EMPLOYEES.map((emp) => {
            const Icon = emp.icon;
            const accentClass = HOME_ACCENT_BG[emp.accent] || HOME_ACCENT_BG.amber;
            return (
              <div
                key={emp.key}
                data-testid={`home-employee-${emp.key}`}
                className="border border-[var(--w-hairline)] rounded-2xl bg-[var(--w-bg)] p-6 flex flex-col gap-4 hover:border-amber-500/40 transition-colors"
              >
                <div className="flex items-start gap-4">
                  <div className={`w-12 h-12 rounded-2xl border flex items-center justify-center shrink-0 ${accentClass}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-[18px] font-bold tracking-tight text-[var(--w-text)]">{emp.name}</h3>
                    <p className="text-[13px] text-[var(--w-text-dim)] leading-snug mt-0.5">{emp.hook}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-[20px] font-bold text-[var(--w-text)] leading-none">${emp.price}</div>
                    <div className="text-[10px] font-mono uppercase tracking-widest text-[var(--w-text-dim)]">/mo</div>
                  </div>
                </div>
                <ul className="space-y-1.5">
                  {emp.bullets.map((b) => (
                    <li key={b} className="flex items-start gap-2 text-[13px] text-[var(--w-text)]">
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                      {b}
                    </li>
                  ))}
                </ul>
                <div className="flex items-center gap-2 mt-auto pt-1">
                  <Link
                    to="/employees-info"
                    data-testid={`home-employee-cta-${emp.key}`}
                    className="text-[12px] font-mono uppercase tracking-widest text-amber-500 hover:underline inline-flex items-center gap-1"
                  >
                    See what it does <ArrowRight className="w-3 h-3" />
                  </Link>
                  <span className="ml-auto text-[10px] font-mono uppercase tracking-widest text-[var(--w-text-dim)]">
                    7-day free trial
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        <div className="text-center mt-10">
          <PrimaryButton as={Link} to="/employees-info" data-testid="home-employees-explore-all">
            Explore all AI Employees <ArrowRight className="w-4 h-4" />
          </PrimaryButton>
        </div>
      </div>
    </section>
  );
}


const BUILD_EARN = [
  {
    icon: Bot,
    title: "Design unique AI employees",
    body: "Give an AI a role, train it on your SOPs & examples, teach it your voice, set its permissions and escalation rules — no code required.",
  },
  {
    icon: Rocket,
    title: "Publish to the marketplace",
    body: "List your best AI employees for other teams to hire. Set them free or price them — you keep control of what knowledge is shared.",
  },
  {
    icon: Sparkles,
    title: "Earn on every install",
    body: "When a team licenses your AI employee, you earn. Track installs and revenue from your creator dashboard.",
  },
];

function BuildAndEarnSection() {
  return (
    <section
      className="py-20 md:py-28 border-t border-[var(--w-hairline)]"
      data-testid="home-build-earn-section"
    >
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6">
        <div className="text-center max-w-3xl mx-auto mb-12">
          <Pill tone="ai" className="mb-5 mx-auto">
            <Sparkles className="w-3.5 h-3.5" /> AI Employee Builder · Beta
          </Pill>
          <h2
            className="font-bold tracking-[-0.02em] text-[var(--w-text)] mb-4"
            style={{ fontSize: "clamp(32px, 5vw, 56px)", lineHeight: 1.05, textWrap: "balance" }}
          >
            Build AI employees. <span className="text-amber-500">And earn from them.</span>
          </h2>
          <p className="text-[17px] leading-[26px] text-[var(--w-text-dim)]">
            Become an approved AI Employee Builder to create, train and sell custom agentic
            AI employees on the TeamNest marketplace. Apply for the Beta — or unlock it instantly
            on the Team plan ($19.99/mo).
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {BUILD_EARN.map((c) => {
            const Icon = c.icon;
            return (
              <div
                key={c.title}
                data-testid={`home-build-earn-${c.title.split(" ")[0].toLowerCase()}`}
                className="border border-[var(--w-hairline)] rounded-2xl bg-[var(--w-bg)] p-6 hover:border-amber-500/40 transition-colors"
              >
                <div className="w-12 h-12 rounded-2xl bg-amber-500/15 text-amber-500 border border-amber-500/20 flex items-center justify-center mb-4">
                  <Icon className="w-5 h-5" />
                </div>
                <h3 className="text-[18px] font-bold tracking-tight text-[var(--w-text)] mb-1.5">{c.title}</h3>
                <p className="text-[14px] leading-[21px] text-[var(--w-text-dim)]">{c.body}</p>
              </div>
            );
          })}
        </div>

        <div className="text-center mt-10">
          <PrimaryButton as={Link} to="/ai-builder" data-testid="home-build-earn-cta">
            Start building & earning <ArrowRight className="w-4 h-4" />
          </PrimaryButton>
        </div>
      </div>
    </section>
  );
}
