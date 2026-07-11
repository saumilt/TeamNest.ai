import { useNavigate } from "react-router-dom";
import { Sparkles, Store, ArrowRight } from "lucide-react";
import HireDevTeamButton from "@/components/chat/HireDevTeamButton";
import { useEmployeeRecommendation } from "@/hooks/useEmployeeRecommendation";

/**
 * Content-aware "hire an AI employee" banner for a chat.
 *
 * Asks the backend to analyse the conversation and recommend the best-suited
 * AI employee:
 *   • devmanager  → the existing one-time @devmanager engineering hire.
 *   • marketplace / employee → a tailored banner linking to that agent.
 *   • no confident match → a generic banner linking to the AI marketplace.
 */
export default function SmartHireBanner({ chatId, chat }) {
  const nav = useNavigate();
  const { loading, reco, marketUrl } = useEmployeeRecommendation(chatId);

  if (loading) {
    return (
      <div className="mx-3 md:mx-6 mt-3 mb-1 h-[68px] rounded-2xl border border-white/5 bg-white/[0.02] animate-pulse" data-testid="hire-banner-loading" />
    );
  }

  // Engineering recommendation → reuse the dedicated @devmanager hire flow.
  if (reco?.kind === "devmanager") {
    if (chat?.dev_team_hired) return null;
    return <HireDevTeamButton chatId={chatId} variant="banner" />;
  }

  const specific = reco && (reco.kind === "marketplace" || reco.kind === "employee");
  const title = specific
    ? `Recommended for this chat: ${reco.name}`
    : "Get an AI employee for this chat";
  const subtitle = specific
    ? (reco.reason || "Best match for what this chat is working on.")
    : "Browse AI employees built by TeamNest and your team, and hire the right one for this workspace.";
  const ctaLabel = specific ? reco.cta_label : "Hire an AI employee";
  const onClick = () => nav(specific && reco.link ? reco.link : marketUrl);

  return (
    <div
      data-testid="smart-hire-banner"
      data-reco-kind={reco?.kind || "none"}
      className="mx-3 md:mx-6 mt-3 mb-1 rounded-2xl border border-amber-400/30 bg-gradient-to-r from-amber-400/10 via-amber-400/[0.04] to-transparent p-4 flex items-center gap-4"
    >
      <div className="hidden sm:flex w-10 h-10 rounded-xl bg-amber-400/15 ring-1 ring-amber-400/30 items-center justify-center text-amber-300">
        {specific ? <Sparkles className="w-5 h-5" /> : <Store className="w-5 h-5" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[14px] font-semibold text-ink leading-tight truncate">{title}</div>
        <div className="text-[12px] text-ink-dim leading-snug mt-0.5 line-clamp-2">{subtitle}</div>
      </div>
      <button
        type="button"
        onClick={onClick}
        data-testid="smart-hire-banner-btn"
        className="shrink-0 inline-flex items-center gap-2 h-10 px-4 rounded-pill bg-amber-300 hover:bg-amber-200 text-black font-semibold text-[13px] active:scale-[0.98]"
      >
        {ctaLabel}
        <ArrowRight className="w-4 h-4" />
      </button>
    </div>
  );
}
