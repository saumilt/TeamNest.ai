import SeoHelmet from "@/components/web/SeoHelmet";
import { Eyebrow, SectionTitle, SectionSub } from "@/components/web/atoms";

const TAG_TONES = {
  New: { cls: "bg-[var(--w-green)]/15 text-[var(--w-green)] border-[var(--w-green)]/30" },
  Improved: { cls: "bg-[var(--w-brand-tint)] text-[var(--w-brand)] border-[var(--w-brand)]/30" },
  Fixed: { cls: "bg-[var(--w-surface-3)] text-[var(--w-text-mute)] border-[var(--w-hairline)]" },
};

function TagPill({ tag }) {
  const t = TAG_TONES[tag] || TAG_TONES.Fixed;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md border text-[10px] font-bold uppercase tracking-widest ${t.cls}`}>
      {tag}
    </span>
  );
}

const ENTRIES = [
  {
    date: "Feb 19, 2026",
    version: "v1.5.0",
    title: "Native iOS + Android apps in flight",
    bullets: [
      { tag: "New", text: "Capacitor scaffold for iOS and Android — install on a real device today" },
      { tag: "New", text: "App Store + Play Store screenshots and a 15-second app preview video" },
      { tag: "Improved", text: "Switched session auth from localStorage to httpOnly cookies" },
      { tag: "Fixed", text: "Production build now passes CI=true ESLint-as-error gate" },
    ],
  },
  {
    date: "Feb 17, 2026",
    version: "v1.4.0",
    title: "Visual redesign — WhatsApp-native feel",
    bullets: [
      { tag: "New", text: "Mobile-first 5-tab navigation: Chats, AI, Tasks, Calls, Me" },
      { tag: "New", text: "Glass-morphism app bar with sentence-case typography" },
      { tag: "Improved", text: "Reduced backend function complexity across calls + Stripe webhook flows" },
      { tag: "Improved", text: "Sanitised every unsafe HTML insertion with DOMPurify" },
    ],
  },
  {
    date: "Feb 10, 2026",
    version: "v1.3.0",
    title: "Grok and Claude Sonnet 4.5 on AI Compare",
    bullets: [
      { tag: "New", text: "Grok added as the 6th model in the compare flow" },
      { tag: "New", text: "Claude Sonnet 4.5 with improved long-context reasoning" },
      { tag: "Improved", text: "Compare-all-6 now resolves in under 3 seconds end-to-end" },
    ],
  },
  {
    date: "Feb 2, 2026",
    version: "v1.2.0",
    title: "Calls with live captions, courtesy of Deepgram",
    bullets: [
      { tag: "New", text: "LiveKit-powered audio + video + screen-share calls" },
      { tag: "New", text: "Real-time transcription with speaker labels" },
      { tag: "New", text: "Auto-summary + action-item extraction the moment a call ends" },
    ],
  },
  {
    date: "Jan 22, 2026",
    version: "v1.1.0",
    title: "Stripe billing live, demo workspace public",
    bullets: [
      { tag: "New", text: "Stripe subscriptions for Pro and Team plans" },
      { tag: "New", text: "One-click demo workspace — no signup, no credit card" },
      { tag: "Improved", text: "Workspace member roles + invitation flow" },
    ],
  },
];

export default function WebChangelog() {
  return (
    <>
      <SeoHelmet
        title="Changelog · TeamNest.ai"
        description="What's new in TeamNest — features, improvements, and fixes, reverse-chronological."
        path="/changelog"
      />

      <section className="pt-16 pb-12">
        <div className="max-w-[800px] mx-auto px-4 sm:px-6 text-center">
          <Eyebrow className="mb-3">Changelog</Eyebrow>
          <SectionTitle className="!text-[44px] sm:!text-[52px] mb-5">What we shipped recently.</SectionTitle>
          <SectionSub className="mx-auto text-center">
            We ship one tool every month. Here's what's new in TeamNest.
          </SectionSub>
        </div>
      </section>

      <section className="pb-32">
        <div className="max-w-[800px] mx-auto px-4 sm:px-6">
          <div className="relative pl-8 border-l-2 border-[var(--w-hairline)] space-y-14">
            {ENTRIES.map((e) => (
              <article key={e.version} className="relative">
                <div className="absolute -left-[37px] top-2 w-3 h-3 rounded-full bg-[var(--w-brand)] ring-4 ring-[var(--w-bg)]" />
                <div className="flex items-center gap-3 mb-3">
                  <span className="inline-flex items-center px-3 py-1 rounded-full bg-[var(--w-surface)] border border-[var(--w-hairline)] text-[12px] font-medium text-[var(--w-text-dim)]">
                    {e.date}
                  </span>
                  <span className="font-mono text-[12px] text-[var(--w-text-mute)]">{e.version}</span>
                </div>
                <h2 className="text-[24px] font-bold tracking-[-0.01em] text-[var(--w-text)] mb-4" style={{ textWrap: "balance" }}>
                  {e.title}
                </h2>
                <ul className="space-y-3">
                  {e.bullets.map((b) => (
                    <li key={`${e.date}-${b.text}`} className="flex items-start gap-3">
                      <TagPill tag={b.tag} />
                      <p className="text-[15px] leading-6 text-[var(--w-text)] flex-1">{b.text}</p>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
