import { useEffect, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import CreditsWidget from "@/components/CreditsWidget";
import NotificationBell from "@/components/NotificationBell";
import ResizableEdge from "@/components/ui-v2/ResizableEdge";
import safeStorage from "@/lib/safeStorage";
import { toast } from "sonner";
import { openShowMeHow } from "@/lib/showMeHow";
import { openCommandPalette } from "@/components/CommandPalette";
import NewMenu from "@/components/NewMenu";
import { primaryNav } from "@/lib/nav";
import {
        User as UserIcon,
        Building2,
        Plug,
        Brain,
        FolderArchive,
        ChevronsUpDown,
        Check,
        LogOut,
        Bot,
        ShieldCheck,
        LifeBuoy,
        Compass,
        PanelLeftClose,
        Pin,
        Search,
        Inbox,
} from "lucide-react";



const PINNED_KEY = "sidebar-pinned";
const WIDTH_KEY = "sidebar-width";
const COLLAPSED_WIDTH = 64;
const DEFAULT_EXPANDED_WIDTH = 240;
const MIN_EXPANDED_WIDTH = 180;
const MAX_EXPANDED_WIDTH = 360;

/** Desktop-only slim sidebar. Hidden below md breakpoint (mobile uses the
 *  bottom tab bar in `MobileTabBar.jsx`).
 *
 *  Collapsed (64px icon rail) BY DEFAULT. Hovering the rail expands it as an
 *  overlay (content underneath doesn't reflow); moving the mouse away collapses
 *  it again. A pin toggle keeps it expanded in-flow, persisted across reloads.
 */
export default function Sidebar() {
  const { user, workspaces, logout, switchWorkspace } = useAuth();
  const nav = useNavigate();
  const [wsOpen, setWsOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [pinned, setPinned] = useState(() => safeStorage.get(PINNED_KEY) === "1");
  const [hovered, setHovered] = useState(false);
  const [expandedWidth, setExpandedWidth] = useState(() => {
    const stored = safeStorage.getNumber(WIDTH_KEY, DEFAULT_EXPANDED_WIDTH);
    return Math.min(MAX_EXPANDED_WIDTH, Math.max(MIN_EXPANDED_WIDTH, stored));
  });

  const expanded = pinned || hovered;
  const collapsed = !expanded;

  const isAdmin = ["owner", "admin"].includes(user?.role);
  const [pendingApprovals, setPendingApprovals] = useState(0);
  useEffect(() => {
    if (!isAdmin) return;
    let alive = true;
    const refresh = () => api.get("/automations/pending")
      .then(({ data }) => { if (alive) setPendingApprovals((data.items || []).length); })
      .catch(() => {});
    refresh();
    const id = setInterval(refresh, 60000);
    const onChange = () => refresh();
    window.addEventListener("tn:approvals-changed", onChange);
    return () => { alive = false; clearInterval(id); window.removeEventListener("tn:approvals-changed", onChange); };
  }, [isAdmin]);
  const overlay = hovered && !pinned; // expanded on hover only → float over content

  const activeWs = (workspaces || []).find((w) => w.workspace_id === user?.workspace_id);
  const multi = (workspaces || []).length > 1; // referenced inside switcher tooltip

  useEffect(() => {
    safeStorage.set(PINNED_KEY, pinned ? "1" : "0");
  }, [pinned]);
  useEffect(() => {
    safeStorage.set(WIDTH_KEY, String(Math.round(expandedWidth)));
  }, [expandedWidth]);

  useEffect(() => {
    if (!wsOpen) return;
    const close = (e) => {
      if (!e.target.closest("[data-ws-switcher]")) setWsOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [wsOpen]);

  const handleSwitchWorkspace = async (workspace_id) => {
    if (workspace_id === user?.workspace_id) {
      setWsOpen(false);
      return;
    }
    setSwitching(true);
    setWsOpen(false);
    try {
      await switchWorkspace(workspace_id);
      const target = (workspaces || []).find((w) => w.workspace_id === workspace_id);
      toast.success(`Switched to ${target?.name || "workspace"}`);
      setTimeout(() => window.location.assign("/chats"), 200);
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Could not switch workspace");
      setSwitching(false);
    }
  };

  const handleLogout = () => {
    logout();
    nav("/");
  };

  return (
    <aside
      data-testid="main-sidebar"
      data-collapsed={collapsed ? "1" : "0"}
      data-pinned={pinned ? "1" : "0"}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => {
        setHovered(false);
        if (!pinned) setWsOpen(false);
      }}
      style={{ width: `${pinned ? expandedWidth : COLLAPSED_WIDTH}px` }}
      className="hidden md:block sticky top-0 h-[100dvh] shrink-0 z-20 relative"
    >
      <div
        style={{ width: `${expanded ? expandedWidth : COLLAPSED_WIDTH}px` }}
        className={`h-full flex flex-col bg-[#0a0a0a] border-r border-white/5 transition-[width] duration-150 ${
          overlay ? "absolute inset-y-0 left-0 z-50 shadow-2xl shadow-black/60" : ""
        }`}
      >
      {/* Brand + pin toggle */}
      <div className={`flex items-center ${collapsed ? "justify-center" : "justify-between"} pt-6 pb-5 ${collapsed ? "px-2" : "px-5"}`}>
        <NavLink to="/chats" end className="flex items-center gap-3 hover:opacity-90 min-w-0" title="teamnest.ai">
          <div className="w-10 h-10 rounded-2xl bg-yellow-400 text-black flex items-center justify-center font-bold tracking-tight shrink-0">
            TN
          </div>
          {!collapsed && (
            <div className="font-bold tracking-tight text-base truncate">
              teamnest<span className="text-yellow-400">.ai</span>
            </div>
          )}
        </NavLink>
        {!collapsed && (
          <button
            type="button"
            data-testid="sidebar-pin-btn"
            onClick={() => setPinned((p) => !p)}
            className={`p-1.5 rounded-md hover:bg-white/5 ${pinned ? "text-yellow-400" : "text-zinc-500 hover:text-white"}`}
            title={pinned ? "Unpin — collapse to an icon rail" : "Pin sidebar open"}
            aria-label={pinned ? "Unpin sidebar" : "Pin sidebar open"}
            aria-pressed={pinned}
          >
            {pinned ? <PanelLeftClose className="w-4 h-4" /> : <Pin className="w-4 h-4" />}
          </button>
        )}
      </div>

      {/* Workspace switcher — only visible when expanded. */}
      {activeWs && !collapsed && (
        <div data-ws-switcher data-testid="workspace-switcher" className="relative px-3 mb-3">
          <button
            type="button"
            data-testid="workspace-switcher-btn"
            disabled={switching}
            onClick={() => setWsOpen((v) => !v)}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.07] cursor-pointer transition-colors text-left"
            title={multi ? "Switch workspace" : activeWs.name}
          >
            <Building2 className="w-4 h-4 text-yellow-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-xs text-zinc-500 leading-none mb-1">Workspace</div>
              <div data-testid="workspace-switcher-active-name" className="text-sm font-medium truncate leading-tight">
                {activeWs.name}
              </div>
            </div>
            <ChevronsUpDown className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
          </button>

          {wsOpen && (
            <div
              data-testid="workspace-switcher-menu"
              className="absolute left-3 right-3 top-full mt-1 z-50 bg-[#141414] border border-white/10 rounded-xl shadow-xl py-1.5 max-h-80 overflow-y-auto"
            >
              {(workspaces || []).map((w) => {
                const active = w.workspace_id === user?.workspace_id;
                return (
                  <button
                    key={w.workspace_id}
                    type="button"
                    data-testid={`workspace-option-${w.workspace_id}`}
                    onClick={() => handleSwitchWorkspace(w.workspace_id)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-white/5 ${
                      active ? "text-yellow-400" : "text-zinc-200"
                    }`}
                  >
                    <Building2 className={`w-3.5 h-3.5 shrink-0 ${active ? "text-yellow-400" : "text-zinc-500"}`} />
                    <div className="flex-1 min-w-0">
                      <div className="truncate">{w.name}</div>
                      <div className="text-xs text-zinc-500 mt-0.5 capitalize">{w.role}</div>
                    </div>
                    {active && <Check className="w-3.5 h-3.5 shrink-0" />}
                  </button>
                );
              })}
              <div className="border-t border-white/5 mt-1 pt-1">
                <button
                  type="button"
                  data-testid="workspace-invite-teammates"
                  onClick={() => { setWsOpen(false); nav("/team"); }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-white/5 text-zinc-300"
                >
                  <UserIcon className="w-3.5 h-3.5 shrink-0 text-zinc-500" />
                  <div className="truncate">Invite teammates</div>
                </button>
                <button
                  type="button"
                  data-testid="workspace-manage"
                  onClick={() => { setWsOpen(false); nav("/team"); }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-white/5 text-zinc-300"
                >
                  <Building2 className="w-3.5 h-3.5 shrink-0 text-zinc-500" />
                  <div className="truncate">Workspace settings</div>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Primary nav */}
      <nav className={`flex-1 overflow-y-auto ${collapsed ? "px-2" : "px-3"} space-y-0.5`}>
        <NewMenu collapsed={collapsed} />
        <button
          type="button"
          data-testid="nav-command-palette"
          onClick={openCommandPalette}
          title="Search — ⌘K"
          className={`w-full flex items-center ${collapsed ? "justify-center px-0" : "gap-3 px-3"} py-2.5 rounded-xl text-sm transition-colors mb-1 text-ink-dim hover:bg-white/[0.03] hover:text-ink`}
        >
          <Search className="w-5 h-5 shrink-0" strokeWidth={1.8} />
          {!collapsed && (
            <>
              <span className="truncate">Search</span>
              <kbd className="ml-auto text-[10px] font-mono text-zinc-600 border border-white/10 rounded px-1.5 py-0.5">
                ⌘K
              </kbd>
            </>
          )}
        </button>
        {primaryNav(user).map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.end}
            data-testid={n.testid}
            title={n.label}
            className={({ isActive }) =>
              `flex items-center ${collapsed ? "justify-center px-0" : "gap-3 px-3"} py-2.5 rounded-xl text-sm transition-colors ${
                isActive
                  ? n.accent
                    ? "bg-ai-tint text-ai"
                    : "bg-surface-3 text-ink"
                  : "text-ink-dim hover:bg-white/[0.03] hover:text-ink"
              }`
            }
          >
            <n.icon className="w-5 h-5 shrink-0" strokeWidth={1.8} />
            {!collapsed && <span className="truncate">{n.label}</span>}
          </NavLink>
        ))}
        <NavLink
          to="/ai-builder"
          data-testid="nav-ai-builder"
          title="AI Agent (Beta)"
          className={({ isActive }) =>
            `flex items-center ${collapsed ? "justify-center px-0" : "gap-3 px-3"} py-2.5 rounded-xl text-sm transition-colors ${
              isActive ? "bg-ai-tint text-ai" : "text-ink-dim hover:bg-white/[0.03] hover:text-ink"
            }`
          }
        >
          <Bot className="w-5 h-5 shrink-0" strokeWidth={1.8} />
          {!collapsed && (
            <span className="truncate">
              AI Agent <sup className="text-[9px] font-bold text-ai">* Beta</sup>
            </span>
          )}
        </NavLink>
        <NavLink
          to="/apps"
          data-testid="nav-apps"
          title="Apps (connect your tools — Zapier, email, CRM)"
          className={({ isActive }) =>
            `flex items-center ${collapsed ? "justify-center px-0" : "gap-3 px-3"} py-2.5 rounded-xl text-sm transition-colors ${
              isActive ? "bg-ai-tint text-ai" : "text-ink-dim hover:bg-white/[0.03] hover:text-ink"
            }`
          }
        >
          <Plug className="w-5 h-5 shrink-0" strokeWidth={1.8} />
          {!collapsed && <span className="truncate">Apps</span>}
        </NavLink>
        {isAdmin && (
          <NavLink
            to="/approvals-inbox"
            data-testid="nav-approvals"
            title="Approval Inbox (automations waiting on you)"
            className={({ isActive }) =>
              `relative flex items-center ${collapsed ? "justify-center px-0" : "gap-3 px-3"} py-2.5 rounded-xl text-sm transition-colors ${
                isActive ? "bg-ai-tint text-ai" : "text-ink-dim hover:bg-white/[0.03] hover:text-ink"
              }`
            }
          >
            <span className="relative shrink-0">
              <Inbox className="w-5 h-5" strokeWidth={1.8} />
              {pendingApprovals > 0 && (
                <span data-testid="nav-approvals-badge" className={`absolute -top-1.5 ${collapsed ? "-right-1.5" : "-right-2"} min-w-[16px] h-4 px-1 rounded-full bg-amber-500 text-black text-[10px] font-bold flex items-center justify-center`}>
                  {pendingApprovals > 9 ? "9+" : pendingApprovals}
                </span>
              )}
            </span>
            {!collapsed && <span className="truncate">Approvals</span>}
          </NavLink>
        )}
        <NavLink
          to="/ai-memory"
          data-testid="nav-ai-memory"
          title="AI Memory (what the AI has learned about you & your team)"
          className={({ isActive }) =>
            `flex items-center ${collapsed ? "justify-center px-0" : "gap-3 px-3"} py-2.5 rounded-xl text-sm transition-colors ${
              isActive ? "bg-ai-tint text-ai" : "text-ink-dim hover:bg-white/[0.03] hover:text-ink"
            }`
          }
        >
          <Brain className="w-5 h-5 shrink-0" strokeWidth={1.8} />
          {!collapsed && <span className="truncate">AI Memory</span>}
        </NavLink>
        <NavLink
          to="/knowledge"
          data-testid="nav-knowledge"
          title="Documents — upload a ZIP and ask AI about its contents"
          className={({ isActive }) =>
            `flex items-center ${collapsed ? "justify-center px-0" : "gap-3 px-3"} py-2.5 rounded-xl text-sm transition-colors ${
              isActive ? "bg-ai-tint text-ai" : "text-ink-dim hover:bg-white/[0.03] hover:text-ink"
            }`
          }
        >
          <FolderArchive className="w-5 h-5 shrink-0" strokeWidth={1.8} />
          {!collapsed && <span className="truncate">Documents</span>}
        </NavLink>
        {(user?.role === "owner" || user?.role === "admin" || user?.is_super_admin) && (
          <NavLink
            to="/enterprise"
            data-testid="nav-enterprise"
            title="Role Intelligence (enterprise knowledge continuity)"
            className={({ isActive }) =>
              `flex items-center ${collapsed ? "justify-center px-0" : "gap-3 px-3"} py-2.5 rounded-xl text-sm transition-colors ${
                isActive ? "bg-ai-tint text-ai" : "text-ink-dim hover:bg-white/[0.03] hover:text-ink"
              }`
            }
          >
            <Building2 className="w-5 h-5 shrink-0" strokeWidth={1.8} />
            {!collapsed && <span className="truncate">Role Intelligence</span>}
          </NavLink>
        )}
        {(user?.role === "owner" || user?.role === "admin" || user?.is_super_admin) && (
          <NavLink
            to="/workspace-ai"
            data-testid="nav-workspace-ai"
            title="Workspace AI (deploy & billing)"
            className={({ isActive }) =>
              `flex items-center ${collapsed ? "justify-center px-0" : "gap-3 px-3"} py-2.5 rounded-xl text-sm transition-colors ${
                isActive ? "bg-ai-tint text-ai" : "text-ink-dim hover:bg-white/[0.03] hover:text-ink"
              }`
            }
          >
            <Building2 className="w-5 h-5 shrink-0" strokeWidth={1.8} />
            {!collapsed && <span className="truncate">Workspace AI</span>}
          </NavLink>
        )}
        {user?.is_super_admin && (
          <NavLink
            to="/superadmin"
            data-testid="nav-superadmin"
            title="Super Admin"
            className={({ isActive }) =>
              `flex items-center ${collapsed ? "justify-center px-0" : "gap-3 px-3"} py-2.5 rounded-xl text-sm transition-colors ${
                isActive
                  ? "bg-ai-tint text-ai"
                  : "text-ink-dim hover:bg-white/[0.03] hover:text-ink"
              }`
            }
          >
            <ShieldCheck className="w-5 h-5 shrink-0" strokeWidth={1.8} />
            {!collapsed && <span className="truncate">Super Admin</span>}
          </NavLink>
        )}
      </nav>

      {/* Credits + user */}
      <div className="border-t border-white/5 pt-3 pb-4">
        <button
          type="button"
          data-testid="nav-show-me-how"
          onClick={openShowMeHow}
          title="Show Me How"
          className={`w-full flex items-center ${collapsed ? "justify-center px-0" : "gap-3 px-3"} py-2.5 rounded-xl text-sm transition-colors mb-1 text-ink-dim hover:bg-white/[0.03] hover:text-ink`}
        >
          <Compass className="w-5 h-5 shrink-0" strokeWidth={1.8} />
          {!collapsed && <span className="truncate">Show Me How</span>}
        </button>
        <NavLink
          to="/help"
          data-testid="nav-help"
          title="Help Center"
          className={({ isActive }) =>
            `flex items-center ${collapsed ? "justify-center px-0" : "gap-3 px-3"} py-2.5 rounded-xl text-sm transition-colors mb-1 ${
              isActive ? "bg-ai-tint text-ai" : "text-ink-dim hover:bg-white/[0.03] hover:text-ink"
            }`
          }
        >
          <LifeBuoy className="w-5 h-5 shrink-0" strokeWidth={1.8} />
          {!collapsed && <span className="truncate">Help</span>}
        </NavLink>
        {!collapsed && <CreditsWidget collapsed={false} />}
        <div className={`${collapsed ? "px-2 flex flex-col items-center gap-2" : "px-5 flex items-center gap-3"} pt-2`}>
          {user?.avatar ? (
            <img src={user.avatar} alt={user.name} className="w-8 h-8 rounded-full object-cover" />
          ) : (
            <div
              className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-xs font-semibold shrink-0"
              title={collapsed ? user?.name : undefined}
            >
              {user?.name?.charAt(0)?.toUpperCase()}
            </div>
          )}
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <div className="text-sm truncate">{user?.name}</div>
              <div className="text-xs text-zinc-500 truncate capitalize">{user?.role}</div>
            </div>
          )}
          <button
            data-testid="logout-btn"
            onClick={handleLogout}
            title="Sign out"
            className="text-zinc-500 hover:text-white p-1.5 rounded-lg hover:bg-white/5"
          >
            <LogOut className="w-4 h-4" />
          </button>
          <NotificationBell collapsed={collapsed} />
        </div>
      </div>

      {/* Drag-to-resize handle — only when pinned open. */}
      {pinned && (
        <ResizableEdge
          testid="sidebar-resize-handle"
          minWidth={MIN_EXPANDED_WIDTH}
          maxWidth={MAX_EXPANDED_WIDTH}
          onResize={setExpandedWidth}
        />
      )}
      </div>
    </aside>
  );
}
