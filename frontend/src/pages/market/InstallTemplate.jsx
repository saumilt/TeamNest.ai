import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams, Link } from "react-router-dom";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Loader2, Rocket, ShieldCheck, CreditCard, ExternalLink } from "lucide-react";

/** /market/install/:templateId — installs a template (paying first if needed). */
export default function InstallTemplate() {
  const { templateId } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [template, setTemplate] = useState(null);
  const [phase, setPhase] = useState("loading"); // loading | pay | paying | installing | error
  const [error, setError] = useState("");
  const startedRef = useRef(false);

  const install = useCallback(async () => {
    setPhase("installing");
    try {
      const { data } = await api.post(`/market/templates/${templateId}/install`);
      toast.success("Template installed — opening your new project");
      navigate(`/dev-os/projects/${data.project_id}/studio`, { replace: true });
    } catch (e) {
      if (e?.response?.status === 402) {
        setPhase("pay");
      } else {
        setError(e?.response?.data?.detail || "Install failed");
        setPhase("error");
      }
    }
  }, [templateId, navigate]);

  useEffect(() => {
    api.get(`/market/templates/${templateId}`)
      .then(({ data }) => setTemplate(data))
      .catch(() => { setError("Template not found"); setPhase("error"); });
  }, [templateId]);

  useEffect(() => {
    if (!template || startedRef.current) return;
    startedRef.current = true;
    const sessionId = params.get("session_id");
    if (sessionId) {
      setPhase("paying");
      let attempts = 0;
      const poll = async () => {
        attempts += 1;
        try {
          const { data } = await api.get(`/market/checkout/status/${sessionId}`);
          if (data.payment_status === "paid") return install();
          if (data.status === "expired") {
            setError("Payment session expired — please try again.");
            return setPhase("pay");
          }
        } catch { /* keep polling */ }
        if (attempts < 24) setTimeout(poll, 2500);
        else {
          setError("Payment received but still confirming — your template will unlock automatically within a minute. Refresh this page to retry.");
          setPhase("error");
        }
      };
      poll();
    } else {
      install();
    }
  }, [template, params, install]);

  const startCheckout = async () => {
    setPhase("paying");
    try {
      const { data } = await api.post(`/market/templates/${templateId}/checkout`, {
        origin_url: window.location.origin,
      });
      window.location.href = data.url;
    } catch (e) {
      setError(e?.response?.data?.detail || "Could not start checkout");
      setPhase("error");
    }
  };

  const pricing = template?.pricing || {};
  const priceLabel = pricing.model === "monthly" ? `$${pricing.price_usd}/month` : `$${pricing.price_usd} one-time`;

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4" data-testid="install-template-page">
      <div className="w-full max-w-md rounded-2xl bg-surface ring-1 ring-hairline p-8 text-center">
        {!template && phase !== "error" ? (
          <Loader2 className="w-6 h-6 animate-spin mx-auto text-ink-mute" />
        ) : phase === "error" ? (
          <>
            <div className="text-[15px] font-semibold text-rose-300 mb-2">Something went wrong</div>
            <p className="text-[13px] text-ink-mute mb-5" data-testid="install-error">{error}</p>
            <Link to="/templates" className="text-[13px] text-amber-300 hover:text-amber-200">← Back to templates</Link>
          </>
        ) : phase === "pay" ? (
          <>
            <CreditCard className="w-8 h-8 mx-auto text-amber-300 mb-3" />
            <div className="text-[16px] font-semibold text-ink mb-1">{template.name}</div>
            <p className="text-[13px] text-ink-mute mb-1">{template.tagline}</p>
            <div className="text-[22px] font-bold text-amber-300 my-4" data-testid="install-price">{priceLabel}</div>
            {pricing.model === "monthly" && (
              <p className="text-[11px] text-ink-mute mb-3">Billed monthly. Cancel anytime from Billing.</p>
            )}
            <button
              type="button"
              onClick={startCheckout}
              data-testid="install-pay-btn"
              className="w-full h-11 rounded-pill bg-amber-300 hover:bg-amber-200 text-black font-semibold text-[14px] inline-flex items-center justify-center gap-2"
            >
              <ShieldCheck className="w-4 h-4" /> Pay with Stripe
            </button>
            <a
              href={`${process.env.REACT_APP_BACKEND_URL}/api/market/templates/${templateId}/demo/index.html`}
              target="_blank" rel="noopener noreferrer"
              className="mt-3 inline-flex items-center gap-1.5 text-[12px] text-ink-mute hover:text-ink"
            >
              Try the live demo first <ExternalLink className="w-3 h-3" />
            </a>
          </>
        ) : (
          <>
            <Rocket className="w-8 h-8 mx-auto text-amber-300 mb-3 animate-pulse" />
            <div className="text-[15px] font-semibold text-ink mb-1">
              {phase === "paying" ? "Confirming your payment…" : `Installing ${template?.name || "template"}…`}
            </div>
            <p className="text-[13px] text-ink-mute">This takes a few seconds — you'll land in your new Build Room.</p>
          </>
        )}
      </div>
    </div>
  );
}
