import {
  MessageCircle, Layers, GitCompare, AlertTriangle, Combine, RefreshCw, BookmarkPlus, Share2,
} from "lucide-react";
import { Eyebrow, SectionTitle, SectionSub } from "@/components/web/atoms";
import { SixModelStrip } from "@/components/web/mocks";
import { Reveal, BrowserFrame } from "@/components/web/home/primitives";

const FEATURES = [
  { icon: MessageCircle, title: "Ask One AI", desc: "Choose the model best suited to the task." },
  { icon: Layers, title: "Ask Multiple AIs", desc: "Send the same research question to several approved models." },
  { icon: GitCompare, title: "Compare Answers", desc: "View responses side by side." },
  { icon: AlertTriangle, title: "Find Disagreements", desc: "Identify where models provide conflicting conclusions." },
  { icon: Combine, title: "Combine Findings", desc: "Generate a unified report from selected responses." },
  { icon: RefreshCw, title: "Continue Research", desc: "Ask follow-ups without copying context between tools." },
  { icon: BookmarkPlus, title: "Save Sources", desc: "Keep citations, files, and supporting material connected." },
  { icon: Share2, title: "Share Results", desc: "Share selected findings without exposing every raw prompt." },
];

const MODELS = ["OpenAI", "Claude", "Gemini", "Custom AI", "Specialized AI assistants"];

export default function MultiModelSection() {
  return (
    <section
      id="multi-model"
      className="relative py-20 md:py-28 px-5 border-t border-[var(--w-hairline)] bg-[var(--w-bg2)] scroll-mt-20"
      data-testid="home-multi-model"
    >
      <div className="max-w-6xl mx-auto">
        <Reveal className="max-w-3xl">
          <Eyebrow tone="ai" className="mb-4">Multi-model AI research</Eyebrow>
          <SectionTitle>One workspace. Multiple AI minds.</SectionTitle>
          <SectionSub className="mt-5">
            Use leading AI models from one place. Ask different models, compare answers,
            explore disagreements, and combine the best insights into one final result.
          </SectionSub>
        </Reveal>

        <Reveal delay={120} className="mt-12">
          <BrowserFrame>
            <div className="p-4 sm:p-6 bg-[var(--w-bg)]">
              <SixModelStrip />
            </div>
          </BrowserFrame>
        </Reveal>

        <div className="mt-6 flex flex-wrap items-center gap-2.5">
          <span className="text-[12px] font-semibold text-[var(--w-text-mute)] mr-1">Connect supported AI models:</span>
          {MODELS.map((m) => (
            <span
              key={m}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-[var(--w-hairline)] text-[12px] text-[var(--w-text-dim)] bg-[var(--w-surface)]"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--w-ai)]" /> {m}
            </span>
          ))}
        </div>

        <div className="mt-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {FEATURES.map((f, i) => (
            <Reveal key={f.title} delay={(i % 4) * 60}>
              <div className="h-full rounded-[16px] border border-[var(--w-hairline)] bg-[var(--w-surface)] p-5 transition-all duration-300 hover:border-[var(--w-ai)]/40 hover:-translate-y-0.5">
                <div className="w-9 h-9 rounded-lg bg-[var(--w-ai-tint)] flex items-center justify-center mb-3">
                  <f.icon className="w-4 h-4 text-[var(--w-ai)]" />
                </div>
                <div className="text-[15px] font-bold text-[var(--w-text)]">{f.title}</div>
                <p className="mt-1 text-[13px] leading-5 text-[var(--w-text-dim)]">{f.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>

        <p className="mt-12 text-center text-[18px] md:text-[22px] font-semibold text-[var(--w-text)]" style={{ textWrap: "balance" }}>
          No more switching tabs, copying responses, or starting over.
        </p>
      </div>
    </section>
  );
}
