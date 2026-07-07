import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";

export function PlanCard({ plan, highlighted = false }) {
  return (
    <div
      data-testid={`plan-card-${plan.id}`}
      className={`relative rounded-[20px] border p-7 flex flex-col h-full transition-all duration-200 ${
        highlighted
          ? "border-[var(--w-brand)] bg-[var(--w-brand-tint)]/30 shadow-[0_24px_60px_-32px_rgba(255,210,63,0.4)]"
          : "border-[var(--w-hairline)] bg-[var(--w-surface)] hover:border-[var(--w-hairline-strong)]"
      }`}
    >
      {highlighted && (
        <div className="absolute top-4 right-4 inline-flex items-center px-2.5 py-1 rounded-full bg-[var(--w-brand)] text-black text-[10px] font-bold uppercase tracking-widest">
          Most popular
        </div>
      )}
      <div className={`text-[15px] font-bold mb-2 ${highlighted ? "text-[var(--w-brand)]" : "text-[var(--w-text)]"}`}>
        {plan.name}
      </div>
      <div className="flex items-baseline gap-1 mb-1">
        <span className="text-[40px] font-bold tracking-tight text-[var(--w-text)] leading-none">{plan.price}</span>
        {plan.unit && <span className="text-[14px] text-[var(--w-text-dim)]">{plan.unit}</span>}
      </div>
      <p className="text-[14px] text-[var(--w-text-dim)] mb-5 min-h-[40px]">{plan.tagline}</p>
      <ul className="space-y-2.5 mb-6 flex-1">
        {plan.features.map((f) => (
          <li key={f} className="flex items-start gap-2 text-[14px] leading-5 text-[var(--w-text)]">
            <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-[var(--w-brand-tint)] text-[var(--w-brand)] shrink-0 mt-0.5">
              <svg className="w-2.5 h-2.5" viewBox="0 0 12 12" fill="none">
                <path d="M2 6.5L4.5 9L10 3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <span>{f}</span>
          </li>
        ))}
      </ul>
      <a
        href={plan.cta_href}
        data-testid={`plan-cta-${plan.id}`}
        className={`inline-flex items-center justify-center h-12 px-4 rounded-[12px] font-semibold text-[15px] transition-all duration-100 active:scale-[0.97] ${
          highlighted
            ? "bg-[var(--w-brand)] text-black hover:brightness-95"
            : "bg-transparent border border-[var(--w-hairline-strong)] text-[var(--w-text)] hover:bg-[var(--w-surface-2)]"
        }`}
      >
        {plan.cta}
      </a>
    </div>
  );
}

export function AccordionItem({ q, a, isOpen, onToggle, idx }) {
  return (
    <div className="border-b border-[var(--w-hairline)]">
      <button
        type="button"
        data-testid={`faq-row-${idx}`}
        onClick={onToggle}
        aria-expanded={isOpen}
        className="w-full flex items-center justify-between gap-4 h-16 text-left hover:text-[var(--w-text)] transition-colors"
      >
        <span className="text-[16px] font-semibold text-[var(--w-text)]">{q}</span>
        <ChevronDown
          className={`w-5 h-5 text-[var(--w-text-dim)] shrink-0 transition-transform duration-200 ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>
      {isOpen && (
        <div className="pb-5 pr-9 text-[15px] leading-7 text-[var(--w-text-dim)]" style={{ textWrap: "pretty" }}>
          {a}
        </div>
      )}
    </div>
  );
}

export function FAQ({ items }) {
  const [openIdx, setOpenIdx] = useState(0);
  return (
    <div className="divide-y divide-transparent">
      {items.map((it, i) => (
        <AccordionItem
          key={it.q}
          q={it.q}
          a={it.a}
          idx={i}
          isOpen={openIdx === i}
          onToggle={() => setOpenIdx(openIdx === i ? -1 : i)}
        />
      ))}
    </div>
  );
}

/** Scroll progress bar pinned to top — appears on long pages. */
export function ScrollProgress() {
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const onScroll = () => {
      const h = document.documentElement;
      const scrolled = h.scrollTop;
      const total = h.scrollHeight - h.clientHeight;
      setProgress(total > 0 ? scrolled / total : 0);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <div className="fixed top-0 left-0 right-0 h-0.5 z-50 pointer-events-none">
      <div
        className="h-full bg-[var(--w-brand)] origin-left transition-transform duration-100"
        style={{ transform: `scaleX(${progress})` }}
      />
    </div>
  );
}
