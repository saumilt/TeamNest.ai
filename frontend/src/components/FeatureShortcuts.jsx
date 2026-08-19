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
} from "lucide-react";

const FEATURES = [
  { slug: "chat", label: "Chat", icon: MessageSquare, to: "/chats?new=chat" },
  { slug: "meeting", label: "Meeting", icon: Video, to: "/calls" },
  { slug: "tasks", label: "Tasks", icon: CheckSquare, to: "/tasks" },
  { slug: "documents", label: "Documents", icon: FileUp, to: "/knowledge" },
  { slug: "employees", label: "AI Employees", icon: Bot, to: "/employees" },
  { slug: "knowledge", label: "Team Knowledge", icon: Library, to: "/knowledge" },
  { slug: "memory", label: "Memory", icon: Brain, to: "/ai-memory" },
  { slug: "invite", label: "Invite", icon: UserPlus, to: "/team" },
];

/** Compact grid of every feature so nothing is hidden on the AI-first looks. */
export default function FeatureShortcuts() {
  const nav = useNavigate();
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2" data-testid="feature-shortcuts">
      {FEATURES.map((f) => (
        <button
          key={f.slug}
          type="button"
          data-testid={`feature-${f.slug}`}
          onClick={() => nav(f.to)}
          className="group flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.02] hover:bg-white/[0.05] px-3 py-2.5 text-left transition-colors"
        >
          <f.icon className="w-4 h-4 text-zinc-400 group-hover:text-white shrink-0" strokeWidth={1.8} />
          <span className="text-[13px] font-medium text-zinc-200 truncate">{f.label}</span>
        </button>
      ))}
    </div>
  );
}
