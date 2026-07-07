import { Lock } from "lucide-react";
import HireDevTeamButton from "@/components/chat/HireDevTeamButton";

/**
 * In-chat card posted when someone @mentions @devmanager before hiring.
 * Rendered by MessageBubble when message.metadata.hire_prompt is present.
 */
export default function HirePromptCard({ chatId }) {
  return (
    <div
      data-testid="hire-prompt-card"
      className="max-w-[520px] rounded-2xl border border-amber-400/30 bg-gradient-to-r from-amber-400/10 via-amber-400/[0.04] to-transparent p-4"
    >
      <div className="flex items-start gap-3">
        <div className="shrink-0 w-9 h-9 rounded-xl bg-amber-400/15 ring-1 ring-amber-400/30 flex items-center justify-center text-amber-300">
          <Lock className="w-4 h-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold text-ink leading-tight">
            @devmanager isn&apos;t hired on this chat yet
          </div>
          <div className="text-[12px] text-ink-dim leading-snug mt-1">
            Hire your AI dev manager once — no subscription — and it will plan,
            build, test and ship right here in the chat, plus unlock the
            Builders in the Build Room.
          </div>
          <div className="mt-2.5">
            <HireDevTeamButton chatId={chatId} variant="toolbar" />
          </div>
        </div>
      </div>
    </div>
  );
}
