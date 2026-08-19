import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Sparkles, MessageSquareText, Users, Bot, Rocket, ChevronRight,
  ChevronLeft, X, GitBranch,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";

/**
 * "Welcome to TeamNest — 60 second tour"
 *
 * Auto-fires once per browser session after a successful demo-login. Uses
 * sessionStorage so a single evaluator sees it once but every new device /
 * session gets the full walkthrough.
 *
 * Important UX rule: the tour MUST NOT block the rest of the app. Earlier
 * versions used a modal `<Dialog>` whose backdrop captured all clicks, so
 * users trying to navigate (e.g. click "Home" in the sidebar) saw their
 * clicks silently swallowed. We now render the tour as a non-modal floating
 * card in the bottom-right corner — it stays out of the way and any
 * sidebar / page interaction works as expected. Navigating to a new route
 * auto-dismisses the tour.
 */
const SESSION_FLAG = "tn:show-welcome-tour";
const seenKey = (uid) => `tn:welcomed:${uid}`;

function SlideHero({ icon: Icon, accent = "bg-amber-400/15 text-amber-200" }) {
  return (
    <div className={`w-12 h-12 rounded-2xl ${accent} ring-1 ring-white/10 flex items-center justify-center mb-3`}>
      <Icon className="w-6 h-6" />
    </div>
  );
}

function MockBubble({ name, color, text }) {
  return (
    <div className="flex-1 min-w-0 rounded-xl bg-surface-2/60 ring-1 ring-hairline p-2.5">
      <div className={`text-[10px] uppercase tracking-wider font-semibold ${color}`}>{name}</div>
      <div className="text-[11px] text-ink-dim mt-1 leading-snug line-clamp-3">{text}</div>
    </div>
  );
}

