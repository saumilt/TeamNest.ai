import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { api } from "@/lib/api";
import { toast } from "sonner";

// One-time hire price comes from the backend (HIRE_DEVMANAGER_PRICE_USD) —
// cached module-wide so many buttons on a page fetch once.
let _pricePromise = null;
export function fetchHirePrice() {
  if (!_pricePromise) {
    _pricePromise = api
      .get("/hire-devmanager/config")
      .then(({ data }) => data.price_usd)
      .catch(() => null);
  }
  return _pricePromise;
}

export function useHirePrice() {
  const [price, setPrice] = useState(null);
  useEffect(() => {
    let cancelled = false;
    fetchHirePrice().then((p) => { if (!cancelled) setPrice(p); });
    return () => { cancelled = true; };
  }, []);
  return price;
}

const priceLabel = (price) =>
  price ? `Hire @devmanager · $${Math.round(price)}` : "Hire @devmanager";

/**
 * "Hire @devmanager" CTA — one-shot Stripe checkout. On payment success
 * Stripe redirects back to /chats/<id>?dev_team_session_id=... and Chats.jsx
 * polls the status endpoint to finalize provisioning.
 *
 * Variant `pill` is compact (chat header); `toolbar` is the Build Room
 * toolbar button; `banner` is the wide promo strip above the message list.
 */
export default function HireDevTeamButton({ chatId, variant = "pill", onStarted }) {
  const [busy, setBusy] = useState(false);
  const price = useHirePrice();

  const onClick = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const { data } = await api.post(
        `/chats/${chatId}/hire-dev-team/checkout`,
        { origin_url: window.location.origin },
      );
      // Demo workspaces skip Stripe and provision instantly. Show a toast,
      // refresh the page so the chat header pill + banner update.
      if (data.demo) {
        toast.success("🎉 @devmanager hired (demo mode) — kick things off!");
        setTimeout(() => window.location.reload(), 600);
        return;
      }
      onStarted?.();
      // Hard nav so Stripe's hosted checkout takes the whole tab.
      window.location.href = data.url;
    } catch (e) {
      const msg = e?.response?.data?.detail || "Could not start checkout";
      toast.error(msg);
      setBusy(false);
    }
  };

  if (variant === "banner") {
    return (
      <div
        data-testid="hire-dev-team-banner"
        className="mx-3 md:mx-6 mt-3 mb-1 rounded-2xl border border-amber-400/30 bg-gradient-to-r from-amber-400/10 via-amber-400/[0.04] to-transparent p-4 flex items-center gap-4"
      >
        <div className="hidden sm:flex w-10 h-10 rounded-xl bg-amber-400/15 ring-1 ring-amber-400/30 items-center justify-center text-amber-300">
          <Sparkles className="w-5 h-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-semibold text-ink leading-tight">
            Turn this chat into a full AI engineering team
          </div>
          <div className="text-[12px] text-ink-dim leading-snug mt-0.5">
            @devmanager — one AI that plans, architects, codes, tests and ships,
            permanently attached to this chat. One‑time payment, no subscription.
          </div>
        </div>
        <button
          type="button"
          onClick={onClick}
          disabled={busy}
          data-testid="hire-dev-team-banner-btn"
          className="shrink-0 inline-flex items-center gap-2 h-10 px-4 rounded-pill bg-amber-300 hover:bg-amber-200 text-black font-semibold text-[13px] disabled:opacity-60 active:scale-[0.98]"
        >
          <Sparkles className="w-4 h-4" />
          {busy ? "Opening checkout…" : priceLabel(price)}
        </button>
      </div>
    );
  }

  if (variant === "toolbar") {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        data-testid="hire-dev-team-toolbar"
        title="Hire @devmanager to ship this build (one-time payment)"
        className="inline-flex items-center gap-1.5 h-9 px-3 rounded-pill bg-amber-400/15 text-amber-200 ring-1 ring-amber-400/40 hover:bg-amber-400/25 text-[13px] font-semibold disabled:opacity-60 active:scale-[0.98]"
      >
        <Sparkles className="w-3.5 h-3.5" />
        {busy ? "Opening…" : priceLabel(price)}
      </button>
    );
  }

  // Pill variant (chat header)
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      data-testid="hire-dev-team-pill"
      title="Hire @devmanager for this chat (one-time payment)"
      className="mt-0.5 ml-1 inline-flex items-center gap-1 h-5 px-2 rounded-full bg-amber-400/15 text-amber-200 ring-1 ring-amber-400/30 text-[11px] font-medium hover:bg-amber-400/25 disabled:opacity-60"
    >
      <Sparkles className="w-3 h-3" />
      {busy ? "Opening…" : priceLabel(price)}
    </button>
  );
}
