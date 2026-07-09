import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Flame, Sparkles } from "lucide-react";

/**
 * CreditsBadge — persistent top-right "Buy Credits" pill. It shows the current
 * promotion bonus (configured by the Super Admin) and, for metered workspaces,
 * the remaining balance. Tapping it opens the Purchase Credits splash
 * (CreditSplash listens for the `teamnest:open-credit-splash` event).
 *
 * It is a single compact pill so it never overlaps a screen's header controls
 * (headers reserve right padding for it).
 */
export default function CreditsBadge() {
  const [usage, setUsage] = useState(null);
  const [bonusPct, setBonusPct] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const [{ data: u }, { data: packs }] = await Promise.all([
        api.get("/billing/usage"),
        api.get("/billing/credit-packs"),
      ]);
      setUsage(u);
      const promoOn = !!packs?.promo?.enabled;
      const maxBonus = Math.max(
        0,
        ...((packs?.packs || []).map((p) => Number(p.bonus_pct) || 0)),
      );
      setBonusPct(promoOn ? maxBonus : 0);
    } catch {
      /* best-effort */
    }
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 60_000);
    const onChange = () => refresh();
    window.addEventListener("teamnest:credits-changed", onChange);
    return () => {
      clearInterval(t);
      window.removeEventListener("teamnest:credits-changed", onChange);
    };
  }, [refresh]);

  if (!usage) return null;
  const unlimited = !!usage.unlimited;
  const remaining = unlimited ? "∞" : usage.credits_remaining ?? 0;
  const openSplash = () => window.dispatchEvent(new Event("teamnest:open-credit-splash"));

  return (
    <div className="fixed top-2.5 right-3 z-40" data-testid="credits-badge">
      <button
        type="button"
        data-testid="credits-badge-buy"
        onClick={openSplash}
        title="Buy credits"
        aria-label="Buy credits"
        className="flex items-center gap-1.5 h-9 pl-2.5 pr-2 rounded-full bg-amber-300 hover:bg-amber-200 shadow-lg ring-1 ring-black/10 active:scale-95 transition-transform"
      >
        {/* Remaining balance — metered workspaces only */}
        <span className="flex items-center gap-1 text-black" data-testid="credits-badge-count">
          <Flame className="w-3.5 h-3.5 text-emerald-600" fill="currentColor" />
          <span className="text-[12px] font-extrabold tabular-nums leading-none">
            {typeof remaining === "number" ? remaining.toLocaleString() : remaining}
          </span>
        </span>

        <span className="w-px h-4 bg-black/15" aria-hidden="true" />

        <Sparkles className="w-3.5 h-3.5 text-black" />
        <span className="hidden sm:inline text-[12.5px] font-extrabold text-black whitespace-nowrap">
          Buy Credits
        </span>

        {bonusPct > 0 && (
          <span
            className="px-1.5 py-0.5 rounded-full bg-black text-amber-300 text-[10px] font-extrabold whitespace-nowrap leading-none"
            data-testid="credits-badge-bonus"
          >
            +{bonusPct}%
          </span>
        )}
      </button>
    </div>
  );
}
