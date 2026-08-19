import { Link } from "react-router-dom";
import { ArrowRight, ShieldCheck, Building2, CalendarClock, Briefcase } from "lucide-react";
import { Eyebrow, PrimaryButton, GhostButton } from "@/components/web/atoms";
import { Reveal, EngineBackdrop, trackHomeEvent } from "@/components/web/home/primitives";

/* Prominent enterprise demo band — the primary "Request a Demo" path,
   positioned lower on the marketing homepage. */
export default function EnterpriseCTABand() {
  const points = [
    { icon: ShieldCheck, t: "Governance, audit logs & SSO" },
    { icon: Building2, t: "Departments, roles & permissions" },
    { icon: CalendarClock, t: "White-glove onboarding & migration" },
  ];
  return (
    <section
      id="enterprise-demo"
      className="relative py-16 md:py-20 px-5 border-t border-[var(--w-hairline)] scroll-mt-20"
      data-testid="home-enterprise-cta"
    >
      <EngineBackdrop tone="ai" />
      <div className="relative max-w-5xl mx-auto">
        <div className="rounded-[24px] border border-[var(--w-hairline)] bg-[var(--w-surface)] p-8 md:p-12 text-center">
          <Reveal>
            <Eyebrow tone="ai" className="mb-4 text-center">
              <span className="inline-flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5" /> For businesses &amp; enterprise
              </span>
            </Eyebrow>
          </Reveal>
          <Reveal delay={60}>
            <h2
              className="text-[30px] sm:text-[40px] leading-[1.08] font-bold tracking-[-0.02em] text-[var(--w-text)] max-w-[24ch] mx-auto"
              style={{ textWrap: "balance" }}
            >
              See how TeamNest keeps your organization&apos;s intelligence in-house.
            </h2>
          </Reveal>
          <Reveal delay={120}>
            <p className="mt-4 text-[17px] leading-7 text-[var(--w-text-dim)] max-w-[56ch] mx-auto">
              Get a personalized walkthrough for your team — governance, connectors, and how
              knowledge stays and transfers when people move on.
            </p>
          </Reveal>
          <Reveal delay={160}>
            <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
              <PrimaryButton
                as={Link}
                to="/support"
                data-testid="enterprise-demo-cta"
                onClick={() => trackHomeEvent("demo_request_click", { source: "enterprise_band" })}
              >
                Request a Demo <ArrowRight className="w-4 h-4" />
              </PrimaryButton>
              <GhostButton
                as={Link}
                to="/business"
                data-testid="enterprise-explore-cta"
                onClick={() => trackHomeEvent("explore_business_click", { source: "enterprise_band" })}
              >
                <Briefcase className="w-4 h-4" /> Explore TeamNest for Business
              </GhostButton>
            </div>
          </Reveal>
          <Reveal delay={200}>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
              {points.map((p) => (
                <span key={p.t} className="inline-flex items-center gap-2 text-[13px] text-[var(--w-text-mute)]">
                  <p.icon className="w-4 h-4 text-[var(--w-ai)]" /> {p.t}
                </span>
              ))}
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
