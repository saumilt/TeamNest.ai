import { Link } from "react-router-dom";
import { User, GraduationCap, Users, Building2, ArrowRight, Check } from "lucide-react";
import { Reveal, trackHomeEvent } from "@/components/web/home/primitives";

const CARDS = [
  {
    key: "individuals",
    icon: User,
    tone: "brand",
    heading: "For Individuals",
    copy: "Organize personal research, compare AI answers, manage projects, save files, and build a knowledge system that grows with you.",
    benefits: [
      "Research across multiple AI models",
      "Save notes, files, and sources",
      "Organize projects and tasks",
      "Build personal knowledge",
    ],
    cta: "Use TeamNest Personally",
    href: "/individuals",
    event: "individual_card_click",
  },
  {
    key: "students",
    icon: GraduationCap,
    tone: "ai",
    heading: "For Students",
    copy: "A smarter workspace for research, assignments, study groups, and collaborative projects.",
    benefits: [
      "Collaborate with classmates",
      "Assign tasks and deadlines",
      "Research with multiple AI models",
      "Keep human chat free of AI clutter",
    ],
    cta: "Use TeamNest for School",
    href: "/students",
    event: "student_card_click",
  },
  {
    key: "teams",
    icon: Users,
    tone: "brand",
    heading: "For Teams",
    copy: "Bring conversations, AI research, files, tasks, and decisions into one shared project workspace.",
    benefits: [
      "Human and AI collaboration",
      "Shared projects and tasks",
      "AI-assisted planning",
      "Organized research threads",
    ],
    cta: "Explore Team Collaboration",
    href: "/teams",
    event: "team_card_click",
  },
  {
    key: "businesses",
    icon: Building2,
    tone: "ai",
    heading: "For Businesses",
    copy: "Preserve company knowledge, improve collaboration, and give employees secure access to AI, projects, and institutional intelligence.",
    benefits: [
      "Role Intelligence",
      "Employee knowledge continuity",
      "Governance and audit logs",
      "Enterprise connectors",
    ],
    cta: "Explore TeamNest for Business",
    href: "/business",
    event: "business_card_click",
  },
];

function AudienceCard({ card, delay }) {
  const Icon = card.icon;
  const ai = card.tone === "ai";
  return (
    <Reveal delay={delay} className="h-full">
      <div
        data-testid={`audience-card-${card.key}`}
        className="group h-full flex flex-col rounded-[20px] border border-[var(--w-hairline)] bg-[var(--w-surface)] p-6 transition-all duration-300 hover:-translate-y-1 hover:border-[var(--w-hairline-strong)] hover:shadow-[0_30px_70px_-40px_rgba(0,0,0,0.8)]"
      >
        <div
          className={`w-11 h-11 rounded-xl flex items-center justify-center mb-4 transition-transform duration-300 group-hover:scale-110 ${
            ai ? "bg-[var(--w-ai-tint)]" : "bg-[var(--w-brand-tint)]"
          }`}
        >
          <Icon className={`w-5 h-5 ${ai ? "text-[var(--w-ai)]" : "text-[var(--w-brand)]"}`} />
        </div>
        <h3 className="text-[19px] font-bold text-[var(--w-text)]">{card.heading}</h3>
        <p className="mt-2 text-[14px] leading-6 text-[var(--w-text-dim)]">{card.copy}</p>
        <ul className="mt-4 space-y-2 flex-1">
          {card.benefits.map((b) => (
            <li key={b} className="flex items-start gap-2 text-[13px] leading-5 text-[var(--w-text-dim)]">
              <Check className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${ai ? "text-[var(--w-ai)]" : "text-[var(--w-green)]"}`} />
              {b}
            </li>
          ))}
        </ul>
        <Link
          to={card.href}
          data-testid={`audience-cta-${card.key}`}
          onClick={() => trackHomeEvent(card.event, { source: "audience_selector" })}
          className="mt-5 inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-[var(--w-text)] hover:gap-2.5 transition-all"
        >
          {card.cta}
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </Reveal>
  );
}

export default function AudienceCards() {
  return (
    <section
      id="audiences"
      className="relative py-16 md:py-20 px-5 border-t border-[var(--w-hairline)] scroll-mt-20"
      data-testid="home-audiences"
    >
      <div className="max-w-6xl mx-auto">
        <div className="flex -mx-5 px-5 gap-4 overflow-x-auto snap-x pb-2 md:grid md:grid-cols-2 lg:grid-cols-4 md:gap-5 md:overflow-visible md:mx-0 md:px-0">
          {CARDS.map((c, i) => (
            <div key={c.key} className="min-w-[80%] snap-start sm:min-w-[60%] md:min-w-0">
              <AudienceCard card={c} delay={i * 80} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
