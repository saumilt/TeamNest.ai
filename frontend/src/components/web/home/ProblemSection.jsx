import { ArrowRight, FolderKanban, MessageSquare, ListChecks, Brain } from "lucide-react";
import { Eyebrow, SectionTitle, SectionSub } from "@/components/web/atoms";
import { Reveal } from "@/components/web/home/primitives";

const SCATTERED = ["ChatGPT", "Claude", "Gemini", "Email", "Notes", "Documents", "Group chat", "Task app"];
const UNIFIED = [
  { icon: FolderKanban, label: "One project" },
  { icon: MessageSquare, label: "One research history" },
  { icon: ListChecks, label: "One task list" },
  { icon: Brain, label: "One knowledge system" },
];

export default function ProblemSection() {
  return (
    <section
      id="problem"
      className="relative py-20 md:py-24 px-5 border-t border-[var(--w-hairline)]"
      data-testid="home-problem"
    >
      <div className="max-w-6xl mx-auto">
        <Reveal className="max-w-3xl">
          <Eyebrow tone="default" className="mb-4">The problem</Eyebrow>
          <SectionTitle>Stop losing your work across different apps.</SectionTitle>
          <SectionSub className="mt-5">
            Research often starts in one AI tool, continues in another, gets copied into
            documents, and disappears into chats, notes, and browser tabs. TeamNest keeps
            every question, answer, file, source, task, and decision organized inside the
            project where it belongs.
          </SectionSub>
        </Reveal>

        <div className="mt-14 grid grid-cols-1 lg:grid-cols-[1fr_auto_1fr] gap-8 lg:gap-6 items-center">
          {/* Scattered */}
          <Reveal className="rounded-[20px] border border-[var(--w-hairline)] bg-[var(--w-bg2)] p-6">
            <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--w-red)] mb-4">
              Scattered tools
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              {SCATTERED.map((t) => (
                <div
                  key={t}
                  className="rounded-[10px] border border-dashed border-[var(--w-hairline-strong)] bg-[var(--w-surface)] px-3 py-2.5 text-[13px] text-[var(--w-text-mute)] text-center"
                >
                  {t}
                </div>
              ))}
            </div>
          </Reveal>

          {/* Arrow */}
          <Reveal delay={120} className="flex lg:flex-col items-center justify-center gap-2 text-[var(--w-text-mute)]">
            <ArrowRight className="w-7 h-7 text-[var(--w-brand)] lg:rotate-0 rotate-90" />
            <span className="text-[11px] font-bold uppercase tracking-widest">Unified</span>
          </Reveal>

          {/* Unified */}
          <Reveal delay={200} className="rounded-[20px] border border-[var(--w-brand)]/30 bg-[var(--w-surface)] p-6 shadow-[0_30px_80px_-50px_rgba(255,210,63,0.5)]">
            <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--w-brand)] mb-4">
              TeamNest workspace
            </div>
            <div className="space-y-2.5">
              {UNIFIED.map((u) => (
                <div
                  key={u.label}
                  className="flex items-center gap-3 rounded-[12px] border border-[var(--w-hairline)] bg-[var(--w-bg2)] px-4 py-3"
                >
                  <span className="w-8 h-8 rounded-lg bg-[var(--w-brand-tint)] flex items-center justify-center shrink-0">
                    <u.icon className="w-4 h-4 text-[var(--w-brand)]" />
                  </span>
                  <span className="text-[14px] font-semibold text-[var(--w-text)]">{u.label}</span>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
