import { useNavigate } from "react-router-dom";
import { Sparkles, Store } from "lucide-react";
import HireDevTeamButton from "@/components/chat/HireDevTeamButton";
import { useEmployeeRecommendation } from "@/hooks/useEmployeeRecommendation";

/**
 * Compact chat-header hire pill that reflects the content-aware recommendation:
 *   • devmanager  → the existing @devmanager one-time hire pill (hidden once hired).
 *   • marketplace / employee → "Hire <name>" pill → that agent.
 *   • no match    → "Hire AI" pill → the marketplace.
 */
export default function SmartHirePill({ chatId, chat }) {
  const nav = useNavigate();
  const { loading, reco, marketUrl } = useEmployeeRecommendation(chatId);

  if (loading) return null;

  if (reco?.kind === "devmanager") {
    if (chat?.dev_team_hired) return null;
    return <HireDevTeamButton chatId={chatId} variant="pill" />;
  }

  const specific = reco && (reco.kind === "marketplace" || reco.kind === "employee");
  const label = specific
    ? (reco.name?.length > 22 ? `Hire ${reco.name.slice(0, 20)}…` : `Hire ${reco.name}`)
    : "Hire AI";

  return (
    <button
      type="button"
      onClick={() => nav(specific && reco.link ? reco.link : marketUrl)}
      data-testid="smart-hire-pill"
      title={specific ? reco.reason || `Hire ${reco.name}` : "Hire an AI employee for this chat"}
      className="mt-0.5 ml-1 inline-flex items-center gap-1 h-5 px-2 rounded-full bg-amber-400/15 text-amber-200 ring-1 ring-amber-400/30 text-[11px] font-medium hover:bg-amber-400/25"
    >
      {specific ? <Sparkles className="w-3 h-3" /> : <Store className="w-3 h-3" />}
      {label}
    </button>
  );
}
