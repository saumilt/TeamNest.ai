import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { AlertTriangle, Gauge, X } from "lucide-react";

/**
 * BudgetNudge — a slim, dismissible in-app banner that proactively warns the
 * current user when they near an AI credit cap set by their workspace admin
 * (personal / workspace / enterprise governance caps). It reads
 * `/credit-governance/my-budget` (tightest cap = `nearest`) and only appears at
 * >= 80% usage. Dismissal is per-threshold-bucket for the session, so crossing
 * from 80% into 100% re-surfaces it.
 */
const NUDGE_AT = 80;

export default function BudgetNudge() {
  const [nearest, setNearest] = useState(null);
  const [dismissedBucket, setDismissedBucket] = useState(() => safeGet("tn-budget-nudge-dismissed"));

  const refresh = useCallback(async () => {
    try {
      const { data } = await api.get("/credit-governance/my-budget");
      setNearest(data?.nearest || null);
    } catch {
      /* best-effort — no caps or not permitted */
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

  if (!nearest || nearest.pct < NUDGE_AT) return null;
  const maxed = nearest.pct >= 100;
  const bucket = maxed ? "100" : "80";
  if (dismissedBucket === bucket) return null;

  const dismiss = () => {
    setDismissedBucket(bucket);
    safeSet("tn-budget-nudge-dismissed", bucket);
  };

  return (
    <div
      className="fixed left-1/2 -translate-x-1/2 z-40 bottom-[calc(env(safe-area-inset-bottom)+72px)] md:bottom-4 w-[calc(100%-1.5rem)] max-w-md"
      data-testid="budget-nudge"
    >
      <div
        className={`flex items-start gap-3 rounded-xl px-4 py-3 shadow-2xl ring-1 backdrop-blur-md ${
          maxed
            ? "bg-rose-950/90 ring-rose-500/40"
            : "bg-amber-950/90 ring-amber-500/40"
        }`}
        data-testid={`budget-nudge-${maxed ? "maxed" : "warn"}`}
      >
        <div className={`mt-0.5 ${maxed ? "text-rose-400" : "text-amber-400"}`}>
          {maxed ? <AlertTriangle className="w-4.5 h-4.5" style={{ width: 18, height: 18 }} />
                 : <Gauge className="w-4.5 h-4.5" style={{ width: 18, height: 18 }} />}
        </div>
        <div className="flex-1 min-w-0">
          <div className={`text-[13px] font-semibold ${maxed ? "text-rose-100" : "text-amber-100"}`}>
            {maxed
              ? `You've used all of ${nearest.label} AI credit budget`
              : `You're at ${nearest.pct}% of ${nearest.label} AI credit budget`}
          </div>
          <div className="mt-0.5 text-[11.5px] text-white/60 tabular-nums" data-testid="budget-nudge-usage">
            {nearest.used.toLocaleString()} / {nearest.limit.toLocaleString()} credits this month
            {!maxed && ` · ${nearest.remaining.toLocaleString()} left`}
          </div>
          {/* Usage meter */}
          <div className="mt-2 h-1.5 rounded-full bg-white/10 overflow-hidden" aria-hidden="true">
            <div
              className={`h-full rounded-full ${maxed ? "bg-rose-500" : "bg-amber-400"}`}
              style={{ width: `${Math.min(100, nearest.pct)}%` }}
            />
          </div>
          <div className="mt-2 text-[11px] text-white/45">
            {maxed
              ? "AI is paused until your admin raises the cap or the monthly reset."
              : "AI pauses automatically once you hit 100%. Ask your admin to raise it if needed."}
          </div>
        </div>
        <button
          type="button"
          onClick={dismiss}
          data-testid="budget-nudge-dismiss"
          aria-label="Dismiss"
          className="p-1 -mr-1 -mt-1 rounded-full text-white/40 hover:text-white/80 hover:bg-white/10"
        >
          <X style={{ width: 15, height: 15 }} />
        </button>
      </div>
    </div>
  );
}

function safeGet(key) {
  try { return sessionStorage.getItem(key); } catch { return null; }
}
function safeSet(key, val) {
  try { sessionStorage.setItem(key, val); } catch { /* noop */ }
}
