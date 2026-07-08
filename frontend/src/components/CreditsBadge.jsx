import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Flame, Sparkles } from "lucide-react";

/**
 * CreditsBadge — persistent top-right pill showing the workspace's remaining AI
 * credits and (when a promo is active) the current bonus percentage. Tapping the
 * "Credits" pill opens the buy-credits sheet (CreditSplash listens for the
 * `teamnest:open-credit-splash` event). It stays steady on every screen.
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

  return (
    <div
      className="fixed top-2.5 right-3 z-40 flex items-center gap-1.5 pointer-events-none"
      data-testid="credits-badge"
    >
      <div className="pointer-events-auto flex items-center gap-1.5 h-9 px-3 rounded-full bg-white shadow-lg ring-1 ring-black/5">
        <Flame className="w-4 h-4 text-emerald-500" fill="currentColor" />
        <span className="text-[13px] font-extrabold text-black tabular-nums" data-testid="credits-badge-count">
          {typeof remaining === "number" ? remaining.toLocaleString() : remaining}
        </span>
      </div>

      {!unlimited && (
        <button
          type="button"
          data-testid="credits-badge-buy"
          onClick={() => window.dispatchEvent(new Event("teamnest:open-credit-splash"))}
          title="Buy credits"
          className="pointer-events-auto flex items-center gap-1.5 h-9 pl-3 pr-1.5 rounded-full bg-amber-300 hover:bg-amber-200 shadow-lg ring-1 ring-black/5 active:scale-95 transition-transform"
        >
          <Sparkles className="w-4 h-4 text-black" />
          <span className="text-[13px] font-extrabold text-black">Credits</span>
          {bonusPct > 0 && (
            <span
              className="ml-0.5 px-2 py-0.5 rounded-full bg-white text-black text-[11px] font-extrabold whitespace-nowrap"
              data-testid="credits-badge-bonus"
            >
              {bonusPct}% more
            </span>
          )}
        </button>
      )}
    </div>
  );
}
