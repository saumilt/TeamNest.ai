import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ExternalLink, Settings } from "lucide-react";
import SegmentedControl from "@/components/ui-v2/SegmentedControl";
import BillingUsageCard from "@/components/billing/BillingUsageCard";
import BillingPlanCard from "@/components/billing/BillingPlanCard";
import EduVerifyDialog from "@/components/billing/EduVerifyDialog";
import CreditGovernance from "@/components/billing/CreditGovernance";

const POLL_INTERVAL_MS = 2000;
const MAX_POLL_ATTEMPTS = 5;

const BILLING_CYCLE_OPTIONS = [
  { value: "monthly", label: "Monthly" },
  { value: "annual", label: "Annual (save 17%)" },
];

export default function Billing() {
  const location = useLocation();
  const nav = useNavigate();
  const [plans, setPlans] = useState([]);
  const [billing, setBilling] = useState(null);
  const [busy, setBusy] = useState(null);
  const [loading, setLoading] = useState(true);
  const [polling, setPolling] = useState(false);
  const [billingCycle, setBillingCycle] = useState("monthly");
  const [launchAccess, setLaunchAccess] = useState(null);
  const [eduOpen, setEduOpen] = useState(false);
  const pollTimer = useRef(null);

  const load = async () => {
    try {
      const [plansRes, meRes, accessRes] = await Promise.all([
        api.get("/billing/plans"),
        api.get("/billing/me"),
        api.get("/launch/my-access").catch(() => ({ data: { can_checkout: true } })),
      ]);
      setPlans(plansRes.data.plans || []);
      setBilling(meRes.data);
      setLaunchAccess(accessRes.data);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not load billing");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // Stripe redirect: ?session_id=... → poll until paid.
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const sessionId = params.get("session_id");
    const canceled = params.get("canceled");
    if (canceled === "1") {
      toast.info("Checkout canceled — no charge was made.");
      nav("/billing", { replace: true });
      return;
    }
    if (!sessionId) return;
    let attempts = 0;
    setPolling(true);

    const poll = async () => {
      attempts += 1;
      try {
        const { data } = await api.get(`/billing/checkout/status/${sessionId}`);
        if (data.applied) {
          toast.success(`🎉 You're on the ${data.plan_id.toUpperCase()} plan!`);
          setPolling(false);
          await load();
          nav("/billing", { replace: true });
          return;
        }
        if (data.payment_status === "unpaid" && data.status === "expired") {
          toast.error("Checkout expired without a successful payment.");
          setPolling(false);
          nav("/billing", { replace: true });
          return;
        }
        if (attempts >= MAX_POLL_ATTEMPTS) {
          toast.info("Payment is still processing. Refresh in a minute or check Billing again.");
          setPolling(false);
          return;
        }
        pollTimer.current = setTimeout(poll, POLL_INTERVAL_MS);
      } catch (e) {
        setPolling(false);
        toast.error(e?.response?.data?.detail || "Could not verify payment");
      }
    };
    poll();
    return () => { if (pollTimer.current) clearTimeout(pollTimer.current); };
  }, [location.search, nav]); // eslint-disable-line react-hooks/exhaustive-deps

  const checkout = async (planId) => {
    if (planId === "free") {
      if (!confirm("Downgrade to the free plan? You'll lose access to premium features and your credit allowance drops to 300/month.")) return;
      setBusy(planId);
      try {
        await api.post("/billing/downgrade", { confirm: true });
        toast.success("Downgraded to free plan");
        await load();
      } catch (e) {
        toast.error(e?.response?.data?.detail || "Could not downgrade");
      } finally { setBusy(null); }
      return;
    }
    if (planId === "student" && !billing?.edu_verified) {
      setEduOpen(true);
      return;
    }
    setBusy(planId);
    try {
      const { data } = await api.post("/billing/checkout", {
        plan_id: planId,
        origin_url: window.location.origin,
        billing_cycle: billingCycle,
      });
      window.location.assign(data.url);
    } catch (e) {
      if (planId === "student" && e?.response?.data?.detail === "edu_verification_required") {
        setEduOpen(true);
        setBusy(null);
        return;
      }
      toast.error(e?.response?.data?.detail || "Could not start checkout");
      setBusy(null);
    }
  };

  const openPortal = async () => {
    setBusy("portal");
    try {
      const { data } = await api.post("/billing/portal", {
        return_url: window.location.origin + "/billing",
      });
      window.location.assign(data.url);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not open billing portal");
      setBusy(null);
    }
  };

  const isOwner = billing?.is_owner;

  return (
    <div className="min-h-[100dvh] bg-bg pb-24 md:pb-12 text-ink">
      <div className="px-5 md:px-10 pt-8 md:pt-12 pb-4 max-w-3xl mx-auto">
        <h1 className="text-[28px] md:text-[34px] leading-[34px] md:leading-[40px] font-bold tracking-[-0.02em] mb-2">
          Billing &amp; AI credits
        </h1>
        <p className="text-[14px] leading-[22px] text-ink-dim">
          Manage your workspace plan and AI credit usage. Premium models charge more credits per response.
        </p>
      </div>

      <div className="px-4 md:px-10 max-w-3xl mx-auto">
        {loading ? (
          <div className="h-44 rounded-card bg-surface animate-pulse mb-6" />
        ) : (
          <BillingUsageCard usage={billing?.usage} polling={polling} />
        )}
      </div>

      {!loading && launchAccess && launchAccess.can_checkout === false && (
        <div className="px-4 md:px-10 max-w-3xl mx-auto mb-6" data-testid="billing-launch-gate">
          <div className="rounded-2xl border border-amber-400/30 bg-amber-400/[0.06] p-6 text-center">
            <div className="text-[15px] font-semibold text-ink mb-1">
              TeamNest paid plans are currently available only to invited members.
            </div>
            <div className="text-[13px] text-ink-dim mb-4">
              We are opening access gradually so early users get a better onboarding experience.
            </div>
            <div className="flex justify-center gap-2 flex-wrap">
              <a href="/waitlist" data-testid="billing-gate-waitlist"
                className="h-9 px-4 rounded-pill bg-amber-300 text-black font-semibold text-[13px] inline-flex items-center hover:bg-amber-200">Join Waitlist</a>
              <a href="/invite" data-testid="billing-gate-invite"
                className="h-9 px-4 rounded-pill ring-1 ring-hairline text-ink-dim text-[13px] inline-flex items-center hover:text-ink">Enter Invite Code</a>
              <a href="/waitlist" data-testid="billing-gate-founder"
                className="h-9 px-4 rounded-pill ring-1 ring-hairline text-ink-dim text-[13px] inline-flex items-center hover:text-ink">Request Founder Access</a>
            </div>
          </div>
        </div>
      )}

      {!loading && isOwner && (!launchAccess || launchAccess.can_checkout !== false) && (
        <div className="px-4 md:px-10 max-w-3xl mx-auto mb-5 flex items-center justify-between gap-3 flex-wrap" data-testid="billing-controls">
          <SegmentedControl
            testid="billing-cycle-toggle"
            value={billingCycle}
            onChange={setBillingCycle}
            options={BILLING_CYCLE_OPTIONS}
          />
          {billing?.usage?.plan_id !== "free" ? (
            <Button
              data-testid="billing-manage-portal"
              onClick={openPortal}
              disabled={busy === "portal"}
              variant="outline"
              className="border-hairline bg-transparent hover:bg-white/5 rounded-full text-[13px] h-10 px-4"
            >
              {busy === "portal" ? "Opening…" : (<><Settings className="w-3.5 h-3.5 mr-1.5" /> Manage subscription</>)}
            </Button>
          ) : (
            <span
              data-testid="billing-portal-hint"
              className="text-[12px] text-ink-mute"
            >
              Manage subscription &amp; cards become available after upgrade.
            </span>
          )}
        </div>
      )}

      {(!launchAccess || launchAccess.can_checkout !== false) && (
        <>
          <div className="px-4 md:px-10 max-w-3xl mx-auto space-y-3" data-testid="billing-plans">
            {plans.map((p) => (
              <BillingPlanCard
                key={p.id}
                plan={p}
                billing={billing}
                billingCycle={billingCycle}
                busy={busy}
                onCheckout={checkout}
              />
            ))}
          </div>

          <HostingSection billing={billing} onChanged={load} />
        </>
      )}

      {!loading && <CreditGovernance />}

      <EduVerifyDialog
        open={eduOpen}
        onClose={() => setEduOpen(false)}
        onVerified={async () => { await load(); checkout("student"); }}
      />

      <div className="px-4 md:px-10 max-w-3xl mx-auto mt-6 text-[12px] text-ink-mute leading-relaxed flex flex-wrap items-center gap-x-2 gap-y-1">
        <ExternalLink className="w-3 h-3" />
        Cancel anytime · Secure payments via Stripe · 14-day money-back
      </div>
    </div>
  );
}

