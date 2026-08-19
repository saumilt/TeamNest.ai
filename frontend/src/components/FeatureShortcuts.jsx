import { useNavigate } from "react-router-dom";
import {
  MessageSquare,
  Video,
  CheckSquare,
  FileUp,
  Bot,
  Library,
  Brain,
  UserPlus,
  Building2,
  Users,
} from "lucide-react";

const REG = {
  chat: { label: "Chat", icon: MessageSquare, to: "/chats?new=chat" },
  meeting: { label: "Meeting", icon: Video, to: "/calls" },
  tasks: { label: "Tasks", icon: CheckSquare, to: "/tasks" },
  documents: { label: "Documents", icon: FileUp, to: "/knowledge" },
  employees: { label: "AI Employees", icon: Bot, to: "/employees" },
  knowledge: { label: "Team Knowledge", icon: Library, to: "/knowledge" },
  memory: { label: "Memory", icon: Brain, to: "/ai-memory" },
  invite: { label: "Invite", icon: UserPlus, to: "/team" },
  role: { label: "Role Intelligence", icon: Building2, to: "/enterprise" },
  people: { label: "People", icon: Users, to: "/team" },
};

const DEFAULT_ORDER = ["chat", "meeting", "tasks", "documents", "employees", "knowledge", "memory", "invite"];

/** Compact grid of features so nothing is hidden on the AI-first looks.
 *  `order` (persona-aware list of keys) picks which shortcuts to show. */
export default function FeatureShortcuts({ order }) {
  const nav = useNavigate();
  const keys = (order && order.length ? order : DEFAULT_ORDER).filter((k) => REG[k]);
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2" data-testid="feature-shortcuts">
      {keys.map((k) => {
        const f = REG[k];
        return (
          <button
            key={k}
            type="button"
            data-testid={`feature-${k}`}
            onClick={() => nav(f.to)}
            className="group flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.02] hover:bg-white/[0.05] px-3 py-2.5 text-left transition-colors"
          >
            <f.icon className="w-4 h-4 text-zinc-400 group-hover:text-white shrink-0" strokeWidth={1.8} />
            <span className="text-[13px] font-medium text-zinc-200 truncate">{f.label}</span>
          </button>
        );
      })}
    </div>
  );
}