export default function WelcomeTour() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  // "demo" = the sales walkthrough after a demo-login; "welcome" = the short
  // first-time nudge (chat / AI compare / invite) shown once per real user.
  const [variant, setVariant] = useState("demo");

  useEffect(() => {
    if (!user) return;
    if (typeof window === "undefined") return;
    if (window.sessionStorage.getItem(SESSION_FLAG) === "1") {
      setVariant("demo");
      setOpen(true);
      setStep(0);
      return;
    }
    try {
      if (!window.localStorage.getItem(seenKey(user.id))) {
        setVariant("welcome");
        setOpen(true);
        setStep(0);
      }
    } catch { /* ignore */ }
  }, [user]);

  useEffect(() => {
    if (!open) return;
    try { window.sessionStorage.removeItem(SESSION_FLAG); } catch { /* ignore */ }
  }, [open]);

  // Allow replaying the intro on demand (Profile → "Show welcome again").
  useEffect(() => {
    const replay = () => { setVariant("welcome"); setStep(0); setOpen(true); };
    window.addEventListener("tn:replay-welcome", replay);
    return () => window.removeEventListener("tn:replay-welcome", replay);
  }, []);

  const close = (markSeen = true) => {
    setOpen(false);
    if (markSeen && typeof window !== "undefined") {
      try { window.sessionStorage.removeItem(SESSION_FLAG); } catch { /* ignore */ }
      if (variant === "welcome" && user?.id) {
        try { window.localStorage.setItem(seenKey(user.id), "1"); } catch { /* ignore */ }
      }
    }
  };

  // Short first-time welcome for real sign-ups/invitees: the three things that
  // matter on day one — team chat, comparing AIs, and inviting teammates.
  const welcomeSlides = useMemo(() => [
    {
      key: "w-welcome",
      hero: <SlideHero icon={Sparkles} />,
      eyebrow: "Welcome",
      title: "Welcome to TeamNest",
      body: (
        <>
          Your team&apos;s chat with AI built in. Here are the three things worth
          knowing on day one.
        </>
      ),
      cta: "Show me",
    },
    {
      key: "w-chat",
      hero: <SlideHero icon={MessageSquareText} accent="bg-cyan-400/15 text-cyan-200" />,
      eyebrow: "1 of 3",
      title: "Chat with your team",
      body: (
        <>
          Create group or direct chats, organise them in folders, and start
          calls — all in real time from the <b>Chats</b> tab.
        </>
      ),
      cta: "Next",
      jumpLabel: "Open chats",
      jumpTo: "/chats",
    },
    {
      key: "w-ai",
      hero: <SlideHero icon={MessageSquareText} accent="bg-emerald-400/15 text-emerald-200" />,
      eyebrow: "2 of 3",
      title: "Compare AIs side-by-side",
      body: (
        <>
          Type <code className="px-1 py-0.5 rounded bg-surface-2 text-amber-200 text-[12px]">@ai</code> in
          any chat and pick <b>ChatGPT</b>, <b>Claude</b>, and <b>Gemini</b> — get
          all three answers in the same thread to compare.
        </>
      ),
      mock: (
        <div className="flex gap-2 mt-3">
          <MockBubble name="ChatGPT" color="text-emerald-300" text="Use Postgres with row-level security for multi-tenant data." />
          <MockBubble name="Claude" color="text-orange-300" text="Postgres + RLS is solid — split write paths early." />
          <MockBubble name="Gemini" color="text-blue-300" text="RLS for tenant scoping, then read replicas as you grow." />
        </div>
      ),
      cta: "Next",
    },
    {
      key: "w-invite",
      hero: <SlideHero icon={Users} accent="bg-fuchsia-400/15 text-fuchsia-200" />,
      eyebrow: "3 of 3",
      title: "Invite your teammates",
      body: (
        <>
          Start a <b>New Chat</b> and use <b>Invite someone new</b> to email
          teammates an invite — they&apos;re added to the group automatically. You
          can paste several emails at once.
        </>
      ),
      cta: "Got it — let's go",
      jumpLabel: "Invite teammates",
      jumpTo: "/chats?new=group",
    },
  ], []);

  const demoSlides = useMemo(() => [
    {
      key: "welcome",
      hero: <SlideHero icon={Sparkles} />,
      eyebrow: "60 second tour",
      title: "Welcome to TeamNest",
      body: (
        <>
          The AI-native team chat where every conversation can spin up
          research, tasks, calls, and a full dev team — without leaving the
          message thread.
        </>
      ),
      body2: "Five quick stops. Skip any time.",
      cta: "Start tour",
    },
    {
      key: "ask-ai",
      hero: <SlideHero icon={MessageSquareText} accent="bg-cyan-400/15 text-cyan-200" />,
      eyebrow: "Slide 1 of 4",
      title: "Ask any AI, side-by-side",
      body: (
        <>
          Type <code className="px-1 py-0.5 rounded bg-surface-2 text-amber-200 text-[12px]">@ai</code> in any
          chat — the picker shows <b>ChatGPT</b>, <b>Claude</b>, and <b>Gemini</b>.
          Pick one, or pick all three to compare their answers side-by-side in
          the same thread.
        </>
      ),
      mock: (
        <div className="flex gap-2 mt-3">
          <MockBubble name="ChatGPT" color="text-emerald-300" text="Postgres with row-level security is the safest default for multi-tenant SaaS data." />
          <MockBubble name="Claude" color="text-orange-300" text="Postgres + RLS is solid — split write paths early to save you in year 2." />
          <MockBubble name="Gemini" color="text-blue-300" text="RLS for tenant scoping, then per-tenant read replicas once you cross 1k orgs." />
        </div>
      ),
      cta: "Next",
    },
    {
      key: "hire-employees",
      hero: <SlideHero icon={Users} accent="bg-fuchsia-400/15 text-fuchsia-200" />,
      eyebrow: "Slide 2 of 4",
      title: "Hire AI employees in seconds",
      body: (
        <>
          Open the <b>Hire</b> tab to add specialised AI teammates —
          <b> Accountant</b>, <b>Marketer</b>, <b>Sales SDR</b>, <b>HR</b>,
          <b> Lawyer</b>, <b>Designer</b>, <b>Researcher</b> and more.
        </>
      ),
      mock: (
        <div className="grid grid-cols-3 gap-2 mt-3">
          {[
            ["AI Accountant", "📒"],
            ["AI Marketer", "📣"],
            ["AI Sales SDR", "💼"],
            ["AI HR", "🧑‍💼"],
            ["AI Lawyer", "⚖️"],
            ["AI Designer", "🎨"],
          ].map(([n, e]) => (
            <div key={n} className="rounded-lg bg-surface-2/60 ring-1 ring-hairline p-1.5 flex items-center gap-1.5">
              <span className="text-sm">{e}</span>
              <span className="text-[10px] text-ink-dim truncate">{n}</span>
            </div>
          ))}
        </div>
      ),
      cta: "Next",
      jumpLabel: "Open Hire tab",
      jumpTo: "/employees",
    },
    {
      key: "dev-mention",
      hero: <SlideHero icon={Bot} accent="bg-emerald-400/15 text-emerald-200" />,
      eyebrow: "Slide 3 of 4",
      title: "Summon @devmanager in any chat",
      body: (
        <>
          Type <code className="px-1 py-0.5 rounded bg-surface-2 text-amber-200 text-[12px]">@devmanager</code>{" "}
          in any chat — <b>one AI that runs your whole dev team</b>: planning,
          architecture, frontend, backend, QA and release. It replies right
          in the thread and can open real GitHub PRs.
        </>
      ),
      mock: (
        <div className="mt-3 rounded-xl bg-surface-2/60 ring-1 ring-hairline p-2.5 space-y-1.5">
          {[
            ["Dev Manager", "Coordinates the team"],
            ["Architect", "System design + schemas"],
            ["Frontend Dev", "React + UI + a11y"],
            ["QA", "Tests + edge cases"],
          ].map(([n, d]) => (
            <div key={n} className="flex items-center gap-2 text-[11px]">
              <div className="w-5 h-5 rounded-full bg-emerald-400/15 text-emerald-200 flex items-center justify-center text-[9px] font-semibold">
                {n.split(" ").map(w => w[0]).join("")}
              </div>
              <div className="font-medium text-ink">{n}</div>
              <div className="text-ink-dim truncate">{d}</div>
            </div>
          ))}
        </div>
      ),
      cta: "Next",
      jumpLabel: "Open Engineering chat",
      jumpTo: "/chats",
    },
    {
      key: "hire-team",
      hero: <SlideHero icon={Rocket} accent="bg-amber-400/15 text-amber-200" />,
      eyebrow: "Slide 4 of 4",
      title: "Hire @devmanager for $199",
      body: (
        <>
          Click the <b className="text-amber-200">Hire @devmanager · $199</b> pill
          in any chat header. One-time payment — we&apos;ll attach your AI dev
          manager and spin up a linked Dev OS project — code, builds, GitHub
          PRs, deploys, all from the chat.
        </>
      ),
      mock: (
        <div className="mt-3 flex items-center gap-2 rounded-xl bg-amber-400/10 ring-1 ring-amber-400/30 p-2.5">
          <GitBranch className="w-4 h-4 text-amber-200 shrink-0" />
          <div className="text-[11px] text-ink">
            Branch → build → preview → PR → deploy, all from one chat thread.
          </div>
        </div>
      ),
      cta: "Got it — let's go",
      jumpLabel: "Open Franchise OS",
      jumpTo: "/dev-os",
    },
  ], []);

  const slides = variant === "demo" ? demoSlides : welcomeSlides;
  const slide = slides[step];
  const isFirst = step === 0;
  const isLast = step === slides.length - 1;

  const handleNext = () => {
    if (isLast) { close(); return; }
    setStep(step + 1);
  };

  const handleJump = (path) => {
    close();
    nav(path);
  };

  if (!open || !slide) return null;

  // Non-modal floating card — pinned to the bottom-right, dismissable, never
  // captures clicks outside its own bounds. Replaces the previous Dialog
  // implementation that blocked navigation by covering the screen.
  return (
    <div
      data-testid="welcome-tour-card"
      role="dialog"
      aria-label="Welcome tour"
      className="fixed z-40 right-4 bottom-4 md:right-6 md:bottom-6 w-[calc(100vw-2rem)] sm:w-[420px] max-w-[420px] pointer-events-auto"
    >
      <div className="rounded-2xl bg-surface ring-1 ring-hairline shadow-2xl overflow-hidden">
        {/* Top accent bar */}
        <div className="h-1 bg-gradient-to-r from-amber-400 via-fuchsia-400 to-cyan-400" />

        <div className="p-5 relative">
          {/* Close (skip) */}
          <button
            type="button"
            onClick={() => close()}
            data-testid="welcome-tour-skip"
            className="absolute top-3 right-3 text-ink-dim hover:text-ink p-1 rounded-md hover:bg-surface-2"
            aria-label="Skip tour"
            title="Skip"
          >
            <X className="w-4 h-4" />
          </button>

          {slide.hero}

          <div className="text-[10px] uppercase tracking-[0.18em] text-ink-dim font-medium">
            {slide.eyebrow}
          </div>
          <h2 className="text-lg font-semibold text-ink mt-1 leading-tight pr-6">
            {slide.title}
          </h2>
          <p className="text-[13px] text-ink-dim leading-relaxed mt-2">
            {slide.body}
          </p>
          {slide.body2 && (
            <p className="text-[12px] text-ink-dim leading-relaxed mt-1.5">
              {slide.body2}
            </p>
          )}

          {slide.mock}

          {/* Progress dots */}
          <div className="flex items-center gap-1.5 mt-5">
            {slides.map((s, i) => (
              <span
                key={s.key}
                className={`h-1.5 rounded-full transition-all ${i === step ? "w-5 bg-amber-300" : "w-1.5 bg-ink-dim/40"}`}
              />
            ))}
          </div>

          {/* Nav buttons */}
          <div className="flex items-center justify-between mt-4 gap-2">
            <button
              type="button"
              onClick={() => !isFirst && setStep(step - 1)}
              disabled={isFirst}
              data-testid="welcome-tour-prev"
              className="inline-flex items-center gap-1 h-8 px-2.5 rounded-pill text-[12px] text-ink-dim hover:text-ink disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              Back
            </button>

            <div className="flex items-center gap-2">
              {slide.jumpTo && (
                <button
                  type="button"
                  onClick={() => handleJump(slide.jumpTo)}
                  data-testid={`welcome-tour-jump-${slide.key}`}
                  className="inline-flex items-center gap-1 h-8 px-3 rounded-pill bg-surface-2 hover:bg-surface-3 ring-1 ring-hairline text-[12px] text-ink"
                >
                  {slide.jumpLabel}
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                type="button"
                onClick={handleNext}
                data-testid="welcome-tour-next"
                className="inline-flex items-center gap-1 h-8 px-3.5 rounded-pill bg-amber-300 hover:bg-amber-200 text-black font-semibold text-[12px] active:scale-[0.98]"
              >
                {slide.cta}
                {!isLast && <ChevronRight className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