const HOSTING_TIERS = [
  { id: "shared", name: "Shared hosting", price: 0, desc: "Shared cluster · 512 MB Mongo · subdomain" },
  { id: "pro-db", name: "Pro Database", price: 19, desc: "5 GB dedicated Mongo · daily backups · custom domains" },
  { id: "dedicated", name: "Dedicated", price: 99, desc: "Isolated cluster · 50 GB · PITR · 99.9% SLA" },
];

function HostingSection({ billing, onChanged }) {
  const [busy, setBusy] = useState(null);
  const current = billing?.usage?.hosting_tier || "shared";

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sid = params.get("hosting_session_id");
    if (!sid) return;
    let attempts = 0;
    const poll = async () => {
      attempts += 1;
      try {
        const { data } = await api.get(`/billing/hosting/status/${sid}`);
        if (data.payment_status === "paid") {
          toast.success(`Hosting upgraded to ${data.hosting_tier} 🎉`);
          window.history.replaceState({}, "", "/billing");
          onChanged();
          return;
        }
      } catch { /* retry */ }
      if (attempts < 20) setTimeout(poll, 2500);
      else toast.info("Payment received — hosting will upgrade within a minute.");
    };
    poll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const choose = async (tier) => {
    setBusy(tier.id);
    try {
      if (tier.id === "shared") {
        await api.post("/billing/hosting/downgrade");
        toast.success("Switched to shared hosting");
        onChanged();
      } else {
        const { data } = await api.post("/billing/hosting/checkout", {
          tier: tier.id, origin_url: window.location.origin,
        });
        window.location.href = data.url;
        return;
      }
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not change hosting");
    }
    setBusy(null);
  };

  return (
    <div className="px-4 md:px-10 max-w-3xl mx-auto mt-8" data-testid="hosting-section">
      <div className="text-[13px] font-semibold text-ink mb-1">Hosting add-on</div>
      <p className="text-[12px] text-ink-mute mb-3">
        Infrastructure for your published apps — MongoDB, storage and bandwidth, billed monthly on top of your plan.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {HOSTING_TIERS.map((t) => {
          const isCurrent = current === t.id;
          return (
            <div key={t.id} data-testid={`hosting-tier-${t.id}`}
              className={`rounded-xl p-4 ring-1 ${isCurrent ? "bg-amber-400/[0.06] ring-amber-400/40" : "bg-surface ring-hairline"}`}>
              <div className="text-[13px] font-semibold text-ink">{t.name}</div>
              <div className="text-[18px] font-bold text-ink my-1">
                {t.price === 0 ? "Included" : `$${t.price}`}
                {t.price > 0 && <span className="text-[11px] text-ink-mute font-medium">/mo</span>}
              </div>
              <p className="text-[11px] text-ink-mute mb-3 leading-relaxed">{t.desc}</p>
              <button type="button" disabled={isCurrent || !!busy}
                onClick={() => choose(t)}
                data-testid={`hosting-choose-${t.id}`}
                className={`w-full h-8 rounded-pill text-[12px] font-semibold disabled:opacity-50 ${
                  isCurrent ? "bg-surface-2 text-ink-mute" : "bg-amber-300 hover:bg-amber-200 text-black"}`}>
                {isCurrent ? "Current" : busy === t.id ? "Redirecting…" : t.price === 0 ? "Switch" : "Upgrade"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
