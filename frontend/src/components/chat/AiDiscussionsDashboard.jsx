import { useMemo, useState } from "react";
import { Sparkles, Search, ChevronRight, Clock, Coins, Lock, Users } from "lucide-react";
import Avatar from "@/components/ui-v2/Avatar";

function timeAgo(iso) {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  const mins = Math.round((Date.now() - t) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

/**
 * AiDiscussionsDashboard — the "AI" view. A research dashboard (not a message
 * timeline) that groups AI discussions by the participant who created them.
 */
export default function AiDiscussionsDashboard({ discussions = [], memberMap = {}, userId, onOpen }) {
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return discussions;
    return discussions.filter(
      (d) =>
        (d.title || "").toLowerCase().includes(term) ||
        (d.creator_name || "").toLowerCase().includes(term),
    );
  }, [q, discussions]);

  const groups = useMemo(() => {
    const g = {};
    for (const d of filtered) {
      const key = d.created_by || "unknown";
      (g[key] = g[key] || []).push(d);
    }
    // Current user first, then by group size.
    return Object.entries(g).sort((a, b) => {
      if (a[0] === userId) return -1;
      if (b[0] === userId) return 1;
      return b[1].length - a[1].length;
    });
  }, [filtered, userId]);

  return (
    <div
      className="flex-1 overflow-y-auto px-3 md:px-6 py-4"
      data-testid="ai-discussions-dashboard"
    >
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="w-4 h-4 text-ai" />
        <h3 className="text-[15px] font-semibold text-ink">AI Discussions</h3>
        <span className="text-[12px] text-ink-mute ml-1">{discussions.length}</span>
      </div>

      <div className="relative mb-4 max-w-md">
        <Search className="w-3.5 h-3.5 text-ink-mute absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          data-testid="ai-discussions-search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search AI research…"
          className="w-full h-9 pl-8 pr-3 rounded-full bg-surface-2 border border-hairline text-[13px] text-ink placeholder:text-ink-mute focus:outline-none focus:border-ai/40"
        />
      </div>

      {discussions.length === 0 && (
        <div className="text-center text-ink-dim py-16" data-testid="ai-discussions-empty">
          <Sparkles className="w-6 h-6 text-ai/60 mx-auto mb-2" />
          <div className="text-[14px] font-semibold text-ink mb-1">No AI research yet</div>
          <div className="text-[12px]">
            Type <span className="text-ai">@ai</span> in the chat or use “Ask AI” to start a
            discussion. It will appear here without cluttering the human conversation.
          </div>
        </div>
      )}

      <div className="space-y-5">
        {groups.map(([uid, items]) => {
          const name = uid === userId ? "You" : items[0]?.creator_name || memberMap[uid]?.name || "Someone";
          return (
            <div key={uid} data-testid={`ai-discussions-group-${uid}`}>
              <div className="flex items-center gap-2 mb-2">
                <Avatar name={name} src={items[0]?.creator_avatar || memberMap[uid]?.avatar} size={22} />
                <span className="text-[12px] font-semibold text-ink-dim">{name}</span>
                <span className="text-[11px] text-ink-mute">· {items.length}</span>
              </div>
              <div className="space-y-1.5">
                {items.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    data-testid={`ai-discussion-item-${d.id}`}
                    onClick={() => onOpen?.(d.id)}
                    className="group w-full text-left flex items-center gap-3 rounded-xl border border-hairline bg-surface-2 hover:border-ai/40 hover:bg-ai/[0.04] px-3 py-2.5 transition-colors"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-semibold text-ink truncate">
                        {d.title}
                      </span>
                      <span className="flex items-center gap-2.5 text-[11px] text-ink-mute mt-0.5">
                        <span>{d.question_count} Q</span>
                        <span>·</span>
                        <span>{d.answer_count} answers</span>
                        {d.credits_used ? (
                          <span className="inline-flex items-center gap-0.5">
                            <Coins className="w-3 h-3" /> {d.credits_used}
                          </span>
                        ) : null}
                        <span className="inline-flex items-center gap-0.5">
                          <Clock className="w-3 h-3" /> {timeAgo(d.updated_at)}
                        </span>
                        <span className="inline-flex items-center gap-0.5">
                          {d.visibility === "private" ? (
                            <>
                              <Lock className="w-3 h-3" /> Private
                            </>
                          ) : (
                            <>
                              <Users className="w-3 h-3" /> Chat
                            </>
                          )}
                        </span>
                      </span>
                    </span>
                    <ChevronRight className="w-4 h-4 text-ink-mute group-hover:text-ai shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
