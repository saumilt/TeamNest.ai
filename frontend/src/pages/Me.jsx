import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import {
        ChevronRight,
        LogOut,
        CreditCard,
        User as UserIcon,
        Users,
        CheckCircle2,
        UserPlus,
        ShieldCheck,
        LayoutDashboard,
        Building2,
        Check,
        Sparkles,
        Bell,
        Lock,
        Plug,
        Mic,
        Palette,
        HelpCircle,
        Info,
        FolderKanban,
        DoorOpen,
        Brain,
        Gavel,
        Shield,
        MessageSquareText,
        Cpu,
} from "lucide-react";
import Avatar from "@/components/ui-v2/Avatar";
import CreditRing from "@/components/ui-v2/CreditRing";
import LeaveWorkspaceDialog from "@/components/team/LeaveWorkspaceDialog";
import { api } from "@/lib/api";

/**
 * /you — settings hub. The only screen besides Welcome where the wordmark
 * lives (in the version row at the very bottom).
 */
export default function Me() {
        const { user, workspaces, logout, switchWorkspace } = useAuth();
        const nav = useNavigate();
        const [wsOpen, setWsOpen] = useState(false);
        const [switching, setSwitching] = useState(false);
        const [credits, setCredits] = useState(null);
        const [leaveWsOpen, setLeaveWsOpen] = useState(false);

        useEffect(() => {
                api.get("/billing/usage")
                        .then(({ data }) => setCredits(data))
                        .catch(() => {});
        }, []);

        const activeWs = (workspaces || []).find((w) => w.workspace_id === user?.workspace_id);
        const isAdmin = ["owner", "admin"].includes(user?.role);

        const handleSwitchWorkspace = async (workspace_id) => {
                if (workspace_id === user?.workspace_id) {
                        setWsOpen(false);
                        return;
                }
                setSwitching(true);
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
                <div className="min-h-[100dvh] bg-bg pb-24 md:pb-8 text-ink">
                        {/* Header — centered avatar + identity */}
                        <div className="px-5 pt-10 md:pt-14 pb-6 flex flex-col items-center">
                                <Avatar
                                        name={user?.name || "?"}
                                        src={user?.avatar}
                                        size={80}
                                        online
                                />
                                <div className="mt-3 text-[22px] font-bold tracking-[-0.01em] text-center">
                                        {user?.name}
                                </div>
                                <div className="text-[13px] text-ink-dim mt-0.5">
                                        {activeWs?.name || "Personal"}
                                </div>
                                <Link
                                        to="/profile"
                                        data-testid="me-edit-profile"
                                        className="mt-2 text-[12px] text-brand hover:text-brand-deep font-semibold"
                                >
                                        Edit profile
                                </Link>
                        </div>

                        {/* AI Credits card */}
                        <div className="mx-4 md:mx-5 mb-3 rounded-[16px] bg-surface p-4">
                                <div className="flex items-center gap-4">
                                        <CreditRing
                                                value={credits?.credits_remaining ?? 0}
                                                max={credits?.credits_total ?? 300}
                                                size={96}
                                                stroke={8}
                                        />
                                        <div className="flex-1 min-w-0">
                                                <div className="text-[14px] font-semibold capitalize">
                                                        {credits?.plan_name || "Free"} plan
                                                </div>
                                                <div className="text-[12px] text-ink-dim mt-0.5">
                                                        {credits?.resets_at
                                                                ? `Resets ${new Date(credits.resets_at).toLocaleDateString([], { month: "short", day: "numeric" })}`
                                                                : "Resets on the 1st"}
                                                </div>
                                                <Link
                                                        to="/billing"
                                                        data-testid="me-credits-upgrade"
                                                        className="inline-flex mt-3 px-3 h-8 rounded-full bg-brand-tint text-brand text-[12px] font-semibold items-center gap-1 hover:bg-brand hover:text-black transition-colors"
                                                >
                                                        Upgrade →
                                                </Link>
                                        </div>
                                </div>
                        </div>

                        {/* Workspace card */}
                        {activeWs && (
                                <div className="mx-4 md:mx-5 mb-3 rounded-[16px] bg-surface overflow-hidden">
                                        <button
                                                type="button"
                                                data-testid="me-workspace-current"
                                                onClick={() => (workspaces || []).length > 1 && setWsOpen((v) => !v)}
                                                disabled={switching}
                                                className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-white/[0.03]"
                                        >
                                                <div className="w-9 h-9 rounded-xl bg-brand-tint text-brand flex items-center justify-center">
                                                        <Building2 className="w-5 h-5" />
                                                </div>
                                                <div className="flex-1 min-w-0 text-left">
                                                        <div className="text-[14px] font-semibold truncate">{activeWs.name}</div>
                                                        <div className="text-[12px] text-ink-dim capitalize">
                                                                {activeWs.role} · {(workspaces || []).length} workspace{(workspaces || []).length === 1 ? "" : "s"}
                                                        </div>
                                                </div>
                                                {(workspaces || []).length > 1 && (
                                                        <ChevronRight className={`w-4 h-4 text-ink-mute transition-transform ${wsOpen ? "rotate-90" : ""}`} />
                                                )}
                                        </button>
                                        {wsOpen && (workspaces || []).length > 1 && (
                                                <div className="border-t border-hairline bg-black/30">
                                                        {(workspaces || []).map((w) => {
                                                                const active = w.workspace_id === user?.workspace_id;
                                                                return (
                                                                        <button
                                                                                key={w.workspace_id}
                                                                                type="button"
                                                                                data-testid={`me-workspace-option-${w.workspace_id}`}
                                                                                onClick={() => handleSwitchWorkspace(w.workspace_id)}
                                                                                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/5"
                                                                        >
                                                                                <Building2 className={`w-4 h-4 shrink-0 ${active ? "text-brand" : "text-ink-mute"}`} />
                                                                                <div className="flex-1 min-w-0">
                                                                                        <div className={`text-[13px] truncate ${active ? "text-brand" : "text-ink"}`}>{w.name}</div>
                                                                                        <div className="text-[11px] text-ink-mute capitalize">{w.role}</div>
                                                                                </div>
                                                                                {active && <Check className="w-4 h-4 text-brand" />}
                                                                        </button>
                                                                );
                                                        })}
                                                </div>
                                        )}
                                </div>
                        )}

                        {/* Settings list */}
                        <SettingsGroup>
                                <Row testid="me-dev-os" icon={Cpu} label="Dev OS" to="/dev-os" accent />
                                <Row testid="me-projects" icon={FolderKanban} label="Projects" to="/projects" />
                                <Row testid="me-memory" icon={Brain} label="Workspace memory" to="/memory" />
                                <Row testid="me-decisions" icon={Gavel} label="Decision log" to="/decisions" />
                                <Row testid="me-import" icon={MessageSquareText} label="Import from WhatsApp" to="/import/whatsapp" />
                                <Row testid="me-dashboard" icon={LayoutDashboard} label="Workspace overview" to="/dashboard" />
                                <Row testid="me-approvals" icon={CheckCircle2} label="Approvals" to="/approvals" />
                                <Row testid="me-find-friends" icon={UserPlus} label="Find friends" to="/find-friends" />
                                {isAdmin && <Row testid="me-team-admin" icon={Users} label="Team admin" to="/team" />}
                                {isAdmin && <Row testid="me-audit-log" icon={Shield} label="Audit log" to="/audit-log" />}
                        </SettingsGroup>

                        <SettingsGroup>
                                <Row testid="me-billing" icon={CreditCard} label="Billing & plans" to="/billing" />
                                <Row testid="me-my-ai" icon={Sparkles} label="My AI Assistant" to="/my-ai" accent />
                        </SettingsGroup>

                        <SettingsGroup>
                                <Row testid="me-notifications" icon={Bell} label="Notifications" to="/notifications" />
                                <Row testid="me-privacy" icon={Lock} label="Privacy & data" to="/privacy" />
                                <Row testid="me-connections" icon={Plug} label="Connected accounts" disabled />
                                <Row testid="me-voice" icon={Mic} label="Voice & transcription" disabled />
                                <Row testid="me-appearance" icon={Palette} label="Appearance" disabled />
                        </SettingsGroup>

                        {isAdmin && (
                                <SettingsGroup>
                                        <Row testid="me-admin-dashboard" icon={ShieldCheck} label="Admin dashboard" to="/admin" />
                                </SettingsGroup>
                        )}

                        <SettingsGroup>
                                <Row testid="me-support" icon={HelpCircle} label="Support" to="/support" />
                                <Row testid="me-about" icon={Info} label="About · Privacy · Terms" to="/terms" />
                                <Row testid="me-profile" icon={UserIcon} label="Profile settings" to="/profile" />
                        </SettingsGroup>

                        <div className="mx-4 md:mx-5 mb-2 grid grid-cols-1 gap-2">
                                {activeWs && (
                                        <button
                                                type="button"
                                                data-testid="me-leave-team"
                                                onClick={() => setLeaveWsOpen(true)}
                                                className="w-full h-12 rounded-2xl border border-tn-red/30 bg-tn-red/[0.04] text-tn-red hover:bg-tn-red/10 text-[14px] font-semibold transition-colors flex items-center justify-center gap-2"
                                        >
                                                <DoorOpen className="w-4 h-4" />
                                                {user?.role === "owner" ? "Leave team (transfer first)" : "Leave team"}
                                        </button>
                                )}
                        </div>

                        <div className="mx-4 md:mx-5 mb-6">
                                <button
                                        data-testid="me-logout"
                                        onClick={handleLogout}
                                        className="w-full h-12 rounded-2xl border border-hairline text-ink-dim hover:bg-white/5 text-[14px] font-semibold transition-colors flex items-center justify-center gap-2"
                                >
                                        <LogOut className="w-4 h-4" />
                                        Sign out
                                </button>
                        </div>

                        <div className="text-center text-[11px] text-ink-mute pb-6">
                                teamnest<span className="text-brand">.ai</span> · v1.4.0 · build 240
                        </div>

                        <LeaveWorkspaceDialog
                                open={leaveWsOpen}
                                onOpenChange={setLeaveWsOpen}
                                workspaceName={activeWs?.name || "this workspace"}
                        />
                </div>
        );
}

