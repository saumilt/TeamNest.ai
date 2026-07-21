import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, Lock, Shield, RefreshCcw, ArrowRight } from "lucide-react";
import SeoHelmet from "@/components/web/SeoHelmet";
import { Eyebrow, SectionTitle, SectionSub, PrimaryButton, GhostButton } from "@/components/web/atoms";
import { PlanCard, FAQ } from "@/components/web/PlanCard";
import { useLaunchConfig } from "@/hooks/useLaunchConfig";

const MONTHLY_PLANS = [
  {
    id: "free",
    name: "Free",
    price: "$0",
    unit: "/ month",
    tagline: "For trying it out.",
    features: [
      "300 AI credits / month / workspace",
      "Group chat + AI threads",
      "1 workspace, 5 members",
      "Project folders + tasks",
      "Audio + video calls (credits apply)",
    ],
    cta: "Try the demo",
    cta_href: "/login?demo=1",
  },
  {
    id: "student",
    name: "Student",
    price: "$6.99",
    unit: "/ month",
    tagline: "For students. Solo AI, shared chats.",
    features: [
      "2,500 AI credits / month",
      "All AI models + multi-model comparison",
      "Invite classmates to collaborate",
      "AI stays solo — yours only",
      "Requires .edu email verification",
    ],
    cta: "Verify & start",
    cta_href: "/billing",
  },
  {
    id: "pro",
    name: "Pro",
    price: "$9.99",
    unit: "/ seat / month",
    tagline: "Pay only for the seats you use.",
    features: [
      "3,000 AI credits / seat / month",
      "All 6 AI models unlocked",
      "Audio + video calls",
      "Post-call transcription (10 credits/min)",
      "AI meeting summaries (20 credits/call)",
      "Screen sharing",
      "PDF / Word export",
    ],
    cta: "Start Pro",
    cta_href: "/login?plan=pro",
  },
  {
    id: "team",
    name: "Team",
    price: "$19.99",
    unit: "/ seat / month",
    tagline: "Per-seat. For teams running on AI.",
    highlighted: true,
    features: [
      "9,000 AI credits / seat / month",
      "Live transcription during calls (FREE)",
      "Unlimited recorded audio + video transcription",
      "Screen sharing",
      "AI meeting summaries (20 credits/call)",
      "Admin dashboard + roles",
      "Approval workflows",
      "Priority support",
    ],
    cta: "Start Team",
    cta_href: "/login?plan=team",
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price: "$29.99",
    unit: "/ seat / month",
    tagline: "For SOC2-bound teams. Custom pricing available.",
    features: [
      "Unlimited credits",
      "Bring your own AI keys",
      "SSO + SAML",
      "Custom DPA + sub-processors",
      "Dedicated CSM",
      "Volume & annual custom pricing",
    ],
    cta: "Talk to sales",
    cta_href: "/support",
  },
];

const ANNUAL_PLANS = MONTHLY_PLANS.map((p) => {
  if (p.id === "free") return p;
  if (p.id === "student") return { ...p, price: "$69", unit: "/ year", tagline: "Pay yearly · save 17%." };
  if (p.id === "pro") return { ...p, price: "$99", unit: "/ seat / year", tagline: "Pay yearly · save 17%." };
  if (p.id === "team") return { ...p, price: "$199", unit: "/ seat / year", tagline: "Pay yearly · save 17%." };
  if (p.id === "enterprise") return { ...p, price: "$299", unit: "/ seat / year", tagline: "Pay yearly · save 17%. Custom pricing available." };
  return p;
});

const CREDIT_TABLE = [
  { model: "GPT-4o mini · Claude Haiku · Gemini Flash", credits: "1–2" },
  { model: "GPT-4o · Claude Sonnet", credits: "9–23" },
  { model: "Claude Opus · GPT Pro", credits: "30–40" },
  { model: "DeepSeek · Perplexity · Grok", credits: "1–14" },
  { model: "Compare 3 models", credits: "~25" },
  { model: "Compare all 6 models + synthesis", credits: "~70" },
  { model: "Dev OS · @devmanager reply / coordination round", credits: "1" },
  { model: "Dev OS · full app build or talk-to-build edit", credits: "2" },
  { model: "Dev OS · /dev-os scan (improvement proposals)", credits: "5" },
  { model: "Dev OS · GitHub PR export · Vercel/Netlify deploy", credits: "0 (free)" },
  { model: "Voice · 1 min Whisper transcription", credits: "8" },
  { model: "Image · 1 Nano Banana 1024×1024", credits: "49" },
];

