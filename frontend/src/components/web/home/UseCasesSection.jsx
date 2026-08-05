import {
  Lightbulb, GraduationCap, Plane, Scale, Megaphone, Rocket, Briefcase, Archive, Landmark,
  MessageSquare, Sparkles, Layers, FolderKanban, ListChecks, FileText, StickyNote,
  Search, Brain, Bot, Users, User, KeyRound, Plug, Gauge,
} from "lucide-react";
import { Eyebrow, SectionTitle, SectionSub } from "@/components/web/atoms";
import { Reveal } from "@/components/web/home/primitives";

const USE_CASES = [
  { icon: Lightbulb, t: "Research a business idea", d: "Compare markets, competitors, pricing, and opportunities." },
  { icon: GraduationCap, t: "Complete a college group project", d: "Coordinate research, tasks, files, and presentations." },
  { icon: Plane, t: "Plan a trip", d: "Compare destinations, itineraries, hotels, and group preferences." },
  { icon: Scale, t: "Analyze a contract", d: "Research terms, organize documents, and collaborate with pros." },
  { icon: Megaphone, t: "Build a marketing campaign", d: "Develop strategy, creative concepts, budgets, and tasks." },
  { icon: Rocket, t: "Launch a startup", d: "Organize research, plans, product ideas, and team communication." },
  { icon: Briefcase, t: "Manage a professional project", d: "Connect discussions, tasks, files, and AI support." },
  { icon: Archive, t: "Preserve company knowledge", d: "Capture expertise, decisions, and workflows before they disappear." },
  { icon: Landmark, t: "Collaborate with outside counsel", d: "Use secure matter rooms with attorney-supervised workflows where enabled." },
];

const CAPABILITIES = [
  { icon: MessageSquare, t: "Human chat", d: "Clear team conversation that never scrolls into the void." },
  { icon: Sparkles, t: "AI research", d: "Ask, compare, and continue without leaving the project." },
  { icon: Layers, t: "Multiple AI models", d: "Route questions to the right model, or several at once." },
  { icon: FolderKanban, t: "Projects", d: "A home for every idea, decision, and topic." },
  { icon: ListChecks, t: "Tasks", d: "Turn decisions into owners and deadlines." },
  { icon: FileText, t: "Files", d: "Documents and sources connected to the work." },
  { icon: StickyNote, t: "Notes", d: "Capture context that would otherwise be lost." },
  { icon: Search, t: "Search", d: "Find any answer, file, or decision instantly." },
  { icon: Brain, t: "Knowledge", d: "A record that grows and stays with the project." },
  { icon: Bot, t: "AI employees", d: "Custom assistants trained on your context." },
  { icon: Users, t: "Shared workspaces", d: "Collaborate with people and AI in one place." },
  { icon: User, t: "Personal workspaces", d: "Private research and projects, just for you." },
  { icon: Briefcase, t: "Role Intelligence", d: "Knowledge that attaches to the role, not the person." },
  { icon: Plug, t: "Integrations", d: "Connect the tools your work already lives in." },
  { icon: KeyRound, t: "Permissions", d: "Control who sees what, by workspace and role." },
  { icon: Gauge, t: "Usage controls", d: "Govern AI credits and spend across the org." },
];

export function UseCasesSection() {
  return (
    <section id="use-cases" className="relative py-20 md:py-24 px-5 border-t border-[var(--w-hairline)] scroll-mt-20" data-testid="home-use-cases">
      <div className="max-w-6xl mx-auto">
        <Reveal className="max-w-3xl mb-12">
          <Eyebrow tone="default" className="mb-4">Example use cases</Eyebrow>
          <SectionTitle>One workspace for the work that matters to you.</SectionTitle>
        </Reveal>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {USE_CASES.map((u, i) => (
            <Reveal key={u.t} delay={(i % 3) * 60}>
              <div className="h-full rounded-[16px] border border-[var(--w-hairline)] bg-[var(--w-surface)] p-5 transition-all duration-300 hover:-translate-y-0.5 hover:border-[var(--w-hairline-strong)]">
                <div className="w-9 h-9 rounded-lg bg-[var(--w-brand-tint)] flex items-center justify-center mb-3">
                  <u.icon className="w-4 h-4 text-[var(--w-brand)]" />
                </div>
                <div className="text-[15px] font-bold text-[var(--w-text)]">{u.t}</div>
                <p className="mt-1 text-[13px] leading-5 text-[var(--w-text-dim)]">{u.d}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

export function CapabilitiesSection() {
  return (
    <section id="capabilities" className="relative py-20 md:py-24 px-5 border-t border-[var(--w-hairline)] bg-[var(--w-bg2)] scroll-mt-20" data-testid="home-capabilities">
      <div className="max-w-6xl mx-auto">
        <Reveal className="max-w-3xl mb-12">
          <Eyebrow tone="ai" className="mb-4">Product capabilities</Eyebrow>
          <SectionTitle>Everything connected to the project.</SectionTitle>
          <SectionSub className="mt-5">
            One platform with different levels of use — from a single researcher to an entire organization.
          </SectionSub>
        </Reveal>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          {CAPABILITIES.map((c, i) => (
            <Reveal key={c.t} delay={(i % 4) * 40}>
              <div className="h-full rounded-[14px] border border-[var(--w-hairline)] bg-[var(--w-surface)] p-4">
                <c.icon className="w-4 h-4 text-[var(--w-ai)] mb-2" />
                <div className="text-[14px] font-bold text-[var(--w-text)]">{c.t}</div>
                <p className="mt-0.5 text-[12.5px] leading-5 text-[var(--w-text-mute)]">{c.d}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
