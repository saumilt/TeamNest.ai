import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { WebThemeProvider } from "@/context/WebThemeContext";
import SeoHelmet from "@/components/web/SeoHelmet";
import NavV2 from "@/components/web/home/NavV2";
import FooterV2 from "@/components/web/home/FooterV2";
import Hero from "@/components/web/home/Hero";
import AudienceCards from "@/components/web/home/AudienceCards";
import ProblemSection from "@/components/web/home/ProblemSection";
import MultiModelSection from "@/components/web/home/MultiModelSection";
import HumanAiSection from "@/components/web/home/HumanAiSection";
import {
  PersonalSection, StudentSection, TeamSection, BusinessSection,
} from "@/components/web/home/AudienceSections";
import { UseCasesSection, CapabilitiesSection } from "@/components/web/home/UseCasesSection";
import PlansSection from "@/components/web/home/PlansSection";
import FinalCTASection from "@/components/web/home/FinalCTASection";

/* ============================================================================
   TeamNest.ai — Public homepage (route: "/" and "/v2").
   Broadened positioning: an AI Collaboration Workspace for Individuals,
   Students, Teams, and Businesses. Enterprise knowledge-continuity is retained
   as the advanced business use case (see BusinessSection), not the whole story.
   Old enterprise-only homepage preserved at /legacy.
   ========================================================================== */

/** Smoothly scroll to a hash target when arriving via /#section links. */
function useHashScroll() {
  const { hash } = useLocation();
  useEffect(() => {
    if (!hash) return;
    const id = hash.replace("#", "");
    const el = document.getElementById(id);
    if (el) {
      requestAnimationFrame(() =>
        el.scrollIntoView({ behavior: "smooth", block: "start" })
      );
    }
  }, [hash]);
}

export default function WebHomeV2() {
  useHashScroll();
  return (
    <WebThemeProvider forceDark>
      <SeoHelmet
        title="TeamNest.ai — AI Collaboration Workspace for People and Teams"
        description="Use multiple AI models, collaborate with people, organize research, manage tasks, and build lasting knowledge in one connected workspace. Built for individuals, students, teams, and businesses."
        path="/"
      />
      <div className="min-h-screen bg-[var(--w-bg)] text-[var(--w-text)]">
        <NavV2 />
        <main className="pt-16">
          <Hero />
          <AudienceCards />
          <ProblemSection />
          <MultiModelSection />
          <HumanAiSection />
          <PersonalSection />
          <StudentSection />
          <TeamSection />
          <BusinessSection />
          <UseCasesSection />
          <CapabilitiesSection />
          <PlansSection />
          <FinalCTASection />
        </main>
        <FooterV2 />
      </div>
    </WebThemeProvider>
  );
}
