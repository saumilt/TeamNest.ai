import { useEffect, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import CreditsWidget from "@/components/CreditsWidget";
import NotificationBell from "@/components/NotificationBell";
import ResizableEdge from "@/components/ui-v2/ResizableEdge";
import safeStorage from "@/lib/safeStorage";
import { toast } from "sonner";
import {
        MessageSquare,
        LayoutDashboard,
        Sparkles,
        CheckSquare,
        Phone,
        User as UserIcon,
        Building2,
        ChevronsUpDown,
        Check,
        LogOut,
        Bot,
        ShieldCheck,
        PanelLeftClose,
        PanelLeft,
} from "lucide-react";

const PRIMARY = [
        { to: "/dashboard", label: "Home", icon: LayoutDashboard, testid: "nav-dashboard" },
        { to: "/chats",    label: "Chats", icon: MessageSquare, testid: "nav-chats", end: true },
        { to: "/research", label: "AI",    icon: Sparkles,      testid: "nav-research", accent: true },
        { to: "/employees", label: "Hire", icon: Bot,           testid: "nav-employees", accent: true },
        { to: "/tasks",    label: "Tasks", icon: CheckSquare,   testid: "nav-tasks" },
        { to: "/calls",    label: "Calls", icon: Phone,         testid: "nav-calls" },
        { to: "/you",      label: "You",   icon: UserIcon,      testid: "nav-you" },
];

const STORAGE_KEY = "sidebar-collapsed";
const WIDTH_KEY = "sidebar-width";
const COLLAPSED_WIDTH = 64;
const DEFAULT_EXPANDED_WIDTH = 240;
const MIN_EXPANDED_WIDTH = 180;
const MAX_EXPANDED_WIDTH = 360;

/** Desktop-only slim sidebar. Hidden below md breakpoint (mobile uses the
 *  bottom tab bar in `MobileTabBar.jsx`).
 *
 *  Collapses to a 64px icons-only rail when the user clicks the chevron at
 *  the top, persisting the choice via safeStorage so it sticks across
 *  reloads. Tooltips (native title attributes) keep labels discoverable
 *  while collapsed.
 */
export default function Sidebar() {
  const { user, workspaces, logout, switchWorkspace } = useAuth();
  const nav = useNavigate();
  const [wsOpen, setWsOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [collapsed, setCollapsed] = useState(
    () => safeStorage.get(STORAGE_KEY) === "1",
  );
  const [expandedWidth, setExpandedWidth] = useState(() => {
    const stored = safeStorage.getNumber(WIDTH_KEY, DEFAULT_EXPANDED_WIDTH);
    return Math.min(MAX_EXPANDED_WIDTH, Math.max(MIN_EXPANDED_WIDTH, stored));
  });

  const activeWs = (workspaces || []).find((w) => w.workspace_id === user?.workspace_id);
  const multi = (workspaces || []).length > 1; // referenced inside switcher tooltip

  useEffect(() => {
    safeStorage.set(STORAGE_KEY, collapsed ? "1" : "0");
  }, [collapsed]);
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

  const currentWidth = collapsed ? COLLAPSED_WIDTH : expandedWidth;

  return (
    <aside
      data-testid="main-sidebar"
      data-collapsed={collapsed ? "1" : "0"}
      style={{ width: `${currentWidth}px` }}
      className="hidden md:flex sticky top-0 h-[100dvh] shrink-0 bg-[#0a0a0a] border-r border-white/5 flex-col z-10 relative"
    >
      {/* Brand + collapse toggle */}
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
            data-testid="sidebar-collapse-btn"
            onClick={() => setCollapsed(true)}
            className="p-1.5 rounded-md text-zinc-500 hover:text-white hover:bg-white/5"
            title="Collapse sidebar"
            aria-label="Collapse sidebar"
          >
            <PanelLeftClose className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Expand button (shown only when collapsed) */}
      {collapsed && (
        <button
          type="button"
          data-testid="sidebar-expand-btn"
          onClick={() => setCollapsed(false)}
          className="mx-auto mb-3 p-1.5 rounded-md text-zinc-500 hover:text-white hover:bg-white/5"
          title="Expand sidebar"
          aria-label="Expand sidebar"
        >
          <PanelLeft className="w-4 h-4" />
        </button>
      )}

      {/* Workspace switcher — only visible when expanded.
       *
       * Clicking the button always opens the popover. When the user only has
       * one workspace we still show a useful menu (current workspace name,
       * role, and an "Invite teammates" shortcut). Previously the button was
       * inert in single-workspace mode, which was the bug users described as
       * "I click the workspace and nothing happens."
       */}
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
              {/* Always-visible shortcuts so the menu is useful even with
                  just one workspace. */}
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
      <nav className={`flex-1 ${collapsed ? "px-2" : "px-3"} space-y-0.5`}>
        {PRIMARY.map((n) => (
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

      {/* Drag-to-resize handle on the right edge (only when expanded) */}
      {!collapsed && (
        <ResizableEdge
          testid="sidebar-resize-handle"
          minWidth={MIN_EXPANDED_WIDTH}
          maxWidth={MAX_EXPANDED_WIDTH}
          onResize={setExpandedWidth}
        />
      )}
    </aside>
  );
}
