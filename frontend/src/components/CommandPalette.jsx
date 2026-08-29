import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { createPortal } from "react-dom";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import {
  LayoutDashboard,
  MessageSquare,
  Sparkles,
  CheckSquare,
  Phone,
  Brain,
  FolderArchive,
  Bot,
  Plug,
  Users,
  CreditCard,
  User as UserIcon,
  LifeBuoy,
  Building2,
  ShieldCheck,
  Plus,
  UsersRound,
  FolderKanban,
  Video,
  UserPlus,
  FileUp,
  Wand2,
  ClipboardList,
} from "lucide-react";

const isMac =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || "");

/** Open the palette from anywhere: window.dispatchEvent(new Event("tn:command-palette")) */
export function openCommandPalette() {
  window.dispatchEvent(new Event("tn:command-palette"));
}

/**
 * Universal Search / Command Palette (Cmd/Ctrl+K).
 * Mounted once in AppShell so it works on every authenticated page.
 * Navigate anywhere, run quick actions, and search your own chats,
 * research threads, projects, and teammates.
 */
export default function CommandPalette() {
  const nav = useNavigate();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [chats, setChats] = useState([]);
  const [threads, setThreads] = useState([]);
  const [folders, setFolders] = useState([]);
  const [people, setPeople] = useState([]);
  const loadedRef = useRef(false);

  const isAdmin = user?.role === "owner" || user?.role === "admin" || user?.is_super_admin;

  const go = useCallback(
    (to) => {
      setOpen(false);
      nav(to);
    },
    [nav],
  );

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("tn:command-palette", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("tn:command-palette", onOpen);
    };
  }, []);

  useEffect(() => {
    if (!open || loadedRef.current) return;
    loadedRef.current = true;
    api.get("/chats").then(({ data }) => setChats(data || [])).catch(() => {});
    api.get("/ai/threads").then(({ data }) => setThreads(data || [])).catch(() => {});
    api.get("/folders").then(({ data }) => setFolders(data || [])).catch(() => {});
    api
      .get("/workspace/members")
      .then(({ data }) => setPeople((data || []).filter((m) => m.id !== user?.id)))
      .catch(() => {});
  }, [open, user?.id]);

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const peopleById = useMemo(() => {
    const map = {};
    people.forEach((p) => {
      map[p.id] = p;
    });
    return map;
  }, [people]);

  const chatLabel = useCallback(
    (c) => {
      if (c.type === "personal_ai") return "My AI Assistant";
      if (c.name) return c.name;
      if (c.type === "direct") {
        const other = (c.member_ids || []).find((id) => id !== user?.id);
        return peopleById[other]?.name || "Direct message";
      }
      return "Untitled chat";
    },
    [peopleById, user?.id],
  );

  const openDirect = useCallback(
    async (person) => {
      const existing = chats.find(
        (c) =>
          c.type === "direct" &&
          (c.member_ids || []).includes(person.id) &&
          (c.member_ids || []).length === 2,
      );
      setOpen(false);
      if (existing) {
        nav(`/chats/${existing.id}`);
        return;
      }
      try {
        const { data } = await api.post("/chats", { type: "direct", member_ids: [person.id] });
        nav(`/chats/${data.id}`);
      } catch {
        toast.error("Couldn't start that conversation");
      }
    },
    [chats, nav],
  );

  const NAV = useMemo(() => {
    const items = [
      { id: "nav-home", label: "Home", icon: LayoutDashboard, to: "/dashboard" },
      { id: "nav-chats", label: "Chats", icon: MessageSquare, to: "/chats" },
      { id: "nav-research", label: "AI Research", icon: Sparkles, to: "/research" },
      { id: "nav-tasks", label: "Tasks", icon: CheckSquare, to: "/tasks" },
      { id: "nav-calls", label: "Meetings & Calls", icon: Phone, to: "/calls" },
      { id: "nav-memory", label: "AI Memory", icon: Brain, to: "/ai-memory" },
      { id: "nav-knowledge", label: "Documents", icon: FolderArchive, to: "/knowledge" },
      { id: "nav-employees", label: "AI Employees", icon: Bot, to: "/employees" },
      { id: "nav-builder", label: "AI Agent Builder", icon: Bot, to: "/ai-builder" },
      { id: "nav-apps", label: "Apps", icon: Plug, to: "/apps" },
      { id: "nav-team", label: "Team", icon: Users, to: "/team" },
      { id: "nav-billing", label: "Billing & Plan", icon: CreditCard, to: "/billing" },
      { id: "nav-profile", label: "Profile", icon: UserIcon, to: "/you" },
      { id: "nav-help", label: "Help Center", icon: LifeBuoy, to: "/help" },
    ];
    if (isAdmin) {
      items.push({ id: "nav-enterprise", label: "Role Intelligence", icon: Building2, to: "/enterprise" });
      items.push({ id: "nav-workspace-ai", label: "Workspace AI", icon: Building2, to: "/workspace-ai" });
    }
    if (user?.is_super_admin) {
      items.push({ id: "nav-superadmin", label: "Super Admin", icon: ShieldCheck, to: "/superadmin" });
    }
    return items;
  }, [isAdmin, user?.is_super_admin]);

  const ACTIONS = useMemo(
    () => [
      { id: "act-new-chat", label: "New chat", hint: "Start a direct message", icon: Plus, to: "/chats?new=chat" },
      { id: "act-new-group", label: "New group", hint: "Create a team group", icon: UsersRound, to: "/chats?new=group" },
      { id: "act-new-project", label: "New project", hint: "Create a project folder", icon: FolderKanban, to: "/projects?new=1" },
      { id: "act-host-meeting", label: "Host a meeting", hint: "Audio / video call", icon: Video, to: "/calls" },
      { id: "act-ask-ai", label: "Ask my AI", hint: "Open your personal AI", icon: Wand2, to: "/my-ai" },
      { id: "act-compare", label: "Compare AI models", hint: "See side-by-side answers", icon: Sparkles, to: "/research" },
      { id: "act-invite", label: "Invite teammates", hint: "Grow your workspace", icon: UserPlus, to: "/team" },
      { id: "act-upload", label: "Upload documents", hint: "Add to your knowledge base", icon: FileUp, to: "/knowledge" },
      { id: "act-standup", label: "Daily standup", hint: "Generate a team digest", icon: ClipboardList, to: "/dashboard?standup=1" },
    ],
    [],
  );

  if (!open) return null;

  const itemClass =
    "flex items-center gap-3 rounded-lg px-2.5 py-2.5 text-sm cursor-pointer text-zinc-300 data-[selected=true]:bg-white/[0.06] data-[selected=true]:text-white";

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-start justify-center" data-testid="command-palette">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={() => setOpen(false)}
        aria-hidden
      />
      <div className="relative w-full max-w-xl mx-4 mt-[12vh]">
        <Command
          label="Command palette"
          className="w-full rounded-2xl border border-white/10 bg-[#0d0d0f] text-white shadow-2xl shadow-black/70 overflow-hidden [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:pb-1.5 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-mono [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-widest [&_[cmdk-group-heading]]:text-zinc-600"
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false);
          }}
        >
          <CommandInput
            autoFocus
            value={query}
            onValueChange={setQuery}
            data-testid="command-palette-input"
            placeholder="Search or jump to… (research, projects, people, actions)"
            className="text-[15px] text-white placeholder:text-zinc-600"
          />

          <CommandList className="max-h-[52vh] p-2">
            <CommandEmpty className="py-8 text-zinc-500">No results for “{query}”.</CommandEmpty>

            <CommandGroup heading="Quick actions">
              {ACTIONS.map((a) => (
                <CommandItem
                  key={a.id}
                  value={`${a.label} ${a.hint}`}
                  data-testid={`command-${a.id}`}
                  onSelect={() => go(a.to)}
                  className={itemClass}
                >
                  <a.icon className="w-4 h-4 shrink-0 text-zinc-500" strokeWidth={1.8} />
                  <span className="truncate flex-1">{a.label}</span>
                  <span className="text-[11px] text-zinc-600 truncate max-w-[45%] shrink-0">{a.hint}</span>
                </CommandItem>
              ))}
            </CommandGroup>

            {people.length > 0 && (
              <CommandGroup heading="Message a person">
                {people.map((p) => (
                  <CommandItem
                    key={p.id}
                    value={`message ${p.name} ${p.email}`}
                    data-testid={`command-person-${p.id}`}
                    onSelect={() => openDirect(p)}
                    className={itemClass}
                  >
                    <UserIcon className="w-4 h-4 shrink-0 text-zinc-500" strokeWidth={1.8} />
                    <span className="truncate flex-1">{p.name}</span>
                    <span className="text-[11px] text-zinc-600 truncate max-w-[45%] shrink-0">{p.email}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {chats.length > 0 && (
              <CommandGroup heading="Chats">
                {chats.slice(0, 60).map((c) => {
                  const Icon = c.type === "personal_ai" ? Wand2 : c.type === "group" ? UsersRound : MessageSquare;
                  return (
                    <CommandItem
                      key={c.id}
                      value={`chat ${chatLabel(c)}`}
                      data-testid={`command-chat-${c.id}`}
                      onSelect={() => go(`/chats/${c.id}`)}
                      className={itemClass}
                    >
                      <Icon className="w-4 h-4 shrink-0 text-zinc-500" strokeWidth={1.8} />
                      <span className="truncate flex-1">{chatLabel(c)}</span>
                      <span className="text-[11px] text-zinc-600 shrink-0">
                        {c.type === "group" ? "Group" : c.type === "personal_ai" ? "AI" : "Direct"}
                      </span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            )}

            {threads.length > 0 && (
              <CommandGroup heading="Research threads">
                {threads.slice(0, 60).map((t) => (
                  <CommandItem
                    key={t.id}
                    value={`research ${t.question}`}
                    data-testid={`command-thread-${t.id}`}
                    onSelect={() => go(`/chats/${t.chat_id}?thread=${t.id}`)}
                    className={itemClass}
                  >
                    <Sparkles className="w-4 h-4 shrink-0 text-zinc-500" strokeWidth={1.8} />
                    <span className="truncate flex-1">{t.question}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {folders.length > 0 && (
              <CommandGroup heading="Projects">
                {folders.map((f) => (
                  <CommandItem
                    key={f.id}
                    value={`project ${f.name} ${f.description || ""}`}
                    data-testid={`command-project-${f.id}`}
                    onSelect={() => go(`/projects/${f.id}`)}
                    className={itemClass}
                  >
                    <FolderKanban className="w-4 h-4 shrink-0 text-zinc-500" strokeWidth={1.8} />
                    <span className="truncate flex-1">{f.name}</span>
                    {f.description && (
                      <span className="text-[11px] text-zinc-600 truncate max-w-[45%] shrink-0">{f.description}</span>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            <CommandGroup heading="Go to">
              {NAV.map((n) => (
                <CommandItem
                  key={n.id}
                  value={`go to ${n.label}`}
                  data-testid={`command-${n.id}`}
                  onSelect={() => go(n.to)}
                  className={itemClass}
                >
                  <n.icon className="w-4 h-4 shrink-0 text-zinc-500" strokeWidth={1.8} />
                  <span className="truncate flex-1">{n.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>

          <div className="hidden sm:flex items-center gap-4 border-t border-white/10 px-4 py-2 text-[11px] text-zinc-600">
            <span>↵ to select</span>
            <span>↑↓ to navigate</span>
            <span className="ml-auto">{isMac ? "⌘" : "Ctrl"}K to toggle</span>
          </div>
        </Command>
      </div>
    </div>,
    document.body,
  );
}
