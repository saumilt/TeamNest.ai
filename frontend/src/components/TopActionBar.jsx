import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  MessageSquarePlus,
  Users,
  GitCompareArrows,
  UserPlus,
  FolderUp,
  ChevronDown,
  Zap,
  X,
  Sunrise,
  Bot,
  Brain,
} from "lucide-react";
import safeStorage from "@/lib/safeStorage";

// Central registry of every quick action. Pages pick which keys to show (and
// in what priority order) via the `items` prop — see the per-page sets below.
const REGISTRY = {
  "new-chat": { key: "new-chat", label: "New Chat", desc: "Message a teammate or AI", icon: MessageSquarePlus, to: "/chats?new=chat" },
  "new-group": { key: "new-group", label: "New Group", desc: "Start a team channel", icon: Users, to: "/chats?new=group" },
  compare: { key: "compare", label: "Compare AI Models", desc: "Ask 6 AIs side-by-side", icon: GitCompareArrows, to: "/research" },
  invite: { key: "invite", label: "Invite Teammates", desc: "Grow your workspace", icon: UserPlus, to: "/team" },
  upload: { key: "upload", label: "Upload Documents", desc: "Chat with your files", icon: FolderUp, to: "/knowledge" },
  standup: { key: "standup", label: "Daily Standup", desc: "AI recap of your team", icon: Sunrise, to: "/dashboard?standup=1" },
  "hire-ai": { key: "hire-ai", label: "Hire an AI Employee", desc: "Add an AI teammate", icon: Bot, to: "/employees" },
  "my-ai": { key: "my-ai", label: "Ask My AI", desc: "Your personal AI assistant", icon: Brain, to: "/my-ai" },
};

const DEFAULT_ITEMS = ["new-chat", "new-group", "compare", "invite", "upload"];

const COLLAPSE_KEY = "tn:quickbar:collapsed";
const USAGE_KEY = "tn:quickbar:usage";
export const QUICKBAR_HIDDEN_KEY = "tn:quickbar:hidden";

function readUsage() {
  try {
    const raw = safeStorage.get(USAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

/** Prominent "what do you want to do next?" quick-action bar.
 *
 *  - `items`: ordered list for THIS page — each entry is a REGISTRY key string
 *    or a custom `{ key, label, desc, icon, to?, onClick? }` (e.g. "New Task"
 *    that opens a dialog). The FIRST item is the page lead: pinned first and
 *    highlighted. The rest reorder by how often this user picks them.
 *  - Collapsible, and fully dismissible ("Don't show again", re-enabled from
 *    Profile → Preferences). All state persisted in localStorage. */
export default function TopActionBar({ items = DEFAULT_ITEMS }) {
  const nav = useNavigate();
  const [collapsed, setCollapsed] = useState(() => safeStorage.get(COLLAPSE_KEY) === "1");
  const [hidden, setHidden] = useState(() => safeStorage.get(QUICKBAR_HIDDEN_KEY) === "1");
  // Frozen at mount so tiles don't reshuffle under the cursor; the new order
  // applies the next time the bar mounts (i.e. after a navigation).
  const [usage] = useState(readUsage);

  const actions = useMemo(() => {
    const list = items
      .map((it) => (typeof it === "string" ? REGISTRY[it] : it))
      .filter(Boolean);
    if (list.length <= 1) return list;
    const [lead, ...rest] = list;
    const restOrdered = rest
      .map((a, i) => ({ a, i, count: Number(usage[a.key]) || 0 }))
      .sort((x, y) => y.count - x.count || x.i - y.i)
      .map((e) => e.a);
    return [lead, ...restOrdered];
  }, [items, usage]);

  if (hidden) return null;

  const toggle = () => {
    setCollapsed((c) => {
      const next = !c;
      safeStorage.set(COLLAPSE_KEY, next ? "1" : "0");
      return next;
    });
  };

  const dismiss = () => {
    safeStorage.set(QUICKBAR_HIDDEN_KEY, "1");
    setHidden(true);
    toast("Quick actions hidden", {
      description: "Turn them back on anytime in Profile → Preferences.",
    });
  };

  const runAction = (a) => {
    const counts = readUsage();
    counts[a.key] = (Number(counts[a.key]) || 0) + 1;
    safeStorage.set(USAGE_KEY, JSON.stringify(counts));
    if (typeof a.onClick === "function") a.onClick();
    else if (a.to) nav(a.to);
  };

  return (
    <div
      data-testid="top-action-bar"
      className="rounded-2xl border border-white/10 bg-[#0c0c0e] p-3.5 md:p-4"
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Zap className="w-3.5 h-3.5 text-yellow-400" />
          <span className="text-[11px] font-mono uppercase tracking-widest text-zinc-400">
            What do you want to do next?
          </span>
        </div>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            data-testid="quickbar-toggle"
            onClick={toggle}
            className="text-zinc-500 hover:text-white p-1 rounded-md hover:bg-white/5 transition-colors"
            aria-expanded={!collapsed}
            aria-label={collapsed ? "Expand quick actions" : "Collapse quick actions"}
          >
            <ChevronDown className={`w-4 h-4 transition-transform ${collapsed ? "-rotate-90" : ""}`} />
          </button>
          <button
            type="button"
            data-testid="quickbar-dismiss"
            onClick={dismiss}
            className="text-zinc-500 hover:text-white p-1 rounded-md hover:bg-white/5 transition-colors"
            title="Don't show again — re-enable in Profile"
            aria-label="Hide quick actions"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {!collapsed && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          {actions.map((a, idx) => {
            const primary = idx === 0; // page lead gets the accent
            return (
              <button
                key={a.key}
                type="button"
                data-testid={`quickbar-${a.key}`}
                onClick={() => runAction(a)}
                className={`group flex items-center gap-3 text-left rounded-xl border px-3.5 py-3 transition-all active:scale-[0.98] ${
                  primary
                    ? "border-yellow-400/40 bg-yellow-400/[0.06] hover:bg-yellow-400/[0.12]"
                    : "border-white/10 bg-white/[0.02] hover:bg-white/[0.05]"
                }`}
              >
                <div
                  className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                    primary
                      ? "bg-yellow-400 text-black"
                      : "bg-white/5 text-zinc-300 group-hover:text-white"
                  }`}
                >
                  <a.icon className="w-[18px] h-[18px]" strokeWidth={1.8} />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold truncate text-white">{a.label}</div>
                  <div className="text-[11px] text-zinc-500 truncate hidden sm:block">{a.desc}</div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
