import { Link } from "react-router-dom";
import {
  ArrowRight, Check, ShieldCheck, Rocket, GraduationCap, User, Building2,
  Briefcase, Users2, KeyRound, Network, ScrollText, Lock,
} from "lucide-react";
import { Eyebrow, SectionTitle, SectionSub, PrimaryButton, GhostButton } from "@/components/web/atoms";
import { Reveal, trackHomeEvent } from "@/components/web/home/primitives";

function TagGrid({ items, ai }) {
  return (
    <div className="mt-6 flex flex-wrap gap-2">
      {items.map((t) => (
        <span
          key={t}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-[var(--w-hairline)] bg-[var(--w-surface)] text-[12.5px] text-[var(--w-text-dim)]"
        >
          <Check className={`w-3 h-3 ${ai ? "text-[var(--w-ai)]" : "text-[var(--w-green)]"}`} />
          {t}
        </span>
      ))}
    </div>
  );
}

function CapabilityList({ items, ai }) {
  return (
    <ul className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2.5">
      {items.map((f) => (
        <li key={f} className="flex items-start gap-2.5 text-[14px] leading-6 text-[var(--w-text-dim)]">
          <Check className={`w-4 h-4 shrink-0 mt-0.5 ${ai ? "text-[var(--w-ai)]" : "text-[var(--w-brand)]"}`} />
          {f}
        </li>
      ))}
    </ul>
  );
}

