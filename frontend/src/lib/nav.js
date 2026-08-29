// Persona-aware primary navigation + the global "+ New" create catalog.
// Persona is captured at onboarding (personal | student | team | business |
// enterprise | other) and exposed on the user object. All routes + testids
// mirror the existing app so nothing breaks — persona only re-orders the same
// primary items, never invents new ones.
import {
  MessageSquare,
  LayoutDashboard,
  Sparkles,
  CheckSquare,
  Phone,
  User as UserIcon,
  Bot,
  Video,
  FolderKanban,
  FileUp,
  Zap,
  Building2,
} from "lucide-react";

// The seven primary rail items, keyed by id. Kept identical to the historic
// PRIMARY list (same routes + testids) to preserve all existing e2e tests.
export const PRIMARY_ITEMS = {
  home:      { to: "/dashboard", label: "Home",  icon: LayoutDashboard, testid: "nav-dashboard" },
  chats:     { to: "/chats",     label: "Chats", icon: MessageSquare,   testid: "nav-chats", end: true },
  ai:        { to: "/ai",        label: "AI",    icon: Sparkles,        testid: "nav-research", accent: true },
  employees: { to: "/employees", label: "Hire",  icon: Bot,             testid: "nav-employees", accent: true },
  tasks:     { to: "/tasks",     label: "Tasks", icon: CheckSquare,     testid: "nav-tasks" },
  calls:     { to: "/calls",     label: "Calls", icon: Phone,           testid: "nav-calls" },
  you:       { to: "/you",       label: "You",   icon: UserIcon,        testid: "nav-you" },
};

// Persona → ordered primary ids. Every list contains the same seven ids so no
// destination ever disappears; only the emphasis (order) changes per persona.
const PERSONA_ORDER = {
  personal: ["home", "ai", "tasks", "chats", "employees", "calls", "you"],
  student:  ["home", "chats", "ai", "tasks", "employees", "calls", "you"],
  team:     ["home", "chats", "ai", "employees", "tasks", "calls", "you"],
  business: ["home", "chats", "ai", "employees", "tasks", "calls", "you"],
  enterprise: ["home", "chats", "ai", "employees", "tasks", "calls", "you"],
};
const DEFAULT_ORDER = ["home", "chats", "ai", "employees", "tasks", "calls", "you"];

export function primaryNav(user) {
  const ids = PERSONA_ORDER[user?.persona] || DEFAULT_ORDER;
  return ids.map((id) => PRIMARY_ITEMS[id]).filter(Boolean);
}

// Global "+ New" — "What do you want to create?". Each option deep-links into an
// existing flow. Options are gated by role/permission.
export function createOptions(user) {
  const isAdmin =
    user?.role === "owner" || user?.role === "admin" || user?.is_super_admin;
  const opts = [
    { key: "research",   label: "AI Research",       desc: "Ask one AI or compare models",  icon: Sparkles,     to: "/research" },
    { key: "chat",       label: "Chat",              desc: "Message people or an AI",        icon: MessageSquare, to: "/chats?new=chat" },
    { key: "meeting",    label: "Meeting",           desc: "Meet, transcribe & summarize",   icon: Video,        to: "/calls" },
    { key: "project",    label: "Project",           desc: "Organize work in one place",     icon: FolderKanban, to: "/projects?new=1" },
    { key: "task",       label: "Task",              desc: "Capture an action item",         icon: CheckSquare,  to: "/tasks?new=1" },
    { key: "document",   label: "Document Research", desc: "Upload & ask with citations",    icon: FileUp,       to: "/knowledge" },
    { key: "automation", label: "Automation",        desc: "Let TeamNest do it for you",     icon: Zap,          to: "/automations" },
    { key: "employee",   label: "AI Employee",       desc: "Build an AI teammate",           icon: Bot,          to: "/ai-builder" },
  ];
  if (isAdmin) {
    opts.push({ key: "workspace", label: "Workspace", desc: "Spin up a new workspace", icon: Building2, to: "/team" });
  }
  return opts;
}
