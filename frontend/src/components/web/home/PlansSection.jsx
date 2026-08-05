import { Link } from "react-router-dom";
import { Check, ArrowRight } from "lucide-react";
import { Eyebrow, SectionTitle, SectionSub } from "@/components/web/atoms";
import { Reveal, trackHomeEvent } from "@/components/web/home/primitives";

const PLANS = [
  {
    id: "personal", name: "TeamNest Personal", tone: "brand",
    for: "For individuals conducting research and managing personal projects.",
    features: ["Personal workspace", "AI research", "Files and tasks", "Personal knowledge", "Monthly AI credits"],
    cta: "Start Free", href: "/signup", event: "pricing_plan_click",
  },
  {
    id: "student", name: "TeamNest Student", tone: "ai",
    for: "For students and academic project groups.",
    features: ["Student workspaces", "Group projects", "Shared research", "Tasks and deadlines", "Education pricing"],
    cta: "Start Free", href: "/signup", event: "pricing_plan_click",
  },
  {
    id: "team", name: "TeamNest Team", tone: "brand", highlighted: true,
    for: "For startups, groups, and small organizations.",
    features: ["Shared workspaces", "Team chat", "AI collaboration", "Projects and tasks", "Shared knowledge"],
    cta: "Start Free", href: "/signup", event: "pricing_plan_click",
  },
  {
    id: "business", name: "TeamNest Business", tone: "ai",
    for: "For growing organizations.",
    features: ["Departments", "Role Intelligence", "Connectors", "Administration", "Knowledge continuity"],
    cta: "View Plans", href: "/pricing", event: "pricing_plan_click",
  },
  {
    id: "enterprise", name: "TeamNest Enterprise", tone: "brand",
    for: "For large and regulated organizations.",
    features: ["SSO", "Private cloud", "Data residency", "Retention controls", "Advanced governance"],
    cta: "Contact Sales", href: "/support", event: "demo_request_click",
  },
];

function PlanCol({ plan }) {
  const ai = plan.tone === "ai";
  return (
    <div
      data-testid={`plan-${plan.id}`}
      className={`relative flex flex-col rounded-[20px] border p-6 h-full transition-all duration-300 ${
        plan.highlighted
          ? "border-[var(--w-brand)] bg-[var(--w-brand-tint)]/20 shadow-[0_30px_70px_-40px_rgba(255,210,63,0.5)]"
          : "border-[var(--w-hairline)] bg-[var(--w-surface)] hover:border-[var(--w-hairline-strong)]"
      }`}
    >
      {plan.highlighted && (
        <span className="absolute top-4 right-4 px-2.5 py-1 rounded-full bg-[var(--w-brand)] text-black text-[10px] font-bold uppercase tracking-widest">
          Popular
        </span>
      )}
      <div className={`text-[15px] font-bold mb-1.5 ${plan.highlighted ? "text-[var(--w-brand)]" : "text-[var(--w-text)]"}`}>
        {plan.name}
      </div>
      <p className="text-[12.5px] leading-5 text-[var(--w-text-dim)] mb-4 min-h-[52px]">{plan.for}</p>
      <ul className="space-y-2 mb-6 flex-1">
        {plan.features.map((f) => (
          <li key={f} className="flex items-start gap-2 text-[13px] leading-5 text-[var(--w-text-dim)]">
            <Check className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${ai ? "text-[var(--w-ai)]" : "text-[var(--w-green)]"}`} />
            {f}
          </li>
        ))}
      </ul>
      <Link
        to={plan.href}
        data-testid={`plan-cta-${plan.id}`}
        onClick={() => trackHomeEvent(plan.event, { plan: plan.id })}
        className={`inline-flex items-center justify-center gap-1.5 h-11 rounded-[12px] font-semibold text-[14px] transition-all active:scale-[0.97] ${
          plan.highlighted
            ? "bg-[var(--w-brand)] text-black hover:brightness-95"
            : "border border-[var(--w-hairline-strong)] text-[var(--w-text)] hover:bg-[var(--w-surface2)]"
        }`}
      >
        {plan.cta} <ArrowRight className="w-3.5 h-3.5" />
      </Link>
    </div>
  );
}

export default function PlansSection() {
  return (
    <section id="plans" className="relative py-20 md:py-24 px-5 border-t border-[var(--w-hairline)] scroll-mt-20" data-testid="home-plans">
      <div className="max-w-6xl mx-auto">
        <Reveal className="max-w-3xl mb-12">
          <Eyebrow tone="default" className="mb-4">Plans for every audience</Eyebrow>
          <SectionTitle>One platform, right-sized for how you work.</SectionTitle>
          <SectionSub className="mt-5">
            Start free and grow into a team, business, or enterprise plan whenever you&apos;re ready.
          </SectionSub>
        </Reveal>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 items-stretch">
          {PLANS.map((p, i) => (
            <Reveal key={p.id} delay={i * 60} className="h-full">
              <PlanCol plan={p} />
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
