import { Link } from "react-router-dom";
import { ArrowRight, Brain, Briefcase } from "lucide-react";
import { PrimaryButton, GhostButton } from "@/components/web/atoms";
import { EngineBackdrop, Reveal, trackHomeEvent } from "@/components/web/home/primitives";

export default function FinalCTASection() {
  return (
    <section
      id="final-cta"
      className="relative py-24 md:py-32 px-5 border-t border-[var(--w-hairline)] bg-[var(--w-bg2)] overflow-hidden scroll-mt-20"
      data-testid="home-final-cta"
    >
      <EngineBackdrop tone="ai" />
      <div className="relative max-w-3xl mx-auto text-center">
        <Reveal>
          <div className="w-14 h-14 mx-auto mb-6 rounded-2xl bg-[var(--w-ai-tint)] border border-[var(--w-ai)]/40 flex items-center justify-center">
            <Brain className="w-7 h-7 text-[var(--w-ai)]" />
          </div>
          <h2 className="text-[34px] sm:text-[44px] lg:text-[52px] leading-[1.05] font-bold tracking-[-0.03em] text-[var(--w-text)]" style={{ textWrap: "balance" }}>
            Your next idea should not be lost in another chat.
          </h2>
          <p className="mt-5 text-[18px] leading-8 text-[var(--w-text-dim)] max-w-[56ch] mx-auto">
            Bring your research, people, tasks, files, and AI into one connected workspace.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <PrimaryButton as={Link} to="/signup" data-testid="final-start-free" onClick={() => trackHomeEvent("hero_start_free_click", { source: "final_cta" })}>
              Start Free <ArrowRight className="w-4 h-4" />
            </PrimaryButton>
            <GhostButton as={Link} to="/business" data-testid="final-explore-business" onClick={() => trackHomeEvent("explore_business_click", { source: "final_cta" })}>
              <Briefcase className="w-4 h-4" /> Explore Business
            </GhostButton>
          </div>
          <div className="mt-6 text-[13px] text-[var(--w-text-mute)]">
            Research, collaborate, and build knowledge that lasts.
          </div>
        </Reveal>
      </div>
    </section>
  );
}
