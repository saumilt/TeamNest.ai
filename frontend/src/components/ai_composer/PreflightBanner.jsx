/* AI billing preflight banner — surfaces who'll be charged + whether
 * AI is allowed at all in this chat. */
export default function PreflightBanner({ preflight }) {
        if (!preflight) return null;
        if (!preflight.allowed) {
                return (
                        <div
                                data-testid="ai-preflight-blocked"
                                className="mb-3 px-3 py-2 rounded-md bg-tn-red/10 border border-tn-red/30 text-[12px] text-tn-red"
                        >
                                {preflight.reason}
                        </div>
                );
        }
        if (!preflight.billed_to_label) return null;
        return (
                <div
                        data-testid="ai-preflight-billed-to"
                        className="mb-3 px-3 py-2 rounded-md bg-yellow-500/10 border border-yellow-500/30 text-[11px] text-yellow-200"
                >
                        AI usage in this group is billed to{" "}
                        <span className="font-semibold">{preflight.billed_to_label}</span>
                        {preflight.settings?.billing_mode === "requester_pays" && " (charged to your own TeamNest AI credits)"}.
                        {preflight.requires_approval && " · This task may require approval."}
                </div>
        );
}