const HOSTING_TIERS = [
  { key: "shared", name: "Shared hosting", price: 0,
    features: ["Shared MongoDB cluster", "512 MB database storage", "teamnest.app subdomain", "Community support"] },
  { key: "pro-db", name: "Pro Database", price: 19, featured: true,
    features: ["5 GB dedicated MongoDB", "Daily automated backups", "Custom domains included", "Email support"] },
  { key: "dedicated", name: "Dedicated", price: 99,
    features: ["Isolated cluster + 50 GB storage", "Point-in-time recovery", "99.9% uptime SLA", "Priority support"] },
];

const AI_EMPLOYEE_PRICING = [
  { key: "devmanager", name: "@devmanager", price: 199, featured: true,
    note: "+ AI credits (cost + margin)",
    line: "Your entire IT team: plans, builds, tests and ships working apps from chat." },
  { key: "cmo", name: "AI CMO", price: 149, note: "7-day trial · 500 credits",
    line: "Campaign calendars, ad briefs, email copy, weekly reports." },
  { key: "sales", name: "AI Sales", price: 99, note: "7-day trial · 300 credits",
    line: "Prospect research, cold outreach, follow-up sequences." },
  { key: "paralegal", name: "AI Paralegal", price: 199, note: "7-day trial · 500 credits",
    line: "Contract review, clause extraction, document drafting." },
  { key: "bookkeeper", name: "AI Bookkeeper", price: 249, note: "7-day trial · 500 credits",
    line: "QuickBooks categorization, reconciliation, monthly closes." },
];

const FAQ_ITEMS = [
  {
    q: "What counts as 1 credit?",
    a: "1 credit ≈ one short message from a fast model (GPT-4o mini, Claude Haiku, Gemini Flash). Premium models like Claude Sonnet cost ~9–23 credits depending on response length, and Compare-all-6 costs around 70.",
  },
  {
    q: "Do unused credits roll over?",
    a: "No. Credits reset on the first of every month. We do credit you for any month the service is degraded — see the status page for the SLA terms.",
  },
  {
    q: "Can I bring my own API keys?",
    a: "Yes, on Enterprise. Plug in your OpenAI, Anthropic, or Google keys and we route AI calls through them — your usage, your bill. Available with a custom DPA.",
  },
  {
    q: "Is my data used to train models?",
    a: "Never. We use OpenAI's, Anthropic's, and Google's enterprise APIs (no training opt-in). Your messages, files, and AI threads stay in your workspace and are encrypted at rest.",
  },
  {
    q: "How does annual billing work?",
    a: "Annual gives you 17% off the monthly rate, billed upfront. Switch back to monthly any time — your remaining credits and members come with you.",
  },
  {
    q: "How do I cancel?",
    a: "Open Billing → Cancel subscription. Your plan stays active until the end of the current period, then downgrades to Free. No customer-support gates.",
  },
];

