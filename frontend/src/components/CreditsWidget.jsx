import { useEffect, useState, useCallback } from "react";
import { NavLink } from "react-router-dom";
import { api } from "@/lib/api";
import { Sparkles, Zap, AlertCircle } from "lucide-react";

/** Compact credits widget shown in the sidebar. Polls /billing/usage on mount
 * and listens for the `teamnest:credits-changed` window event so other parts
 * of the app can request a refresh after running an AI prompt.
 */
const POLL_MS = 60_000;

export default function CreditsWidget({ collapsed = false }) {
  const [usage, setUsage] = useState(null);

  const fetchUsage = useCallback(async () => {
    try {
      const { data } = await api.get("/billing/usage");
      setUsage(data);
    } catch {
      // Silent — widget is best-effort.
    }
  }, []);

  useEffect(() => {
    fetchUsage();
    const t = setInterval(fetchUsage, POLL_MS);
    const onChange = () => fetchUsage();
    window.addEventListener("teamnest:credits-changed", onChange);
    return () => {
      clearInterval(t);
      window.removeEventListener("teamnest:credits-changed", onChange);
    };
  }, [fetchUsage]);

  if (!usage) return null;
  const unlimited = !!usage.unlimited;
  const pct = unlimited
    ? 100
    : usage.credits_total
      ? Math.min(100, Math.round((usage.credits_used / usage.credits_total) * 100))
      : 0;
  const tone =
    unlimited ? "emerald" : usage.exhausted ? "red" : usage.low ? "yellow" : "emerald";
  const toneClasses = {
    emerald: { bar: "bg-emerald-500", text: "text-emerald-300" },
    yellow:  { bar: "bg-yellow-500",  text: "text-yellow-300" },
    red:     { bar: "bg-red-500",     text: "text-red-400" },
  }[tone];

  if (collapsed) {
    // Compact icon-only state for collapsed desktop sidebar
    return (
      <NavLink
        to="/billing"
        data-testid="credits-widget-icon"
        title={unlimited ? `Unlimited credits — ${usage.plan_name} plan` : `${usage.credits_remaining} credits left — ${usage.plan_name} plan`}
        className="hidden md:flex items-center justify-center py-2 text-zinc-500 hover:text-yellow-200"
      >
        <Sparkles className={`w-4 h-4 ${toneClasses.text}`} />
      </NavLink>
    );
  }

  return (
    <NavLink
      to="/billing"
      data-testid="credits-widget"
      className="block px-3 py-2.5 mx-3 mb-2 rounded-xl bg-white/[0.04] hover:bg-yellow-500/[0.08] transition-colors group"
    >
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5 text-xs text-zinc-300">
          <Sparkles className="w-3.5 h-3.5 text-yellow-400" />
          <span className="capitalize">{usage.plan_name} plan</span>
        </div>
        {usage.exhausted && !unlimited ? (
          <span className="text-xs font-medium text-red-400">Empty</span>
        ) : usage.low && !unlimited ? (
          <span className="text-xs font-medium text-yellow-300">Low</span>
        ) : unlimited ? (
          <span className="text-xs font-medium text-emerald-300">Unlimited</span>
        ) : null}
      </div>
      <div className="text-sm font-semibold text-zinc-100 mb-1.5">
        {unlimited ? (
          <span data-testid="credits-unlimited">Unlimited credits</span>
        ) : (
          <>
            {usage.credits_remaining.toLocaleString()}
            <span className="text-zinc-500 text-xs font-normal"> / {usage.credits_total.toLocaleString()} credits</span>
          </>
        )}
      </div>
      <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
        <div className={`h-full transition-all ${toneClasses.bar}`} style={{ width: `${pct}%` }} />
      </div>
      {(usage.low || usage.exhausted) && !unlimited && usage.plan_id !== "team" && (
        <div className={`mt-2 inline-flex items-center gap-1 text-xs font-medium ${toneClasses.text} group-hover:text-yellow-200`}>
          {usage.exhausted ? <AlertCircle className="w-3 h-3" /> : <Zap className="w-3 h-3" />}
          Upgrade →
        </div>
      )}
    </NavLink>
  );
}
