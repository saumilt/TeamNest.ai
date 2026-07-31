import { useState } from "react";
import { Outlet, Navigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import Sidebar from "@/components/Sidebar";
import MobileTabBar from "@/components/MobileTabBar";
import ChangelogModal from "@/components/ChangelogModal";
import EmployeeCrossSell from "@/components/EmployeeCrossSell";
import CreditSplash from "@/components/CreditSplash";
import CreditsBadge from "@/components/CreditsBadge";
import BudgetNudge from "@/components/BudgetNudge";
import ForcePasswordChange from "@/components/ForcePasswordChange";
import useUnreadTitle from "@/hooks/useUnreadTitle";

/** App shell for authenticated routes.
 *
 *  Mobile (<md): screens render full-width with their own top bars + a fixed
 *  bottom tab bar. No hamburger drawer.
 *
 *  Desktop (≥md): slim left sidebar with 5 nav items + secondary section,
 *  plus the main content pane.
 */
export default function AppShell() {
  const { user, loading } = useAuth();
  // Post-login redirect (e.g. "Use this template" while logged out).
  // useState initializer: read+clear localStorage exactly once per mount.
  const [nextPath] = useState(() => safeNextPath());

  // Sync unread count into the title / PWA / desktop badge (no-op pre-auth).
  useUnreadTitle(!!user && !user?.must_change_password);

  if (loading) {
    return (
      <div className="min-h-[100dvh] bg-[#0a0a0a] flex items-center justify-center">
        <div className="text-zinc-500 text-sm">Loading…</div>
      </div>
    );
  }
  if (!user) return <Navigate to="/" replace />;

  // Admin-provisioned accounts must set their own password before using the app.
  if (user.must_change_password) return <ForcePasswordChange />;

  if (nextPath && nextPath !== window.location.pathname) return <Navigate to={nextPath} replace />;

  return (
    <div className="min-h-[100dvh] bg-[#0a0a0a] text-white flex">
      <Sidebar />
      <main className="flex-1 min-w-0 overflow-x-hidden flex flex-col pb-[calc(env(safe-area-inset-bottom)+64px)] md:pb-0">
        <Outlet />
      </main>
      <MobileTabBar />
      <ChangelogModal />
      <EmployeeCrossSell />
      <CreditSplash />
      <CreditsBadge />
      <BudgetNudge />
    </div>
  );
}

function safeNextPath() {
  try {
    const p = localStorage.getItem("tn-next-path");
    if (p && p.startsWith("/")) {
      localStorage.removeItem("tn-next-path");
      return p;
    }
  } catch { /* noop */ }
  return null;
}
