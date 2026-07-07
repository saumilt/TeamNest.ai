import { useMemo } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";
import CreditRing from "@/components/ui-v2/CreditRing";

/** Big credit ring + plan + reset date + low/exhausted/polling banners. */
export default function BillingUsageCard({ usage, polling }) {
  const pct = useMemo(() => {
    if (!usage || !usage.credits_total) return 0;
    return Math.min(100, Math.round((usage.credits_used / usage.credits_total) * 100));
  }, [usage]);

  if (!usage) return null;
  return (
    <section
      data-testid="billing-usage-card"
      className="rounded-card bg-surface p-6 mb-6"
    >
      <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
        <CreditRing
          value={usage.credits_remaining}
          max={usage.credits_total}
          size={160}
          stroke={10}
          color={pct >= 100 ? "#F87171" : "#FFD23F"}
        >
          <div className="text-[44px] leading-none font-bold tabular-nums">
            {usage.credits_remaining}
          </div>
          <div className="text-[12px] text-ink-mute mt-1.5">
            of {usage.credits_total.toLocaleString()} credits left
          </div>
        </CreditRing>
        <div className="flex-1 min-w-0 text-center sm:text-left">
          <div className="text-[13px] text-ink-dim mb-1">
            Resets {new Date(usage.period_end).toLocaleDateString([], { month: "long", day: "numeric", year: "numeric" })}
          </div>
          <div className="text-[13px] text-ink-dim mb-3">
            Current plan: <span className="text-ink font-semibold capitalize">{usage.plan_name}</span>
          </div>
          {usage.low && !usage.exhausted && (
            <div className="inline-flex items-center gap-1.5 text-[12px] text-brand bg-brand-tint px-2.5 py-1 rounded-full" data-testid="billing-low-banner">
              <AlertCircle className="w-3.5 h-3.5" /> Running low — upgrade to keep premium models
            </div>
          )}
          {usage.exhausted && (
            <div className="inline-flex items-center gap-1.5 text-[12px] text-tn-red bg-tn-red/15 px-2.5 py-1 rounded-full" data-testid="billing-exhausted-banner">
              <AlertCircle className="w-3.5 h-3.5" /> Exhausted. Fast models still work.
            </div>
          )}
          {polling && (
            <div className="mt-2 inline-flex items-center gap-1.5 text-[12px] text-ink-dim">
              <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Verifying your payment with Stripe…
            </div>
          )}
        </div>
      </div>
      {/* Hidden bar for backwards-compatible testid */}
      <div className="sr-only">
        <div data-testid="billing-usage-bar" style={{ width: `${pct}%` }} />
      </div>
    </section>
  );
}