function SettingsGroup({ children }) {
        return (
                <div className="mx-4 md:mx-5 mb-3 rounded-[16px] bg-surface overflow-hidden divide-y divide-hairline">
                        {children}
                </div>
        );
}

function Row({ icon: Icon, label, to, onClick, accent, disabled, testid }) {
        const body = (
                <>
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                                accent ? "bg-ai-tint text-ai" : "bg-surface-2 text-ink-dim"
                        }`}>
                                <Icon className="w-[18px] h-[18px]" strokeWidth={1.8} />
                        </div>
                        <div className={`flex-1 text-left text-[14px] ${accent ? "text-ai" : disabled ? "text-ink-mute" : "text-ink"}`}>{label}</div>
                        {!disabled && <ChevronRight className="w-4 h-4 text-ink-mute shrink-0" />}
                        {disabled && <span className="text-[11px] text-ink-mute">Soon</span>}
                </>
        );
        const className = `w-full flex items-center gap-3 px-4 py-3 hover:bg-white/[0.03] active:bg-white/[0.05] transition-colors ${disabled ? "opacity-60 pointer-events-none" : ""}`;
        if (to && !disabled) {
                return (
                        <Link to={to} data-testid={testid} className={className}>
                                {body}
                        </Link>
                );
        }
        return (
                <button type="button" data-testid={testid} onClick={onClick} disabled={disabled} className={className}>
                        {body}
                </button>
        );
}
