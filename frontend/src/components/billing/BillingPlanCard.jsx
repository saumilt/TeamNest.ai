import { Button } from "@/components/ui/button";
import { Check, Sparkles, Crown, Zap } from "lucide-react";

/** Single plan card — Free / Pro / Team. */
export default function BillingPlanCard({ plan, billing, billingCycle, busy, onCheckout }) {
  const activePlanId = billing?.plan?.id;
  const isOwner = billing?.is_owner;
  const isActive = activePlanId === plan.id;
  const isUpgrade = (plan.price_usd || 0) > (billing?.plan?.price_usd || 0);
  const isDowngrade = (plan.price_usd || 0) < (billing?.plan?.price_usd || 0);
  const displayPrice = (billingCycle === "annual" && plan.annual_price_usd)
    ? Math.round(plan.annual_price_usd / 12)
    : plan.price_usd;
  const annualLine = billingCycle === "annual" && plan.annual_price_usd
    ? `$${plan.annual_price_usd}/yr billed annually`
    : null;

  let cta = null;
  if (!isOwner) {
    cta = (
      <Button
        disabled
        variant="outline"
        className="w-full h-12 border-hairline bg-transparent rounded-2xl text-[14px] font-semibold opacity-50 cursor-not-allowed"
        title="Only the workspace owner can change the plan"
      >
        Owner only
      </Button>
    );
  } else if (isActive) {
    cta = (
      <Button
        disabled
        variant="outline"
        className="w-full h-12 border-hairline bg-transparent text-ink-dim rounded-2xl text-[14px] font-semibold"
      >
        Current plan
      </Button>
    );
  } else if (isUpgrade) {
    cta = (
      <Button
        data-testid={`billing-upgrade-${plan.id}`}
        onClick={() => onCheckout(plan.id)}
        disabled={busy === plan.id}
        className="w-full h-12 bg-brand text-black hover:bg-brand-deep rounded-2xl text-[14px] font-semibold"
      >
        {busy === plan.id ? "Redirecting…" : (<><Zap className="w-4 h-4 mr-1.5" /> Upgrade to {plan.name}</>)}
      </Button>
    );
  } else if (isDowngrade) {
    cta = (
      <Button
        data-testid={`billing-downgrade-${plan.id}`}
        onClick={() => onCheckout(plan.id)}
        disabled={busy === plan.id}
        variant="outline"
        className="w-full h-12 border-hairline bg-transparent hover:bg-white/5 rounded-2xl text-[14px] font-medium"
      >
        {busy === plan.id ? "Working…" : `Switch to ${plan.name}`}
      </Button>
    );
  }

  return (
    <div
      data-testid={`billing-plan-${plan.id}`}
      className={`rounded-card p-5 ${isActive ? "bg-surface border border-brand/30" : "bg-surface"}`}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {plan.id === "pro" && <Sparkles className="w-4 h-4 text-brand" />}
          {plan.id === "team" && <Crown className="w-4 h-4 text-brand" />}
          <h3 className={`text-[20px] leading-[26px] font-bold tracking-tight ${isActive ? "text-brand" : "text-ink"}`}>
            {plan.name}
          </h3>
        </div>
        {isActive && (
          <span className="text-[11px] font-semibold text-brand bg-brand-tint px-2 py-0.5 rounded-full">
            Current
          </span>
        )}
      </div>
      <div className="mb-3 flex items-baseline gap-1.5">
        <span className="text-[32px] leading-none font-bold tabular-nums">
          ${displayPrice}
        </span>
        <span className="text-[14px] text-ink-dim">
          / {plan.per_seat ? "seat / mo" : "mo"}
        </span>
      </div>
      {plan.per_seat && (
        <div className="text-[11px] text-ink-dim mb-2">
          Pay only for active seats · billed monthly via Stripe.
        </div>
      )}
      {annualLine && (
        <div className="text-[12px] text-tn-green mb-3">{annualLine}</div>
      )}
      <div className="text-[14px] text-ink-dim mb-4 min-h-[1.25rem]">{plan.description}</div>
      <ul className="text-[14px] leading-[20px] text-ink space-y-1.5 mb-5">
        {plan.perks.map((perk) => (
          <li key={`${plan.id}-${perk}`} className="flex items-start gap-2">
            <Check className="w-4 h-4 text-brand mt-0.5 shrink-0" />
            <span>{perk}</span>
          </li>
        ))}
      </ul>
      {cta}
    </div>
  );
}