function PlanToggle({ mode, onChange }) {
  return (
    <div
      role="radiogroup"
      aria-label="Billing period"
      className="inline-flex p-1 rounded-full border border-[var(--w-hairline)] bg-[var(--w-surface)]"
    >
      {[
        { id: "monthly", label: "Monthly" },
        { id: "annual", label: "Annual · save 17%" },
      ].map((m) => (
        <button
          key={m.id}
          role="radio"
          aria-checked={mode === m.id}
          data-testid={`pricing-toggle-${m.id}`}
          onClick={() => onChange(m.id)}
          className={`px-4 h-9 rounded-full text-[13px] font-semibold transition-colors ${
            mode === m.id
              ? "bg-[var(--w-brand)] text-black"
              : "text-[var(--w-text-dim)] hover:text-[var(--w-text)]"
          }`}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}

function CreditTable() {
  const [open, setOpen] = useState(false);
  return (
    <div className="max-w-[960px] mx-auto mt-16 mb-16">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between gap-4 px-5 py-4 rounded-[14px] border border-[var(--w-hairline)] hover:border-[var(--w-hairline-strong)] bg-[var(--w-surface)] transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-[15px] font-semibold text-[var(--w-text)]">Show credit costs per model</span>
          <span className="text-[12px] text-[var(--w-text-mute)]">(transparent, in-app)</span>
        </div>
        <ChevronDown className={`w-5 h-5 text-[var(--w-text-dim)] transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="mt-3 rounded-[14px] border border-[var(--w-hairline)] bg-[var(--w-surface)] overflow-hidden">
          <table className="w-full text-[14px]">
            <thead className="bg-[var(--w-surface-2)]">
              <tr>
                <th className="text-left px-5 py-3 font-semibold text-[var(--w-text-dim)]">Model / Action</th>
                <th className="text-right px-5 py-3 font-semibold text-[var(--w-text-dim)]">Credits / message</th>
              </tr>
            </thead>
            <tbody>
              {CREDIT_TABLE.map((r) => (
                <tr key={r.model} className="border-t border-[var(--w-hairline)]">
                  <td className="px-5 py-3 text-[var(--w-text)]">{r.model}</td>
                  <td className="px-5 py-3 text-right font-mono text-[var(--w-text-dim)]">{r.credits}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function TrustStrip() {
  const badges = [
    { icon: Lock, label: "Stripe payments" },
    { icon: Shield, label: "SOC 2 in flight" },
    { icon: RefreshCcw, label: "14-day money-back" },
  ];
  return (
    <div className="max-w-[960px] mx-auto grid grid-cols-1 sm:grid-cols-3 gap-4">
      {badges.map((b) => (
        <div
          key={b.label}
          className="flex items-center gap-3 p-4 rounded-[14px] border border-[var(--w-hairline)] bg-[var(--w-surface)]"
        >
          <b.icon className="w-5 h-5 text-[var(--w-text-dim)]" />
          <span className="text-[14px] text-[var(--w-text)]">{b.label}</span>
        </div>
      ))}
    </div>
  );
}

export default function WebPricing() {
  const [mode, setMode] = useState("monthly");
  const cfg = useLaunchConfig();
  const plans = mode === "annual" ? ANNUAL_PLANS : MONTHLY_PLANS;
  // Pricing is always public — even during invite-only. When the workspace isn't
  // fully open, we surface a banner noting checkout is limited to invited members,
  // but the plans and prices are always visible.
  const previewOnly = cfg && cfg.mode !== "open" && !cfg.allow_public_pricing;
  return (
    <>
      <SeoHelmet
        title="Pricing · TeamNest.ai"
        description="Pay only for the seats you use. Free $0, Pro $9.99/seat/mo (3,000 credits), Team $19.99/seat/mo (9,000 credits + free live transcription), Enterprise $29.99/seat/mo (custom pricing available)."
        path="/pricing"
      />

      <section className="pt-16 pb-12">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 text-center">
          <Eyebrow className="mb-3">Pricing</Eyebrow>
          <SectionTitle className="!text-[48px] sm:!text-[56px] mb-5 max-w-[20ch] mx-auto">
            Pricing built for AI usage.
          </SectionTitle>
          <SectionSub className="mx-auto text-center mb-8">
            Every plan starts free with 300 AI credits per month. Premium models charge more credits per response.
          </SectionSub>
          {previewOnly && (
            <div className="mx-auto max-w-[520px] mb-6 rounded-2xl border border-amber-500/25 bg-amber-500/[0.05] px-5 py-3 text-[13px] text-[var(--w-text-dim)]" data-testid="pricing-preview-banner">
              Preview only — <Link to="/waitlist" className="text-amber-500 font-semibold">join the waitlist</Link> to unlock early pricing. Checkout is disabled during the private beta.
            </div>
          )}
          <PlanToggle mode={mode} onChange={setMode} />
        </div>
      </section>

      <section>
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-5">
            {plans.map((p) => (
              <PlanCard key={p.id} plan={p} highlighted={p.highlighted} />
            ))}
          </div>
        </div>
      </section>

      <section>
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6">
          <CreditTable />
        </div>
      </section>

      {/* AI Employees pricing */}
      <section className="py-16" data-testid="pricing-employees-section">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6">
          <div className="text-center mb-10">
            <Eyebrow className="mb-3">AI Employees</Eyebrow>
            <SectionTitle className="!text-[32px] sm:!text-[36px] mb-3">
              Hire a role, not a seat.
            </SectionTitle>
            <SectionSub className="mx-auto text-center">
              Specialized AI employees work inside your chats for a fixed monthly fee.
              Their AI usage is billed as credits.
            </SectionSub>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
            {AI_EMPLOYEE_PRICING.map((e) => (
              <div
                key={e.name}
                data-testid={`pricing-employee-${e.key}`}
                className={`relative rounded-[20px] border p-6 ${
                  e.featured
                    ? "border-amber-500/50 bg-amber-500/[0.04]"
                    : "border-[var(--w-hairline)] bg-[var(--w-surface)]"
                }`}
              >
                {e.featured && (
                  <span className="absolute -top-2.5 right-5 px-2.5 py-1 rounded-full bg-amber-500 text-black text-[10px] font-bold uppercase tracking-widest">
                    Your IT team
                  </span>
                )}
                <div className={`text-[14px] font-bold mb-1 ${e.featured ? "text-amber-500" : "text-[var(--w-text)]"}`}>
                  {e.name}
                </div>
                <div className="text-[30px] font-bold tracking-tight text-[var(--w-text)] leading-none mb-2">
                  ${e.price}
                  <span className="text-[13px] text-[var(--w-text-dim)] font-medium"> /mo</span>
                </div>
                <p className="text-[12px] text-[var(--w-text-mute)] mb-3">{e.note}</p>
                <p className="text-[13px] text-[var(--w-text-dim)] leading-5">{e.line}</p>
              </div>
            ))}
          </div>
          <div className="text-center mt-8">
            <GhostButton as={Link} to="/employees-info" data-testid="pricing-employees-link">
              Meet the AI employees <ArrowRight className="w-4 h-4" />
            </GhostButton>
          </div>
        </div>
      </section>

      {/* Hosting add-ons */}
      <section className="py-16" data-testid="pricing-hosting-section">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6">
          <div className="text-center mb-10">
            <Eyebrow className="mb-3">Hosting add-ons</Eyebrow>
            <SectionTitle className="!text-[32px] sm:!text-[36px] mb-3">
              Infrastructure billed separately, by tier.
            </SectionTitle>
            <SectionSub className="mx-auto text-center">
              Apps you build and publish run on TeamNest infrastructure — MongoDB, storage
              and bandwidth are membership add-ons on top of your plan.
            </SectionSub>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {HOSTING_TIERS.map((h) => (
              <div key={h.key} data-testid={`pricing-hosting-${h.key}`}
                className={`rounded-[20px] border p-6 ${h.featured ? "border-amber-500/50 bg-amber-500/[0.04]" : "border-[var(--w-hairline)] bg-[var(--w-surface)]"}`}>
                <div className="text-[14px] font-bold text-[var(--w-text)] mb-1">{h.name}</div>
                <div className="text-[30px] font-bold tracking-tight text-[var(--w-text)] leading-none mb-3">
                  {h.price === 0 ? "Included" : `$${h.price}`}
                  {h.price > 0 && <span className="text-[13px] text-[var(--w-text-dim)] font-medium"> /mo</span>}
                </div>
                <ul className="space-y-2 mb-4">
                  {h.features.map((f) => (
                    <li key={f} className="text-[13px] text-[var(--w-text-dim)] flex items-start gap-2">
                      <span className="text-emerald-500 mt-0.5">✓</span> {f}
                    </li>
                  ))}
                </ul>
                <GhostButton as={Link} to="/billing" className="w-full justify-center" data-testid={`hosting-cta-${h.key}`}>
                  {h.price === 0 ? "Included in every plan" : "Add from Billing →"}
                </GhostButton>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16">
        <div className="max-w-[800px] mx-auto px-4 sm:px-6">
          <div className="text-center mb-10">
            <Eyebrow className="mb-3">FAQ</Eyebrow>
            <SectionTitle className="!text-[32px] sm:!text-[36px]">Questions, asked often.</SectionTitle>
          </div>
          <FAQ items={FAQ_ITEMS} />
        </div>
      </section>

      <section className="py-16 bg-[var(--w-bg-2)]">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 space-y-10">
          <TrustStrip />
          <div className="text-center">
            <PrimaryButton as={Link} to="/login?demo=1" data-testid="web-pricing-cta">
              Try the demo — no signup
            </PrimaryButton>
            <p className="mt-3 text-[12px] text-[var(--w-text-mute)]">
              Or <Link to="/support" className="underline">talk to sales</Link> for Enterprise.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
