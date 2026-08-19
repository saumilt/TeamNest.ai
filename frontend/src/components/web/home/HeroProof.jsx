import { Reveal } from "@/components/web/home/primitives";

/* Proof strip under the hero — reinforces the "never lose what you know"
   promise with honest, capability-based stats (no fabricated logos). */
const STATS = [
  { k: "5+", v: "AI models compared side-by-side" },
  { k: "100%", v: "of conversations & decisions retained" },
  { k: "Zero", v: "knowledge lost when people move on" },
  { k: "SSO + Audit", v: "enterprise governance built in" },
];

export default function HeroProof() {
  return (
    <section className="relative px-5 pb-8 md:pb-10" data-testid="home-hero-proof">
      <div className="max-w-6xl mx-auto">
        <Reveal>
          <div className="rounded-[16px] border border-[var(--w-hairline)] bg-[var(--w-surface)] px-6 py-6">
            <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--w-text-mute)] mb-5 text-center">
              Built to preserve what your organization knows
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-y-6 md:divide-x md:divide-[var(--w-hairline)]">
              {STATS.map((s) => (
                <div key={s.k} className="text-center md:px-4">
                  <div className="text-[26px] sm:text-[30px] font-bold tracking-[-0.02em] text-[var(--w-brand)]">
                    {s.k}
                  </div>
                  <div className="mt-1 text-[12.5px] leading-5 text-[var(--w-text-dim)] max-w-[22ch] mx-auto">
                    {s.v}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
