import { Link } from "react-router-dom";
import {
  Sparkles, ArrowRight, Megaphone, Calculator, Briefcase, Scale,
  TrendingUp, UtensilsCrossed, Receipt, CheckCircle2, Quote, ShieldCheck,
  TerminalSquare, Bot, Store, Rocket,
} from "lucide-react";
import SeoHelmet from "@/components/web/SeoHelmet";
import { Eyebrow, Pill, PrimaryButton, GhostButton, SectionTitle, SectionSub } from "@/components/web/atoms";

const EMPLOYEES = [
  {
    key: "devmanager", icon: TerminalSquare, accent: "emerald",
    name: "@devmanager — your IT team", price: 199, trial: "$199/mo + AI credits",
    tagline: "Hire an entire IT department as one AI employee.",
    pain: "Custom software takes agencies months and five-figure quotes — and internal tools never make it off the backlog.",
    promise: "@devmanager plans, builds, tests and ships working web apps from plain-English chat. It runs the whole Dev OS: data models, roles, workflows, releases — you just describe what you need.",
    wins: [
      "Working app from a one-sentence brief — plan, code, tests, preview",
      "Plain-English Builders: data models, roles & permissions, workflows",
      "Automated headless-browser smoke tests on every build",
      "One-click publish with custom domain support",
      "Sell what you build on the Template Store and keep 70%",
    ],
    example: '"@devmanager build an accounts payable tracker with approval roles."',
    output: "→ Full working app: ledger, role-based approvals, reports — previewed, tested and ready to publish.",
    status: "active",
  },
  {
    key: "cmo", icon: Megaphone, accent: "amber",
    name: "AI CMO", price: 149, trial: "7-day · 500 credits",
    tagline: "Your fractional CMO that ships campaigns, not slide decks.",
    pain: "Marketing is the first thing that slips when you're running a restaurant, franchise, or development project.",
    promise: "AI CMO turns a one-sentence brief into a 30-day calendar, Meta + Google ad briefs, email copy, and weekly performance summaries — all in TeamNest where your team can react in real time.",
    wins: [
      "30-day grand opening campaigns for new restaurant locations",
      "Franchise-lead generation flows with HubSpot-ready CRM notes",
      "Real estate project marketing (residential, mixed-use, retail)",
      "Local SEO + Google Business Profile playbooks",
      "Weekly performance reports as readable summaries, not dashboards",
    ],
    example: '"@AI CMO create a grand opening campaign for Max Brenner Dallas."',
    output: "→ 30-day calendar, $7,500 budget split, 12 organic posts, 4 paid creatives, partnership outreach list.",
    status: "active",
  },
  {
    key: "sales", icon: Briefcase, accent: "emerald",
    name: "AI Sales Employee", price: 99, trial: "7-day · 300 credits",
    tagline: "Hire a sales development rep for the price of one coffee a day.",
    pain: "Sales reps spend 60% of their week on research, drafting cold emails, and chasing follow-ups instead of closing.",
    promise: "AI Sales researches prospects, writes outreach that doesn't get flagged as spam, builds discovery briefs, and queues follow-up sequences — your reps just hit send.",
    wins: [
      "Bulk prospect research with company / role / why-now signals",
      "Cold emails under 90 words tuned to your tone of voice",
      "3-step / 5-step / 7-step follow-up sequences with timing",
      "Discovery call briefs with 5 questions to ask",
      "CRM-ready notes ready to paste into HubSpot / Salesforce",
    ],
    example: '"@AI Sales draft a follow-up email to this investor."',
    output: "→ 78-word email, subject line A/B, sent-time recommendation, next 3 touch-points scheduled.",
    status: "active",
  },
  {
    key: "paralegal", icon: Scale, accent: "violet",
    name: "AI Paralegal Associate", price: 199, trial: "7-day · 500 credits",
    tagline: "Read a 60-page contract in 90 seconds. Surface every deadline.",
    pain: "Founders sign LOIs, leases, and franchise agreements they don't fully read. Lawyers cost $400/hr to summarize.",
    promise: "AI Paralegal extracts every deadline, obligation, cure period, indemnity clause, and red flag — formatted for your attorney to verify in 10 minutes instead of 4 hours.",
    wins: [
      "Purchase agreements, leases, franchise contracts, LOIs, NDAs",
      "Side-by-side version comparisons with diff highlights",
      "Closing checklists with every exhibit + signature line tracked",
      "Default-and-cure-period extraction with calendar reminders",
      "Attorney question lists ready for the next call",
    ],
    example: '"@AI Paralegal extract all cure periods and deadlines."',
    output: "→ 14 deadlines table, 7 obligations, 3 red flags flagged for attorney, calendar reminders queued.",
    disclaimer: "Not legal advice. Designed for attorney review.",
    status: "active",
  },
  {
    key: "bookkeeper", icon: Calculator, accent: "amber",
    name: "AI QuickBooks Bookkeeper", price: 249, trial: "7-day · 500 credits",
    tagline: "Stop paying your bookkeeper $1,200/mo to categorize Stripe payouts.",
    pain: "Bookkeeping is 80% repetitive categorization and 20% judgment. You're paying CPA rates for both.",
    promise: "Upload a CSV, PDF, or OFX statement. AI categorizes every row against your chart of accounts, asks your team about suspense items in chat, learns reusable rules, and pushes approved entries to QuickBooks Online — with a human approval gate before every sync.",
    wins: [
      "CSV, PDF, OFX, QBO statements — all parsed automatically",
      "Auto-categorization against your real QuickBooks chart of accounts",
      "Suspense items asked as @-mentions in TeamNest chat",
      "Rules engine learns from every approval (saves credits)",
      "Reconciliation workflow with QB ending balance vs statement",
      "Direct QuickBooks Online OAuth + sandbox + production write-back",
    ],
    example: '"Upload May Chase business statement. Categorize and ask Priya about anything unknown."',
    output: "→ 87 transactions: 71 auto-matched, 12 suggested, 4 suspense flagged for Priya in chat.",
    disclaimer: "Not a CPA or tax advisor. Final classifications require qualified review.",
    status: "active",
  },
  {
    key: "financial_modeler", icon: TrendingUp, accent: "blue",
    name: "AI Financial Modeler", price: 299, trial: "Coming soon",
    tagline: "Investor-grade waterfalls in 10 minutes, not 10 days.",
    pain: "Hiring a development analyst to build a waterfall takes 3 weeks and costs $15,000. Most projects need three models, not one.",
    promise: "AI Financial Modeler builds development pro formas, rental property models, and complex investor waterfalls with preferred returns, IRR hurdles, and GP promote tiers — exported in Excel format.",
    wins: [
      "Development pro formas (mixed-use, multifamily, retail)",
      "8% pref + 20% promote after 15% IRR waterfalls",
      "Refinance vs sale scenario comparisons",
      "Construction + permanent loan modeling with interest reserves",
      "Sensitivity tables across cap rate, rent growth, exit timing",
    ],
    example: '"@AI Financial Modeler waterfall for $50M multifamily, 9% pref, 20% promote at 15% IRR."',
    output: "→ Sources & uses, IRR/equity-multiple table, GP/LP distributions, exit cap sensitivity matrix.",
    disclaimer: "Not a licensed advisor. Models are for review by qualified professionals.",
    status: "coming_soon",
  },
  {
    key: "restaurant_orders", icon: UtensilsCrossed, accent: "rose",
    name: "AI Restaurant Order Taking", price: 199, trial: "Coming soon",
    tagline: "Answer every phone call and chat — even at 2am on Saturday.",
    pain: "Restaurants lose 30% of phone orders during peak hours because staff can't pick up. Every missed call is $40 walking out.",
    promise: "AI Restaurant takes orders by phone and website chat, answers menu questions, upsells items, sends SMS confirmations, and routes orders to your POS or kitchen dashboard.",
    wins: [
      "Phone order taking via Twilio Voice + ElevenLabs",
      "Website chat ordering for pickup and delivery",
      "Menu Q&A from a structured menu (no hallucinations)",
      "Smart upsells based on order context",
      "Toast / Square / Clover / DoorDash / Uber Eats handoff",
    ],
    example: '"AI, what time does the kitchen close for delivery in Frisco tonight?"',
    output: "→ Real-time POS check, customer answered, lead captured, SMS sent.",
    status: "coming_soon",
  },
  {
    key: "bill_pay", icon: Receipt, accent: "cyan",
    name: "AI Bill Pay / Accounts Payable", price: 249, trial: "Coming soon",
    tagline: "Invoice in. Approval routed. Payment scheduled. Audit trail forever.",
    pain: "AP teams spend 12 hours/week chasing approvals on $50 invoices because nobody owns the inbox.",
    promise: "AI Bill Pay ingests invoices, matches vendors, detects duplicates, routes approvals through TeamNest chat, and prepares Bill.com / bank payment batches.",
    wins: [
      "Email + portal + chat-attachment invoice intake",
      "Vendor matching with W-9 / 1099 tracking",
      "Duplicate invoice detection against last 24 months",
      "Approval routing rules (amount, vendor, project, GL code)",
      "Bill.com payment batch scheduling after final approval",
    ],
    example: '"3 invoices arrived for Thakkar Developers. Route to Sahil for >$5,000."',
    output: "→ 1 routed to Sahil ($12,400), 2 auto-approved (<$5k vendor on whitelist).",
    status: "coming_soon",
  },
];

