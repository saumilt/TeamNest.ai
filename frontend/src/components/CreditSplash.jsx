import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Coins, X, Sparkles } from "lucide-react";

/** Login splash: admin-configured credit specials + top-up purchase.
 *  Also confirms ?credit_session_id= returns from Stripe. */
export default function CreditSplash() {
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("buy"); // 'buy' | 'low'
  const [remaining, setRemaining] = useState(null);
  const [buying, setBuying] = useState(null);
  const [custom, setCustom] = useState("");
  const [params, setParams] = useSearchParams();

  // Confirm a Stripe checkout return (?credit_session_id=).
  useEffect(() => {
    const sid = params.get("credit_session_id");
    if (!sid) return;
    let attempts = 0;
    const poll = async () => {
      attempts += 1;
      try {
        const { data } = await api.get(`/billing/credits/status/${sid}`);
        if (data.payment_status === "paid") {
          toast.success(`+${data.credits} credits added to your workspace 🎉`);
          params.delete("credit_session_id");
          setParams(params, { replace: true });
          window.dispatchEvent(new Event("teamnest:credits-changed"));
          return;
        }
      } catch { /* retry */ }
      if (attempts < 20) setTimeout(poll, 2500);
      else toast.info("Payment received — credits will appear within a minute.");
    };
    poll();
  }, []);

  // Load packs/promo + decide whether to AUTO-open. The buy-credits prompt only
  // auto-surfaces when the workspace is on the Free plan OR has < 100 credits
  // left — never for unlimited workspaces, at most once per session, and never
  // if the user chose "Don't show this again".
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [{ data: packs }, { data: me }] = await Promise.all([
          api.get("/billing/credit-packs"),
          api.get("/billing/me"),
        ]);
        if (cancelled) return;
        setData(packs);
        const usage = me?.usage || {};
        setRemaining(typeof usage.credits_remaining === "number" ? usage.credits_remaining : null);
        const hidden = safeGet("local", "tn-credit-splash-hidden") === "1";
        const shownThisSession = safeGet("session", "tn-credit-splash-shown") === "1";
        const low = typeof usage.credits_remaining === "number" && usage.credits_remaining < 100;
        const eligible = !usage.unlimited && (usage.plan_id === "free" || low);
        if (eligible && !hidden && !shownThisSession) {
          setReason(low ? "low" : "buy");
          // 4s delay so it doesn't stack on top of the changelog modal.
          setTimeout(() => {
            if (cancelled) return;
            setOpen(true);
            safeSet("session", "tn-credit-splash-shown", "1");
          }, 4000);
        }
      } catch { /* noop */ }
    })();
    return () => { cancelled = true; };
  }, []);

  // The persistent Credits badge (or anywhere) can open the buy sheet on demand.
  useEffect(() => {
    const openBuy = () => { setReason("buy"); setOpen(true); };
    window.addEventListener("teamnest:open-credit-splash", openBuy);
    return () => window.removeEventListener("teamnest:open-credit-splash", openBuy);
  }, []);

  const dismiss = () => {
    setOpen(false);
    safeSet("session", "tn-credit-splash-shown", "1");
  };

  const dontShowAgain = () => {
    setOpen(false);
    safeSet("local", "tn-credit-splash-hidden", "1");
    safeSet("session", "tn-credit-splash-shown", "1");
  };

  const buy = async (packId, customAmount) => {
    setBuying(packId || "custom");
    try {
      const { data } = await api.post("/billing/credits/checkout", {
        pack_id: packId || undefined,
        custom_amount_usd: customAmount || undefined,
        origin_url: window.location.origin,
      });
      window.location.href = data.url;
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not start checkout");
      setBuying(null);
    }
  };

  if (!open || !data) return null;
  const { packs = [], promo = {} } = data;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" data-testid="credit-splash">
      <div className="w-full max-w-2xl rounded-2xl bg-surface ring-1 ring-hairline overflow-hidden max-h-[90vh] flex flex-col">
        <div className="flex items-center gap-2.5 px-5 py-4 border-b border-hairline shrink-0">
          <Coins className="w-5 h-5 text-amber-300" />
          <div className="text-[15px] font-semibold text-ink flex-1">
            {reason === "low" ? "You're almost out of credits" : (promo.splash_title || "Purchase credits")}
          </div>
          <button type="button" onClick={dismiss} data-testid="credit-splash-close"
            className="p-1.5 rounded-full text-ink-mute hover:text-ink hover:bg-surface-2">
            <X className="w-4.5 h-4.5" style={{ width: 18, height: 18 }} />
          </button>
        </div>

        {reason === "low" && remaining !== null && (
          <div className="mx-5 mt-4 rounded-xl bg-rose-500/10 ring-1 ring-rose-500/25 px-4 py-2.5 text-[12.5px] text-rose-300 shrink-0" data-testid="credit-splash-low-banner">
            Only <strong>{remaining}</strong> credits left — top up now so @devmanager and your AI employees keep working.
          </div>
        )}

        {promo.banner && (
          <div className="mx-5 mt-4 rounded-xl bg-amber-400/10 ring-1 ring-amber-400/25 px-4 py-2.5 text-[12.5px] text-amber-200 shrink-0" data-testid="credit-splash-banner">
            <Sparkles className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5" />{promo.banner}
          </div>
        )}

        <div className="p-5 overflow-y-auto">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {packs.map((p) => {
              const hasBonus = (p.bonus_pct || 0) > 0;
              return (
                <div key={p.id} data-testid={`credit-pack-${p.id}`}
                  className={`relative rounded-xl p-4 text-center ring-1 ${
                    hasBonus ? "bg-emerald-500/[0.06] ring-emerald-500/30" : "bg-surface-2 ring-hairline"}`}>
                  {hasBonus && (
                    <span className="absolute -top-2 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full bg-emerald-500 text-black text-[10px] font-bold whitespace-nowrap">
                      {promo.badge || `${p.bonus_pct}% more`}
                    </span>
                  )}
                  {hasBonus && (
                    <div className="text-[11px] text-ink-mute line-through">{p.credits.toLocaleString()} credits</div>
                  )}
                  <div className="text-[16px] font-bold text-ink">{p.total_credits.toLocaleString()} credits</div>
                  <div className="text-[14px] font-mono text-emerald-300 mb-3">${p.price_usd.toLocaleString()}</div>
                  <button type="button" disabled={!!buying} onClick={() => buy(p.id)}
                    data-testid={`credit-pack-buy-${p.id}`}
                    className={`w-full h-9 rounded-pill font-semibold text-[12px] disabled:opacity-40 ${
                      hasBonus ? "bg-emerald-500 hover:bg-emerald-400 text-black" : "bg-surface-3 hover:bg-ink/10 text-ink"}`}>
                    {buying === p.id ? "Redirecting…" : "Buy now"}
                  </button>
                </div>
              );
            })}
          </div>

          <div className="mt-4">
            <label className="block text-[11px] uppercase tracking-wider font-semibold text-ink-mute mb-1.5">Custom amount</label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-mute text-[13px]">$</span>
                <input type="number" min="5" max="10000" value={custom}
                  onChange={(e) => setCustom(e.target.value)}
                  placeholder="Enter custom amount"
                  data-testid="credit-custom-amount"
                  className="w-full h-10 pl-7 pr-3 rounded-lg bg-surface-2 ring-1 ring-hairline text-[13px] text-ink outline-none focus:ring-amber-400/40 placeholder:text-ink-mute" />
              </div>
              <button type="button" disabled={!!buying || !(Number(custom) >= 5)}
                onClick={() => buy(null, Number(custom))}
                data-testid="credit-custom-buy"
                className="h-10 px-4 rounded-pill bg-amber-300 hover:bg-amber-200 text-black font-semibold text-[12px] disabled:opacity-40 whitespace-nowrap">
                Buy {Number(custom) >= 5 ? (Number(custom) * 5).toLocaleString() : 0} credits
              </button>
            </div>
            <p className="text-[11px] text-ink-mute mt-2">$1 = 5 credits · Secure checkout via Stripe · Credits never expire</p>
          </div>
        </div>

        <div className="px-5 py-3 border-t border-hairline shrink-0 flex items-center justify-between">
          <button
            type="button"
            onClick={dontShowAgain}
            data-testid="credit-splash-dont-show"
            className="text-[12px] text-ink-mute hover:text-ink underline underline-offset-2"
          >
            Don&apos;t show this again
          </button>
          <button
            type="button"
            onClick={dismiss}
            data-testid="credit-splash-maybe-later"
            className="text-[12px] text-ink-mute hover:text-ink"
          >
            Maybe later
          </button>
        </div>
      </div>
    </div>
  );
}

// UI prefs only — never throw if storage is unavailable (private mode, etc.).
function safeGet(kind, key) {
  try {
    return (kind === "local" ? localStorage : sessionStorage).getItem(key);
  } catch { return null; }
}
function safeSet(kind, key, val) {
  try {
    (kind === "local" ? localStorage : sessionStorage).setItem(key, val);
  } catch { /* noop */ }
}
