import { BrowserRouter, Route, Routes, Navigate, useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { AuthProvider } from "@/context/AuthContext";
import { Toaster } from "@/components/ui/sonner";
import AppShell from "@/pages/AppShell";
import Dashboard from "@/pages/Dashboard";
import Chats from "@/pages/Chats";
import Tasks from "@/pages/Tasks";
import MyAI from "@/pages/MyAI";
import TeamAdmin from "@/pages/TeamAdmin";
import Research from "@/pages/Research";
import PublicSnapshot from "@/pages/PublicSnapshot";
import JoinWorkspace from "@/pages/JoinWorkspace";
import FindFriends from "@/pages/FindFriends";
import Approvals from "@/pages/Approvals";
import AdminDashboard from "@/pages/AdminDashboard";
import SuperAdmin from "@/pages/SuperAdmin";
import CallRoom from "@/pages/CallRoom";
import { ProjectsList, ProjectDetail as FolderDetail } from "@/pages/Projects";
import Profile from "@/pages/Profile";
import Billing from "@/pages/Billing";
import Me from "@/pages/Me";
import Calls from "@/pages/Calls";
import Memory from "@/pages/Memory";
import MemoryPage from "@/pages/MemoryPage";
import Decisions from "@/pages/Decisions";
import AuditLog from "@/pages/AuditLog";
import ImportWhatsApp from "@/pages/ImportWhatsApp";
import ProjectMemoryTimeline from "@/pages/ProjectMemoryTimeline";
import NotificationsPrefs from "@/pages/NotificationsPrefs";
import AIEmployees from "@/pages/AIEmployees";
import AIEmployeeBuilder from "@/pages/ai_builder/AIEmployeeBuilder";
import WorkspaceAI from "@/pages/WorkspaceAI";
import ConnectorsPage from "@/pages/ConnectorsPage";
import EnterprisePage from "@/pages/EnterprisePage";
import EnterpriseProfile from "@/pages/EnterpriseProfile";
import AIEmployeeMarketplace from "@/pages/ai_builder/AIEmployeeMarketplace";
import BuilderProgram from "@/pages/ai_builder/BuilderProgram";
import DeployedDirectory from "@/pages/ai_builder/DeployedDirectory";
import EmployeeProfile from "@/pages/ai_builder/EmployeeProfile";
import Bookkeeper from "@/pages/Bookkeeper";
import SmsContacts from "@/pages/SmsContacts";
import DevOsHub from "@/pages/dev_os/DevOsHub";
import NewProject from "@/pages/dev_os/NewProject";
import SimpleAppBuilder from "@/pages/dev_os/SimpleAppBuilder";
import GovernancePanel from "@/pages/dev_os/GovernancePanel";
import BuildConsole from "@/pages/dev_os/BuildConsole";
import DevStudio from "@/pages/dev_os/DevStudio";
import ExecutionMode from "@/pages/dev_os/ExecutionMode";
import DevOsAuditLog from "@/pages/dev_os/AuditLog";
import GitHubSettings from "@/pages/dev_os/GitHubSettings";
import Integrations from "@/pages/dev_os/Integrations";
import Privacy from "@/pages/legal/Privacy";
import Terms from "@/pages/legal/Terms";
import Support from "@/pages/legal/Support";
import EULA from "@/pages/legal/EULA";
import Downloads from "@/pages/Downloads";
import WebLayout from "@/components/web/WebLayout";
import WebHome from "@/pages/web/Home";
import WebShowcase from "@/pages/web/Showcase";
import WebPricing from "@/pages/web/Pricing";
import WebDevOsInfo from "@/pages/web/DevOsInfo";
import WebProduct from "@/pages/web/Product";
import WebChangelog from "@/pages/web/Changelog";
import WebEmployees from "@/pages/web/EmployeesMarketing";
import TemplatesMarket from "@/pages/web/TemplatesMarket";
import InstallTemplate from "@/pages/market/InstallTemplate";
import MyTemplates from "@/pages/market/MyTemplates";
import MarketAdmin from "@/pages/market/MarketAdmin";
import WebAuth from "@/pages/web/Auth";
import ResetPassword from "@/pages/web/ResetPassword";
import Waitlist from "@/pages/launch/Waitlist";
import InviteCodePage from "@/pages/launch/InviteCode";
import DropPage from "@/pages/launch/DropPage";
import InviteDashboard from "@/pages/launch/InviteDashboard";
import LaunchAdmin from "@/pages/launch/LaunchAdmin";
import SharePreviewPage from "@/pages/SharePreviewPage";
import ProductionAppPage from "@/pages/ProductionAppPage";
import InstallPrompt from "@/components/InstallPrompt";
import WelcomeTour from "@/components/WelcomeTour";
import { initNativeShell } from "@/lib/native";
import "@/App.css";

// Custom-domain bootstrap: when TeamNest is served on a customer's own
// domain (CNAME → this app), resolve the host to a published /p/ app and
// serve it full-screen instead of the TeamNest UI.
const PLATFORM_HOSTS = /(\.emergentagent\.com|\.emergent\.host|localhost|127\.0\.0\.1)$/i;

function useCustomDomainSlug() {
  const isPlatform = PLATFORM_HOSTS.test(window.location.hostname);
  const [state, setState] = useState({ checked: isPlatform, slug: null });
  useEffect(() => {
    if (isPlatform) return;
    fetch(`${process.env.REACT_APP_BACKEND_URL}/api/p-resolve?host=${encodeURIComponent(window.location.hostname)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setState({ checked: true, slug: d?.slug || null }))
      .catch(() => setState({ checked: true, slug: null }));
  }, [isPlatform]);
  return state;
}

export default function App() {
  const customDomain = useCustomDomainSlug();

  useEffect(() => {
    initNativeShell();
  }, []);

  if (!customDomain.checked) return null;
  if (customDomain.slug) {
    return <ProductionAppPage slug={customDomain.slug} bare />;
  }

  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Marketing site (web layout: nav + footer, light/dark themed) */}
          <Route element={<WebLayout />}>
            <Route path="/" element={<WebHome />} />
            <Route path="/showcase" element={<WebShowcase />} />
            <Route path="/pricing" element={<WebPricing />} />
            <Route path="/dev-os-guide" element={<WebDevOsInfo />} />
            <Route path="/product" element={<WebProduct />} />
            <Route path="/templates" element={<TemplatesMarket />} />
            <Route path="/employees-info" element={<WebEmployees />} />
            <Route path="/changelog" element={<WebChangelog />} />
          </Route>

          {/* Auth (own layout, two-column product surface) */}
          <Route path="/login" element={<WebAuth defaultMode="login" />} />
          <Route path="/signup" element={<WebAuth defaultMode="signup" />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/waitlist" element={<Waitlist />} />
          <Route path="/invite" element={<InviteCodePage />} />
          <Route path="/drop/:code" element={<DropPage />} />

          {/* Public utilities (kept as-is) */}
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/eula" element={<EULA />} />
          <Route path="/support" element={<Support />} />
          <Route path="/downloads" element={<Downloads />} />
          <Route path="/downloads/" element={<Downloads />} />
          <Route path="/s/:token" element={<PublicSnapshot />} />
          <Route path="/share/:token" element={<SharePreviewPage />} />
          <Route path="/p/:slug" element={<ProductionAppPage />} />
          <Route path="/join/:token" element={<JoinWorkspace />} />
          <Route path="/call/:callId" element={<CallRoom />} />

          {/* Authenticated app shell */}
          <Route element={<AppShell />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/chats" element={<Chats />} />
            <Route path="/chats/:chatId" element={<Chats />} />
            <Route path="/projects" element={<ProjectsList />} />
            <Route path="/projects/:folderId" element={<FolderDetail />} />
            <Route path="/tasks" element={<Tasks />} />
            <Route path="/my-ai" element={<MyAI />} />
            <Route path="/team" element={<TeamAdmin />} />
            <Route path="/research" element={<Research />} />
            <Route path="/find-friends" element={<FindFriends />} />
            <Route path="/approvals" element={<Approvals />} />
            <Route path="/admin" element={<AdminDashboard />} />
            <Route path="/superadmin" element={<SuperAdmin />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/billing" element={<Billing />} />
            <Route path="/me" element={<Me />} />
            <Route path="/you" element={<Me />} />
            <Route path="/calls" element={<Calls />} />
            <Route path="/memory" element={<Memory />} />
            <Route path="/ai-memory" element={<MemoryPage />} />
            <Route path="/decisions" element={<Decisions />} />
            <Route path="/audit-log" element={<AuditLog />} />
            <Route path="/import/whatsapp" element={<ImportWhatsApp />} />
            <Route path="/projects/:folderId/memory" element={<ProjectMemoryTimeline />} />
            <Route path="/notifications" element={<NotificationsPrefs />} />
            <Route path="/invites" element={<InviteDashboard />} />
            <Route path="/launch-admin" element={<LaunchAdmin />} />
            <Route path="/employees" element={<AIEmployees />} />
            <Route path="/ai-builder" element={<AIEmployeeBuilder />} />
            <Route path="/builder-program" element={<BuilderProgram />} />
            <Route path="/ai-builder/deployed" element={<DeployedDirectory />} />
            <Route path="/ai-builder/marketplace" element={<AIEmployeeMarketplace />} />
            <Route path="/ai-builder/:id" element={<EmployeeProfile />} />
            <Route path="/workspace-ai" element={<WorkspaceAI />} />
            <Route path="/connectors" element={<ConnectorsPage />} />
            <Route path="/enterprise" element={<EnterprisePage />} />
            <Route path="/enterprise/people/:id" element={<EnterpriseProfile />} />
            <Route path="/bookkeeper" element={<Bookkeeper />} />
            <Route path="/sms" element={<SmsContacts />} />
            <Route path="/dev-os" element={<DevOsHub />} />
            <Route path="/market/install/:templateId" element={<InstallTemplate />} />
            <Route path="/market/mine" element={<MyTemplates />} />
            <Route path="/market/review" element={<MarketAdmin />} />
            <Route path="/dev-os/new" element={<NewProject />} />
            <Route path="/dev-os/simple-builder" element={<SimpleAppBuilder />} />
            <Route path="/dev-os/governance" element={<GovernancePanel />} />
            <Route path="/dev-os/github" element={<GitHubSettings />} />
            <Route path="/dev-os/integrations" element={<Integrations />} />
            <Route path="/dev-os/audit-log" element={<DevOsAuditLog />} />
            <Route path="/dev-os/projects/:projectId" element={<DevProjectRedirect />} />
            <Route path="/dev-os/projects/:projectId/studio" element={<DevStudio />} />
            <Route path="/dev-os/projects/:projectId/console" element={<BuildConsole />} />
            <Route path="/dev-os/projects/:projectId/execution" element={<ExecutionMode />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <Toaster theme="dark" position="bottom-right" />
        <InstallPrompt />
        <WelcomeTour />
      </BrowserRouter>
    </AuthProvider>
  );
}

function DevProjectRedirect() {
  const { projectId } = useParams();
  return <Navigate to={`/dev-os/projects/${projectId}/studio`} replace />;
}