const TESTIMONIALS = [
  {
    quote: "We replaced our $1,800/mo bookkeeping firm with AI QuickBooks Bookkeeper. Three months in we've saved $5,200 and our books close on the 3rd of the month, not the 23rd.",
    name: "Operations Director",
    role: "Restaurant group, 4 locations",
  },
  {
    quote: "AI CMO drafted our entire grand opening calendar for two new locations in one afternoon. My head of marketing said it's better than the deck the agency charged us $25k for.",
    name: "Franchise Owner",
    role: "QSR concept, Texas",
  },
  {
    quote: "AI Paralegal flagged a cure period in our lease that our lawyer missed. Saved us a $45k claim against our security deposit.",
    name: "Founder",
    role: "Real estate development, Dallas",
  },
];

const ACCENTS = {
  amber: "bg-amber-500/10 text-amber-500 border-amber-500/20",
  emerald: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  violet: "bg-violet-500/10 text-violet-500 border-violet-500/20",
  blue: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  rose: "bg-rose-500/10 text-rose-500 border-rose-500/20",
  cyan: "bg-cyan-500/10 text-cyan-500 border-cyan-500/20",
};

function EmployeeHero({ emp }) {
  const Icon = emp.icon;
  const accentClass = ACCENTS[emp.accent] || ACCENTS.amber;
  const isComingSoon = emp.status === "coming_soon";
  return (
    <article
      data-testid={`employee-marketing-${emp.key}`}
      className="border border-[var(--w-hairline)] rounded-[20px] bg-[var(--w-surface)] overflow-hidden"
    >
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-0">
        <div className={`lg:col-span-4 p-8 ${accentClass} border-b lg:border-b-0 lg:border-r`}>
          <div className="w-14 h-14 rounded-2xl bg-[var(--w-bg)]/40 flex items-center justify-center mb-5">
            <Icon className="w-7 h-7" />
          </div>
          <h3 className="text-[24px] font-bold tracking-tight text-[var(--w-text)] mb-1">{emp.name}</h3>
          <div className="flex items-baseline gap-2 mb-4">
            <span className="text-[32px] font-bold text-[var(--w-text)]">${emp.price}</span>
            <span className="text-[12px] text-[var(--w-text-dim)] font-mono">/ month</span>
          </div>
          <div className="text-[11px] font-mono uppercase tracking-widest text-[var(--w-text-dim)] mb-3">
            {emp.trial}
          </div>
          {isComingSoon ? (
            <div className="inline-flex items-center gap-1.5 px-2.5 h-7 rounded-full bg-[var(--w-bg)]/40 text-[10px] font-mono uppercase tracking-widest">
              Coming soon · join waitlist
            </div>
          ) : (
            <Link
              to="/login"
              data-testid={`employee-cta-${emp.key}`}
              className="inline-flex items-center gap-1.5 px-4 h-10 rounded-full bg-[var(--w-text)] text-[var(--w-bg)] hover:opacity-90 text-[13px] font-semibold transition-opacity"
            >
              Start free trial <ArrowRight className="w-4 h-4" />
            </Link>
          )}
        </div>

        <div className="lg:col-span-8 p-8 space-y-5">
          <p className="text-[20px] leading-[28px] font-semibold tracking-tight text-[var(--w-text)]">
            {emp.tagline}
          </p>
          <div>
            <div className="text-[11px] font-mono uppercase tracking-widest text-[var(--w-text-dim)] mb-1.5">
              The problem
            </div>
            <p className="text-[14px] leading-[22px] text-[var(--w-text-dim)]">{emp.pain}</p>
          </div>
          <div>
            <div className="text-[11px] font-mono uppercase tracking-widest text-[var(--w-text-dim)] mb-1.5">
              The fix
            </div>
            <p className="text-[14px] leading-[22px] text-[var(--w-text-dim)]">{emp.promise}</p>
          </div>
          <div>
            <div className="text-[11px] font-mono uppercase tracking-widest text-[var(--w-text-dim)] mb-2">
              What it does
            </div>
            <ul className="space-y-1.5">
              {emp.wins.map((w) => (
                <li key={w} className="flex items-start gap-2 text-[13px] text-[var(--w-text)]">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                  {w}
                </li>
              ))}
            </ul>
          </div>
          <div className="border-l-2 border-[var(--w-hairline)] pl-4 py-1 bg-[var(--w-bg)]/40 rounded-r-lg">
            <div className="text-[12px] font-mono text-[var(--w-text-dim)] mb-1">Example command</div>
            <div className="text-[13px] font-mono text-[var(--w-text)]">{emp.example}</div>
            <div className="text-[12px] text-[var(--w-text-dim)] mt-1.5">{emp.output}</div>
          </div>
          {emp.disclaimer && (
            <div className="flex items-start gap-1.5 text-[11px] text-[var(--w-text-mute)] italic">
              <ShieldCheck className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              {emp.disclaimer}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

const BUILDER_VALUES = [
  {
    icon: Bot,
    title: "Design unique AI employees",
    body: "Give an AI a role, train it on your SOPs and examples, teach it your voice, and set its permissions and escalation rules — no code required.",
  },
  {
    icon: Store,
    title: "Publish to the marketplace",
    body: "List your best AI employees for other teams to hire. Offer them free or price them — you stay in control of exactly what knowledge is shared.",
  },
  {
    icon: Rocket,
    title: "Earn on every install",
    body: "When a team licenses your AI employee, you earn. Track installs and revenue from your creator dashboard, with a weekly performance digest.",
  },
];

function BuildYourOwnSection() {
  return (
    <section
      className="py-16 md:py-20 bg-[var(--w-surface)] border-y border-[var(--w-hairline)]"
      data-testid="employees-build-own-section"
    >
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6">
        <div className="text-center max-w-3xl mx-auto">
          <Pill tone="ai" className="mb-5 mx-auto">
            <Sparkles className="w-3.5 h-3.5" /> AI Employee Builder · Beta
          </Pill>
          <SectionTitle>Build AI employees. And earn from them.</SectionTitle>
          <SectionSub>
            Don&apos;t just hire ours — create, train and sell your own custom AI employees on the
            TeamNest marketplace. Apply for the Beta, or unlock it instantly on the Team plan
            ($19.99/mo).
          </SectionSub>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mt-10">
          {BUILDER_VALUES.map((c) => {
            const Icon = c.icon;
            return (
              <div
                key={c.title}
                data-testid={`employees-build-own-${c.title.split(" ")[0].toLowerCase()}`}
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

        <div className="flex flex-wrap items-center justify-center gap-3 mt-10">
          <PrimaryButton as={Link} to="/ai-builder" data-testid="employees-build-own-cta">
            Start building &amp; earning <ArrowRight className="w-4 h-4" />
          </PrimaryButton>
          <GhostButton as={Link} to="/pricing">See plans</GhostButton>
        </div>
      </div>
    </section>
  );
}

export default function EmployeesMarketing() {
  const active = EMPLOYEES.filter((e) => e.status === "active");
  const comingSoon = EMPLOYEES.filter((e) => e.status === "coming_soon");
  return (
    <>
      <SeoHelmet
        title="AI Employees · TeamNest.ai"
        description="Hire specialized AI employees inside TeamNest. AI CMO, AI Sales, AI Paralegal, AI QuickBooks Bookkeeper. 7-day free trials, fixed monthly fees, work alongside your real team in chat."
        path="/employees-info"
      />
      {/* Hero */}
      <section className="relative pt-20 pb-16 md:pt-24 md:pb-20 overflow-hidden">
        <div
          aria-hidden
          className="absolute -top-[200px] -right-[200px] w-[700px] h-[700px] rounded-full pointer-events-none"
          style={{ background: "radial-gradient(circle, rgba(255,210,63,0.10), transparent 60%)" }}
        />
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 relative text-center">
          <Pill tone="ai" className="mb-6 mx-auto">
            <Sparkles className="w-3.5 h-3.5" /> Phase 6 · Specialized AI Employees
          </Pill>
          <h1
            className="font-bold tracking-[-0.03em] text-[var(--w-text)] mb-5 mx-auto"
            style={{ fontSize: "clamp(40px, 6vw, 72px)", lineHeight: 1.02, textWrap: "balance" }}
            data-testid="employees-marketing-headline"
          >
            Hire an AI employee. <span className="text-amber-500">Pay per role, not per seat.</span>
          </h1>
          <p
            className="text-[19px] leading-[30px] text-[var(--w-text-dim)] mb-8 max-w-[44ch] mx-auto"
            style={{ textWrap: "pretty" }}
          >
            Five specialized AI employees that live inside your TeamNest chats and projects —
            including <span className="text-amber-500 font-semibold">@devmanager</span>, an entire
            IT team in one hire. Fixed monthly fees. Real work, every week.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 mb-8">
            <PrimaryButton as={Link} to="/login?demo=1" data-testid="employees-marketing-try-cta">
              Try the demo <ArrowRight className="w-4 h-4" />
            </PrimaryButton>
            <GhostButton as={Link} to="/pricing">See pricing</GhostButton>
          </div>
          {/* Quick scan */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 max-w-4xl mx-auto mt-12">
            {active.map((e) => {
              const Icon = e.icon;
              return (
                <a
                  key={e.key}
                  href={`#${e.key}`}
                  data-testid={`employee-jump-${e.key}`}
                  className="border border-[var(--w-hairline)] rounded-2xl p-4 bg-[var(--w-surface)] hover:border-amber-500/40 transition-colors text-left"
                >
                  <Icon className="w-5 h-5 mb-2" />
                  <div className="text-[13px] font-semibold text-[var(--w-text)]">{e.name}</div>
                  <div className="text-[11px] text-[var(--w-text-dim)] font-mono">${e.price}/mo</div>
                </a>
              );
            })}
          </div>
        </div>
      </section>

      {/* Active employees */}
      <section className="py-16 md:py-20">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6">
          <Eyebrow>Active now · 7-day free trial</Eyebrow>
          <SectionTitle>Five employees ready to work in your TeamNest today.</SectionTitle>
          <SectionSub>
            Each one comes with included monthly AI credits, lives inside your team chats, and
            never acts on sensitive work without human approval.
          </SectionSub>
          <div className="space-y-6 mt-10">
            {active.map((e) => (
              <div key={e.key} id={e.key}>
                <EmployeeHero emp={e} />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-16 md:py-20 bg-[var(--w-surface)] border-y border-[var(--w-hairline)]">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6">
          <Eyebrow>Real outcomes</Eyebrow>
          <SectionTitle>What teams ship with their AI employees.</SectionTitle>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mt-10">
            {TESTIMONIALS.map((t) => (
              <div
                key={`${t.name}-${t.role}`}
                className="border border-[var(--w-hairline)] rounded-2xl p-6 bg-[var(--w-bg)]"
              >
                <Quote className="w-5 h-5 text-amber-500 mb-3" />
                <p className="text-[14px] leading-[22px] text-[var(--w-text)] mb-4 italic">
                  &ldquo;{t.quote}&rdquo;
                </p>
                <div className="text-[12px] font-semibold text-[var(--w-text)]">{t.name}</div>
                <div className="text-[11px] text-[var(--w-text-dim)] font-mono">{t.role}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Coming soon */}
      <section className="py-16 md:py-20">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6">
          <Eyebrow>On the roadmap</Eyebrow>
          <SectionTitle>Coming next.</SectionTitle>
          <SectionSub>Three more employees in active development. Join the waitlist for early access.</SectionSub>
          <div className="space-y-6 mt-10">
            {comingSoon.map((e) => (
              <div key={e.key} id={e.key}>
                <EmployeeHero emp={e} />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Build your own (AI Employee Builder + Marketplace) */}
      <BuildYourOwnSection />

      {/* Final CTA */}
      <section className="py-20 md:py-24 text-center">
        <div className="max-w-[800px] mx-auto px-4 sm:px-6">
          <h2
            className="font-bold tracking-[-0.02em] text-[var(--w-text)] mb-5"
            style={{ fontSize: "clamp(32px, 5vw, 56px)", lineHeight: 1.05 }}
          >
            Stop hiring more people. Start hiring better ones.
          </h2>
          <p className="text-[17px] leading-[26px] text-[var(--w-text-dim)] mb-8">
            Start with any one employee. 7 days free. Cancel anytime.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <PrimaryButton as={Link} to="/login?demo=1" data-testid="employees-final-cta">
              Start free trial <ArrowRight className="w-4 h-4" />
            </PrimaryButton>
            <GhostButton as={Link} to="/pricing">Compare plans</GhostButton>
          </div>
        </div>
      </section>
    </>
  );
}
