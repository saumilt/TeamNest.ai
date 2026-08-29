import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { Sparkles, CheckCircle2, Brain, Activity as ActivityIcon } from "lucide-react";

// AI activity feed ("Watch" surface): research completed, approvals requested,
// knowledge saved. Data: GET /api/ai/activity.
const META = {
  research: { icon: Sparkles, tint: "text-yellow-400", label: "Research" },
  approval: { icon: CheckCircle2, tint: "text-green-400", label: "Approval" },
  knowledge: { icon: Brain, tint: "text-blue-400", label: "Knowledge" },
};

export default function AIActivity() {
  const nav = useNavigate();
  const [items, setItems] = useState(null);

  useEffect(() => {
    api.get("/ai/activity").then(({ data }) => setItems(data.items || [])).catch(() => setItems([]));
  }, []);

  const open = (e) => {
    if (e.type === "research" && e.chat_id) nav(`/chats/${e.chat_id}?thread=${e.thread_id}`);
    else if (e.type === "approval") nav("/approvals");
    else if (e.type === "knowledge") nav("/ai-memory");
  };

  return (
    <div className="p-6 lg:p-10 max-w-3xl" data-testid="ai-activity">
      <p className="text-zinc-500 mb-6">
        Everything your AI has been up to — research, approvals and saved knowledge.
      </p>

      {items === null && <div className="text-zinc-600 text-sm">Loading…</div>}

      {items && items.length === 0 && (
        <div className="rounded-2xl border border-white/10 bg-[#121214] p-8 text-center" data-testid="ai-activity-empty">
          <ActivityIcon className="w-8 h-8 text-zinc-600 mx-auto mb-3" />
          <div className="text-zinc-300 font-semibold">No AI activity yet</div>
          <div className="text-zinc-500 text-sm mt-1">Run AI research or save knowledge and it'll show up here.</div>
        </div>
      )}

      <div className="space-y-2">
        {(items || []).map((e, i) => {
          const m = META[e.type] || META.research;
          const I = m.icon;
          return (
            <button
              key={i}
              type="button"
              data-testid={`activity-item-${i}`}
              onClick={() => open(e)}
              className="w-full text-left flex items-start gap-3 rounded-xl border border-white/10 bg-[#121214] p-4 hover:bg-white/[0.04] transition-colors"
            >
              <div className={`w-9 h-9 rounded-lg bg-white/5 flex items-center justify-center shrink-0 ${m.tint}`}>
                <I className="w-4 h-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-mono uppercase tracking-widest text-zinc-500">{m.label}</span>
                  {e.status && (
                    <span className="text-[9px] font-mono uppercase tracking-widest text-zinc-600">· {e.status}</span>
                  )}
                </div>
                <div className="text-sm text-zinc-200 mt-0.5 truncate">{e.title}</div>
                {e.at && <div className="text-[11px] text-zinc-600 mt-1">{new Date(e.at).toLocaleString()}</div>}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
