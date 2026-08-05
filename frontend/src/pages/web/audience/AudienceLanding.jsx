import { WebThemeProvider } from "@/context/WebThemeContext";
import SeoHelmet from "@/components/web/SeoHelmet";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import NavV2 from "@/components/web/home/NavV2";
import FooterV2 from "@/components/web/home/FooterV2";
import { Eyebrow, PrimaryButton, GhostButton } from "@/components/web/atoms";
import { EngineBackdrop, Reveal, trackHomeEvent } from "@/components/web/home/primitives";
import MultiModelSection from "@/components/web/home/MultiModelSection";
import HumanAiSection from "@/components/web/home/HumanAiSection";
import { UseCasesSection, CapabilitiesSection } from "@/components/web/home/UseCasesSection";
import {
  PersonalSection, StudentSection, TeamSection, BusinessSection,
} from "@/components/web/home/AudienceSections";
import PlansSection from "@/components/web/home/PlansSection";
import FinalCTASection from "@/components/web/home/FinalCTASection";

const SECTION_MAP = {
  personal: PersonalSection,
  student: StudentSection,
  team: TeamSection,
  business: BusinessSection,
  multimodel: MultiModelSection,
  humanai: HumanAiSection,
  usecases: UseCasesSection,
  capabilities: CapabilitiesSection,
};

const CONFIG = {
  individuals: {
    tone: "brand", eyebrow: "For individuals",
    title: "Your work, research, and AI — in one place.",
    sub: "Organize personal research, compare AI answers, and build a knowledge system that grows with you.",
    primary: ["Start Free", "/signup"], secondary: ["Explore for Business", "/business"],
    sections: ["personal", "multimodel", "usecases"],
    seo: {
      title: "TeamNest for Individuals — Personal AI Research Workspace",
      description: "Organize personal research, compare multiple AI models, manage projects and files, and build a personal knowledge workspace that grows with you.",
    },
  },
  students: {
    tone: "ai", eyebrow: "For students",
    title: "Built for smarter group projects.",
    sub: "Collaborate with classmates, assign tasks, research with multiple AI models, and publish only your best findings.",
    primary: ["Create a Student Project", "/signup"], secondary: ["See how it works", "/#human-ai"],
    sections: ["student", "humanai", "multimodel"],
    seo: {
      title: "TeamNest for Students — Smarter Group Projects with AI",
      description: "A collaborative workspace for student research, assignments, and study groups. Assign tasks, research with multiple AI models, and organize files and citations.",
    },
  },
  teams: {
    tone: "brand", eyebrow: "For teams & startups",
    title: "Move from discussion to completed work.",
    sub: "Connect conversations, AI research, tasks, files, and decisions in one shared project workspace.",
    primary: ["Start a Team Workspace", "/signup"], secondary: ["Explore for Business", "/business"],
    sections: ["team", "humanai", "usecases"],
    seo: {
      title: "TeamNest for Teams — AI Collaboration for Startups & Teams",
      description: "Bring team chat, AI research, tasks, files, and decisions into one shared workspace so your team can execute without losing context.",
    },
  },
  business: {
    tone: "ai", eyebrow: "For businesses",
    title: "Preserve your organization's intelligence.",
    sub: "Give employees secure access to AI, projects, and institutional knowledge that stays even when people move on.",
    primary: ["Request a Demo", "/support"], secondary: ["View Plans", "/pricing"],
    sections: ["business", "capabilities", "usecases"],
    seo: {
      title: "TeamNest for Business — Institutional Knowledge & Role Intelligence",
      description: "Preserve company knowledge, improve collaboration, and give employees secure AI, projects, governance, and Role Intelligence that transfers between people.",
    },
  },
  enterprise: {
    tone: "ai", eyebrow: "For enterprise",
    title: "AI collaboration, governed for the enterprise.",
    sub: "SSO, private cloud, data residency, retention controls, and advanced governance across the organization.",
    primary: ["Contact Sales", "/support"], secondary: ["View Plans", "/pricing"],
    sections: ["business", "capabilities"],
    seo: {
      title: "TeamNest for Enterprise — Governed AI Collaboration Workspace",
      description: "Enterprise-grade AI collaboration with SSO, private cloud, data residency, retention controls, audit logs, and advanced governance.",
    },
  },
  "ai-research": {
    tone: "ai", eyebrow: "AI research",
    title: "Research with the best of every AI model.",
    sub: "Ask, compare, reconcile, and combine answers from multiple AI models — grounded in your project's context.",
    primary: ["Start Free", "/signup"], secondary: ["Explore for Business", "/business"],
    sections: ["multimodel", "humanai", "usecases"],
    seo: {
      title: "Multi-Model AI Research — TeamNest",
      description: "Use multiple AI models from one workspace. Compare answers, find disagreements, combine findings, and keep every source connected to your research.",
    },
  },
  "multi-model-ai": {
    tone: "ai", eyebrow: "Multi-model AI",
    title: "One workspace. Multiple AI minds.",
    sub: "Send the same question to several models, compare responses side by side, and synthesize one final result.",
    primary: ["Start Free", "/signup"], secondary: ["Explore for Business", "/business"],
    sections: ["multimodel", "humanai"],
    seo: {
      title: "Multi-Model AI — Compare & Combine AI Models | TeamNest",
      description: "Ask multiple AI models in one place, compare answers, explore disagreements, and combine the best insights into a unified result.",
    },
  },
};

function PageHero({ cfg, slug }) {
  const [pLabel, pHref] = cfg.primary;
  const [sLabel, sHref] = cfg.secondary;
  return (
    <section className="relative pt-28 pb-14 md:pt-32 md:pb-16 px-5" data-testid={`landing-hero-${slug}`}>
      <EngineBackdrop tone={cfg.tone} />
      <div className="relative max-w-4xl mx-auto text-center">
        <Reveal>
          <Eyebrow tone={cfg.tone} className="mb-5 justify-center flex">{cfg.eyebrow}</Eyebrow>
          <h1 className="text-[36px] sm:text-[48px] lg:text-[56px] leading-[1.05] font-bold tracking-[-0.03em] text-[var(--w-text)]" style={{ textWrap: "balance" }}>
            {cfg.title}
          </h1>
          <p className="mt-5 text-[17px] sm:text-[19px] leading-8 text-[var(--w-text-dim)] max-w-[62ch] mx-auto" style={{ textWrap: "pretty" }}>
            {cfg.sub}
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <PrimaryButton as={Link} to={pHref} data-testid={`landing-primary-${slug}`} onClick={() => trackHomeEvent("landing_primary_click", { page: slug })}>
              {pLabel} <ArrowRight className="w-4 h-4" />
            </PrimaryButton>
            <GhostButton as={Link} to={sHref} data-testid={`landing-secondary-${slug}`}>
              {sLabel}
            </GhostButton>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

export default function AudienceLanding({ kind }) {
  const cfg = CONFIG[kind] || CONFIG.individuals;
  return (
    <WebThemeProvider forceDark>
      <SeoHelmet title={cfg.seo.title} description={cfg.seo.description} path={`/${kind}`} />
      <div className="min-h-screen bg-[var(--w-bg)] text-[var(--w-text)]">
        <NavV2 />
        <main className="pt-16">
          <PageHero cfg={cfg} slug={kind} />
          {cfg.sections.map((key) => {
            const Section = SECTION_MAP[key];
            return Section ? <Section key={key} /> : null;
          })}
          <PlansSection />
          <FinalCTASection />
        </main>
        <FooterV2 />
      </div>
    </WebThemeProvider>
  );
}