/* Section 6 — Personal research workspace */
export function PersonalSection() {
  const examples = [
    "Starting a business", "Planning a vacation", "Comparing investments",
    "Researching a purchase", "Writing a book", "Learning a subject",
    "Home renovation", "Managing a personal project",
  ];
  const features = [
    "Personal projects", "Research notebooks", "AI conversations", "Uploaded files",
    "Source links", "Tasks and deadlines", "Searchable knowledge", "Continue where you left off",
  ];
  return (
    <section id="individuals" className="relative py-20 md:py-24 px-5 border-t border-[var(--w-hairline)] scroll-mt-20" data-testid="home-personal">
      <div className="max-w-6xl mx-auto">
        <Reveal className="max-w-3xl">
          <Eyebrow tone="brand" className="mb-4"><span className="inline-flex items-center gap-1.5"><User className="w-3.5 h-3.5" /> For individuals</span></Eyebrow>
          <SectionTitle>Your personal research workspace.</SectionTitle>
          <SectionSub className="mt-5">
            Create a workspace for any idea, decision, plan, or research topic. Keep AI
            conversations, notes, tasks, files, and sources organized together.
          </SectionSub>
        </Reveal>
        <Reveal delay={80}><TagGrid items={examples} /></Reveal>
        <Reveal delay={120}><CapabilityList items={features} /></Reveal>
        <Reveal delay={160}>
          <div className="mt-8">
            <PrimaryButton as={Link} to="/signup" data-testid="personal-cta" onClick={() => trackHomeEvent("personal_workspace_cta", { source: "home_personal" })}>
              Start a Personal Workspace <ArrowRight className="w-4 h-4" />
            </PrimaryButton>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* Section 7 — Student group projects */
export function StudentSection() {
  const steps = [
    "Create project", "Invite classmates", "Assign research topics",
    "Each participant uses AI", "Compare findings", "Publish approved summaries", "Create final report",
  ];
  const features = [
    "Group chat", "Shared task list", "Due dates", "File sharing",
    "Research threads", "Multiple AI models", "Human and AI views", "Shared summaries",
  ];
  return (
    <section id="students" className="relative py-20 md:py-24 px-5 border-t border-[var(--w-hairline)] bg-[var(--w-bg2)] scroll-mt-20" data-testid="home-student">
      <div className="max-w-6xl mx-auto">
        <Reveal className="max-w-3xl">
          <Eyebrow tone="ai" className="mb-4"><span className="inline-flex items-center gap-1.5"><GraduationCap className="w-3.5 h-3.5" /> For students</span></Eyebrow>
          <SectionTitle>Built for smarter group projects.</SectionTitle>
          <SectionSub className="mt-5">
            Students can work with classmates, assign tasks, conduct separate AI research,
            organize files, and publish only the best findings back into the group discussion.
          </SectionSub>
        </Reveal>

        <Reveal delay={100} className="mt-10">
          <div className="flex flex-wrap items-center gap-2">
            {steps.map((s, i) => (
              <div key={s} className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--w-hairline)] bg-[var(--w-surface)] px-3 py-1.5 text-[12.5px] text-[var(--w-text-dim)]">
                  <span className="w-4 h-4 rounded-full bg-[var(--w-ai-tint)] text-[var(--w-ai)] text-[9px] font-bold flex items-center justify-center">{i + 1}</span>
                  {s}
                </span>
                {i < steps.length - 1 && <ArrowRight className="w-3.5 h-3.5 text-[var(--w-text-mute)]" />}
              </div>
            ))}
          </div>
        </Reveal>

        <Reveal delay={140}><CapabilityList items={features} ai /></Reveal>

        <Reveal delay={180}>
          <div className="mt-6 flex items-start gap-2.5 rounded-[14px] border border-[var(--w-hairline)] bg-[var(--w-surface)] p-4 max-w-[70ch]">
            <ShieldCheck className="w-4 h-4 text-[var(--w-green)] shrink-0 mt-0.5" />
            <p className="text-[13px] leading-5 text-[var(--w-text-dim)]">
              TeamNest helps students research, organize, and collaborate. Students remain
              responsible for following their school&apos;s academic integrity and AI-use policies.
            </p>
          </div>
        </Reveal>

        <Reveal delay={220}>
          <div className="mt-8">
            <PrimaryButton as={Link} to="/signup" data-testid="student-cta" onClick={() => trackHomeEvent("student_project_cta", { source: "home_student" })}>
              Create a Student Project <ArrowRight className="w-4 h-4" />
            </PrimaryButton>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* Section 8 — Teams and startups */
export function TeamSection() {
  const features = [
    "Team chats", "AI research", "Shared projects", "Task assignment",
    "Decision tracking", "Files", "Custom AI assistants", "Knowledge capture",
  ];
  const cases = [
    "Launch planning", "Product research", "Sales strategy", "Marketing campaigns",
    "Hiring", "Competitive analysis", "Investor prep", "Operations planning",
  ];
  return (
    <section id="teams" className="relative py-20 md:py-24 px-5 border-t border-[var(--w-hairline)] scroll-mt-20" data-testid="home-team">
      <div className="max-w-6xl mx-auto">
        <Reveal className="max-w-3xl">
          <Eyebrow tone="brand" className="mb-4"><span className="inline-flex items-center gap-1.5"><Rocket className="w-3.5 h-3.5" /> For teams &amp; startups</span></Eyebrow>
          <SectionTitle>Move from discussion to completed work.</SectionTitle>
          <SectionSub className="mt-5">
            TeamNest connects conversations, research, tasks, files, and AI assistance so
            teams can make decisions and execute without losing context.
          </SectionSub>
        </Reveal>
        <Reveal delay={100}><CapabilityList items={features} /></Reveal>
        <Reveal delay={140}><TagGrid items={cases} /></Reveal>
        <Reveal delay={180}>
          <div className="mt-8">
            <PrimaryButton as={Link} to="/signup" data-testid="team-cta" onClick={() => trackHomeEvent("team_workspace_cta", { source: "home_team" })}>
              Start a Team Workspace <ArrowRight className="w-4 h-4" />
            </PrimaryButton>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* Section 9 — Business & enterprise (preserves original positioning) */
export function BusinessSection() {
  const capabilities = [
    { icon: Briefcase, t: "Role Intelligence" },
    { icon: Users2, t: "Employee knowledge continuity" },
    { icon: ScrollText, t: "Institutional memory" },
    { icon: Network, t: "Departments & permissions" },
    { icon: KeyRound, t: "Enterprise connectors" },
    { icon: Lock, t: "Governance, audit logs & security" },
  ];
  return (
    <section id="business" className="relative py-20 md:py-28 px-5 border-t border-[var(--w-hairline)] bg-[var(--w-bg2)] scroll-mt-20" data-testid="home-business">
      <div className="max-w-6xl mx-auto">
        <Reveal className="max-w-3xl">
          <Eyebrow tone="ai" className="mb-4"><span className="inline-flex items-center gap-1.5"><Building2 className="w-3.5 h-3.5" /> For businesses &amp; enterprise</span></Eyebrow>
          <SectionTitle>Your organization&apos;s intelligence should not disappear when people move on.</SectionTitle>
          <SectionSub className="mt-5">
            TeamNest captures what your people know, what they discuss, and what AI can reason
            across — so company knowledge stays available, grows over time, and can be
            transferred to the people who need it next.
          </SectionSub>
        </Reveal>

        <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {capabilities.map((c, i) => (
            <Reveal key={c.t} delay={(i % 3) * 60}>
              <div className="h-full flex items-center gap-3 rounded-[16px] border border-[var(--w-hairline)] bg-[var(--w-surface)] p-4">
                <span className="w-10 h-10 rounded-xl bg-[var(--w-ai-tint)] flex items-center justify-center shrink-0">
                  <c.icon className="w-5 h-5 text-[var(--w-ai)]" />
                </span>
                <span className="text-[14.5px] font-semibold text-[var(--w-text)]">{c.t}</span>
              </div>
            </Reveal>
          ))}
        </div>

        <Reveal delay={160}>
          <p className="mt-8 text-[16px] leading-7 text-[var(--w-text)] max-w-[70ch]">
            For individuals, TeamNest organizes knowledge. For businesses, TeamNest
            <span className="text-[var(--w-ai)] font-semibold"> preserves it across the organization.</span>
          </p>
        </Reveal>

        <Reveal delay={200}>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <PrimaryButton as={Link} to="/business" data-testid="business-cta" onClick={() => trackHomeEvent("explore_business_click", { source: "home_business" })}>
              Explore TeamNest for Business <ArrowRight className="w-4 h-4" />
            </PrimaryButton>
            <GhostButton as={Link} to="/support" data-testid="business-demo-cta" onClick={() => trackHomeEvent("demo_request_click", { source: "home_business" })}>
              Request a Demo
            </GhostButton>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
