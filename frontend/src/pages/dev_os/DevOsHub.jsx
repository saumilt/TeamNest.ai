import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ChevronLeft, Plus, Cpu, FolderKanban, ListTodo, GitPullRequest, Rocket, Sparkles, Users, ChevronRight, ShieldCheck, Sun, Shield } from "lucide-react";
import { api } from "@/lib/api";
import AppBar from "@/components/ui-v2/AppBar";
import Pill from "@/components/ui-v2/Pill";
import EmptyState from "@/components/ui-v2/EmptyState";

/**
 * /dev-os — Dev OS dashboard. Tiles for projects / tasks / proposals /
 * deployments, recursive summary banner, and a list of projects.
 */
export default function DevOsHub() {
        const nav = useNavigate();
        const [data, setData] = useState(null);
        const [loading, setLoading] = useState(true);
        const [digest, setDigest] = useState(null);

        useEffect(() => {
                api.get("/dev-os/dashboard")
                        .then((r) => setData(r.data))
                        .catch((e) => toast.error(e?.response?.data?.detail || "Could not load Dev OS"))
                        .finally(() => setLoading(false));
                api.get("/dev-os/daily-digest")
                        .then((r) => { if (!r.data?.empty) setDigest(r.data); })
                        .catch(() => {});
        }, []);

        const projects = data?.projects || [];

        return (
                <div className="min-h-[100dvh] bg-bg pb-24 md:pb-8 text-ink" data-testid="dev-os-hub">
                        <AppBar
                                left={
                                        <Link to="/you" className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-white/5" data-testid="dev-os-back">
                                                <ChevronLeft className="w-5 h-5" />
                                        </Link>
                                }
                                center={<div className="text-[15px] font-semibold">Dev OS</div>}
                                right={
                                        <div className="flex items-center gap-2">
                                                <Link
                                                        to="/dev-os/simple-builder"
                                                        data-testid="dev-os-simple-builder"
                                                        className="h-9 px-3 rounded-full bg-surface-2 ring-1 ring-amber-400/30 text-amber-200 text-[13px] font-semibold flex items-center gap-1.5 hover:bg-surface-3"
                                                >
                                                        <Sparkles className="w-4 h-4" /> Simple Builder
                                                </Link>
                                                <Link
                                                        to="/dev-os/new"
                                                        data-testid="dev-os-new-project"
                                                        className="h-9 px-3 rounded-full bg-brand text-black text-[13px] font-semibold flex items-center gap-1.5 hover:bg-brand-deep"
                                                >
                                                        <Plus className="w-4 h-4" /> Project
                                                </Link>
                                        </div>
                                }
                        />

                        <div className="px-4 md:px-5 pt-4">
                                <div className="rounded-2xl bg-gradient-to-br from-ai-tint to-brand-tint/40 border border-ai/20 p-5">
                                        <div className="flex items-start gap-3">
                                                <div className="w-11 h-11 rounded-2xl bg-bg/40 backdrop-blur flex items-center justify-center">
                                                        <Cpu className="w-6 h-6 text-ai" />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                        <div className="text-[15px] font-bold text-ink">Recursive Improvement</div>
                                                        <div className="text-[13px] text-ink-dim mt-1 leading-snug">
                                                                {loading
                                                                        ? "Loading…"
                                                                        : data?.recursive_summary || "Your projects improve themselves through AI proposals you approve."}
                                                        </div>
                                                </div>
                                        </div>
                                </div>
                        </div>

                        {/* Daily digest card — shows pending / auto-approved / top theme */}
                        {digest && (
                                <Link
                                        to="/dev-os/governance"
                                        data-testid="dev-os-digest-card"
                                        className="mx-4 md:mx-5 mt-3 block rounded-2xl bg-surface p-4 hover:bg-white/[0.04] transition-colors"
                                >
                                        <div className="flex items-start gap-3">
                                                <div className="w-10 h-10 rounded-xl bg-brand-tint text-brand flex items-center justify-center shrink-0">
                                                        <Sun className="w-5 h-5" />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2 mb-1">
                                                                <div className="text-[12px] font-semibold uppercase tracking-wider text-ink-mute">Daily digest</div>
                                                                <span className="text-[11px] text-ink-mute font-mono">{digest.date}</span>
                                                        </div>
                                                        <div
                                                                className="text-[13px] text-ink leading-snug"
                                                                dangerouslySetInnerHTML={{
                                                                        __html: (digest.headline || "").replace(/\*\*(.+?)\*\*/g, '<span class="text-brand font-bold">$1</span>'),
                                                                }}
                                                        />
                                                        {digest.stats?.top_themes && Object.keys(digest.stats.top_themes).length > 0 && (
                                                                <div className="flex flex-wrap gap-1.5 mt-2">
                                                                        {Object.entries(digest.stats.top_themes).slice(0, 4).map(([k, v]) => (
                                                                                <Pill key={k} tone="ai" size="sm">{k} · {v}</Pill>
                                                                        ))}
                                                                </div>
                                                        )}
                                                </div>
                                                <ChevronRight className="w-4 h-4 text-ink-mute shrink-0 mt-2" />
                                        </div>
                                </Link>
                        )}

                        {/* Stat tiles */}
                        <div className="px-4 md:px-5 mt-4 grid grid-cols-2 gap-3">
                                <Tile testid="tile-projects" icon={FolderKanban} label="Projects" value={projects.length} tone="brand" />
                                <Tile testid="tile-tasks" icon={ListTodo} label="Open tasks" value={data?.open_tasks ?? 0} tone="default" />
                                <Tile testid="tile-proposals" icon={GitPullRequest} label="Open proposals" value={data?.open_proposals ?? 0} tone="ai" />
                                <Tile testid="tile-deploys" icon={Rocket} label="Deployments / mo" value={data?.deployments_this_month ?? 0} tone="green" />
                        </div>

                        {/* Governance shortcut */}
                        <div className="px-4 md:px-5 mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
                                                                <Link
                                        to="/dev-os/governance"
                                        data-testid="dev-os-governance-link"
                                        className="flex items-center gap-3 rounded-2xl bg-surface p-4 hover:bg-white/[0.04] active:bg-white/[0.06] transition-colors"
                                >
                                        <div className="w-10 h-10 rounded-xl bg-brand-tint text-brand flex items-center justify-center">
                                                <ShieldCheck className="w-5 h-5" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                                <div className="text-[14px] font-semibold">Governance</div>
                                                <div className="text-[12px] text-ink-dim mt-0.5">Approval rules &amp; agent policy</div>
                                        </div>
                                        <ChevronRight className="w-4 h-4 text-ink-mute" />
                                </Link>
                        </div>

                        {/* Audit log shortcut */}
                        <div className="px-4 md:px-5 mt-2">
                                <Link
                                        to="/dev-os/audit-log"
                                        data-testid="dev-os-audit-link"
                                        className="flex items-center gap-3 rounded-2xl bg-surface p-4 hover:bg-white/[0.04] active:bg-white/[0.06] transition-colors"
                                >
                                        <div className="w-10 h-10 rounded-xl bg-surface-2 text-ink flex items-center justify-center">
                                                <Shield className="w-5 h-5" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                                <div className="text-[14px] font-semibold">Audit log</div>
                                                <div className="text-[12px] text-ink-dim mt-0.5">Immutable activity feed across all projects</div>
                                        </div>
                                        <ChevronRight className="w-4 h-4 text-ink-mute" />
                                </Link>
                        </div>

                        {/* Projects list */}
                        <div className="px-4 md:px-5 mt-6">
                                <div className="flex items-center justify-between mb-3">
                                        <div className="text-[15px] font-bold">Projects</div>
                                        {projects.length > 0 && (
                                                <button
                                                        type="button"
                                                        data-testid="projects-new-cta"
                                                        onClick={() => nav("/dev-os/new")}
                                                        className="text-[12px] font-semibold text-brand hover:text-brand-deep"
                                                >
                                                        + New
                                                </button>
                                        )}
                                </div>

                                {loading ? (
                                        <div className="rounded-2xl bg-surface p-6 text-center text-ink-dim text-[13px]">Loading…</div>
                                ) : projects.length === 0 ? (
                                        <div className="rounded-2xl bg-surface">
                                                <EmptyState
                                                        icon={Sparkles}
                                                        title="No projects yet"
                                                        sub="Describe a product idea and the Product CEO agent will draft a full plan — modules, schema, backlog and deployment steps."
                                                        cta="Create your first project"
                                                        ctaTestid="empty-create-project"
                                                        onCta={() => nav("/dev-os/new")}
                                                />
                                        </div>
                                ) : (
                                        <div className="space-y-2">
                                                {projects.map((p) => (
                                                        <Link
                                                                key={p.id}
                                                                to={`/dev-os/projects/${p.id}`}
                                                                data-testid={`project-row-${p.id}`}
                                                                className="flex items-center gap-3 rounded-2xl bg-surface p-4 hover:bg-white/[0.04] active:bg-white/[0.06] transition-colors"
                                                        >
                                                                <div className="w-10 h-10 rounded-xl bg-brand-tint text-brand flex items-center justify-center shrink-0">
                                                                        <FolderKanban className="w-5 h-5" />
                                                                </div>
                                                                <div className="flex-1 min-w-0">
                                                                        <div className="text-[14px] font-semibold truncate">{p.name}</div>
                                                                        <div className="text-[12px] text-ink-dim mt-0.5 line-clamp-1">
                                                                                {p.description || p.problem || "No description"}
                                                                        </div>
                                                                </div>
                                                                <div className="flex flex-col items-end gap-1 shrink-0">
                                                                        <Pill tone={p.health === "stable" ? "green" : "ai"} size="sm">{p.status || "draft"}</Pill>
                                                                        <span className="text-[11px] text-ink-mute">{p.version || "v0.1.0"}</span>
                                                                </div>
                                                        </Link>
                                                ))}
                                        </div>
                                )}
                        </div>
                </div>
        );
}

function Tile({ icon: Icon, label, value, tone = "default", testid }) {
        const tones = {
                default: "bg-surface text-ink-dim",
                brand: "bg-brand-tint text-brand",
                ai: "bg-ai-tint text-ai",
                green: "bg-tn-green/15 text-tn-green",
        };
        return (
                <div data-testid={testid} className="rounded-2xl bg-surface p-4">
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${tones[tone]}`}>
                                <Icon className="w-5 h-5" />
                        </div>
                        <div className="mt-3 text-[24px] font-bold leading-none text-ink">{value}</div>
                        <div className="text-[12px] text-ink-dim mt-1">{label}</div>
                </div>
        );
}
