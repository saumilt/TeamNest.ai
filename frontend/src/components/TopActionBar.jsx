import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  MessageSquarePlus,
  Users,
  GitCompareArrows,
  UserPlus,
  FolderUp,
  ChevronDown,
  Zap,
} from "lucide-react";
import safeStorage from "@/lib/safeStorage";

const ACTIONS = [
  {
    key: "new-chat",
    label: "New Chat",
    desc: "Message a teammate or AI",
    icon: MessageSquarePlus,
    to: "/chats?new=chat",
    primary: true,
  },
  {
    key: "new-group",
    label: "New Group",
    desc: "Start a team channel",
    icon: Users,
    to: "/chats?new=group",
  },
  {
    key: "compare",
    label: "Compare AI Models",
    desc: "Ask 6 AIs side-by-side",
    icon: GitCompareArrows,
    to: "/research",
    accent: true,
  },
  {
    key: "invite",
    label: "Invite Teammates",
    desc: "Grow your workspace",
    icon: UserPlus,
    to: "/team",
  },
  {
    key: "upload",
    label: "Upload Documents",
    desc: "Chat with your files",
    icon: FolderUp,
    to: "/knowledge",
  },
];

const COLLAPSE_KEY = "tn:quickbar:collapsed";

/** Prominent "what do you want to do next?" quick-action bar shown on the
 *  landing surfaces (Chats list + Home). Collapsible; state persisted. */
export default function TopActionBar() {
  const nav = useNavigate();
  const [collapsed, setCollapsed] = useState(() => safeStorage.get(COLLAPSE_KEY) === "1");

  const toggle = () => {
    setCollapsed((c) => {
      const next = !c;
      safeStorage.set(COLLAPSE_KEY, next ? "1" : "0");
      return next;
    });
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
      </div>

      {!collapsed && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          {ACTIONS.map((a) => (
            <button
              key={a.key}
              type="button"
              data-testid={`quickbar-${a.key}`}
              onClick={() => nav(a.to)}
              className={`group flex items-center gap-3 text-left rounded-xl border px-3.5 py-3 transition-all active:scale-[0.98] ${
                a.primary
                  ? "border-yellow-400/40 bg-yellow-400/[0.06] hover:bg-yellow-400/[0.12]"
                  : a.accent
                    ? "border-white/10 bg-white/[0.02] hover:border-yellow-400/30 hover:bg-white/[0.05]"
                    : "border-white/10 bg-white/[0.02] hover:bg-white/[0.05]"
              }`}
            >
              <div
                className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                  a.primary
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
          ))}
        </div>
      )}
    </div>
  );
}
