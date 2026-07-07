/* DevWorkspacePane — right-side "live workspace" in a Development chat.
 *
 * Renders 5 tabs against the linked Dev OS project:
 *   • Plan   – product brief + pillars
 *   • Tasks  – Kanban
 *   • Bugs   – bugs list (delegates to BugsTab from ProjectDetail)
 *   • Preview – iframe of preview_url (if any) + status pill
 *   • Memory – memory items (existing MemoryTab)
 *
 * Designed as a slim wrapper around the already-built ProjectDetail
 * sub-views — we re-use the views directly to avoid duplication.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Activity, Bug, FileText, Globe, KanbanSquare, Loader2, Maximize2, Brain } from "lucide-react";
import { api } from "@/lib/api";
import Pill from "@/components/ui-v2/Pill";

// Re-use the already-built tab views from ProjectDetail.
import { PlanView, TaskKanban, BugsTab, MemoryTab } from "@/pages/dev_os/ProjectDetail";

const TABS = [
        { key: "plan",    label: "Plan",    Icon: FileText },
        { key: "tasks",   label: "Tasks",   Icon: KanbanSquare },
        { key: "bugs",    label: "Bugs",    Icon: Bug },
        { key: "preview", label: "Preview", Icon: Globe },
        { key: "memory",  label: "Memory",  Icon: Brain },
];

export default function DevWorkspacePane({ projectId }) {
        const [project, setProject] = useState(null);
        const [tab, setTab] = useState("plan");
        const [refreshing, setRefreshing] = useState(false);

        useEffect(() => {
                if (!projectId) return;
                let cancelled = false;
                api.get(`/dev-projects/${projectId}`).then(({ data }) => {
                        if (!cancelled) setProject(data);
                }).catch(() => {});
                return () => { cancelled = true; };
        }, [projectId]);

        const reload = async () => {
                setRefreshing(true);
                try {
                        const { data } = await api.get(`/dev-projects/${projectId}`);
                        setProject(data);
                } finally {
                        setRefreshing(false);
                }
        };

        if (!project) {
                return (
                        <div className="h-full flex items-center justify-center bg-bg">
                                <Loader2 className="w-5 h-5 animate-spin text-ink-dim" />
                        </div>
                );
        }

        return (
                <div className="h-full flex flex-col bg-bg border-l border-hairline" data-testid="dev-workspace-pane">
                        {/* Header */}
                        <div className="px-3 py-2 border-b border-hairline flex items-center gap-2 shrink-0">
                                <Activity className="w-4 h-4 text-amber-300 shrink-0" />
                                <div className="min-w-0 flex-1">
                                        <div className="text-[12px] font-semibold text-ink truncate">{project.name}</div>
                                        <div className="text-[10px] text-ink-mute font-mono">{project.version || "v0.1.0"}</div>
                                </div>
                                <Pill tone={project.health === "stable" ? "green" : "amber"} size="sm">
                                        {project.health || "stable"}
                                </Pill>
                                <Link
                                        to={`/dev-os/projects/${projectId}`}
                                        title="Open full project view"
                                        data-testid="dev-workspace-expand"
                                        className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-white/5 text-ink-mute hover:text-ink"
                                >
                                        <Maximize2 className="w-3.5 h-3.5" />
                                </Link>
                        </div>

                        {/* Tab bar */}
                        <div className="flex border-b border-hairline shrink-0 overflow-x-auto" data-testid="dev-workspace-tabs">
                                {TABS.map(({ key, label, Icon }) => (
                                        <button
                                                key={key}
                                                onClick={() => setTab(key)}
                                                data-testid={`dev-workspace-tab-${key}`}
                                                className={`flex-1 min-w-[72px] h-9 flex items-center justify-center gap-1.5 text-[11px] font-mono uppercase tracking-wider transition-colors ${
                                                        tab === key
                                                                ? "text-amber-300 border-b border-amber-300"
                                                                : "text-ink-mute hover:text-ink"
                                                }`}
                                        >
                                                <Icon className="w-3.5 h-3.5" />
                                                {label}
                                        </button>
                                ))}
                        </div>

                        {/* Tab content (scrollable) */}
                        <div className="flex-1 overflow-y-auto p-3" data-testid={`dev-workspace-content-${tab}`}>
                                {tab === "plan"    && <PlanView plan={project.plan || {}} />}
                                {tab === "tasks"   && <TaskKanban tasks={project.tasks || []} onChange={reload} />}
                                {tab === "bugs"    && <BugsTab projectId={projectId} />}
                                {tab === "preview" && <PreviewTab projectId={projectId} project={project} />}
                                {tab === "memory"  && <MemoryTab projectId={projectId} />}
                        </div>

                        {refreshing && (
                                <div className="absolute top-2 right-12 text-ink-mute">
                                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                </div>
                        )}
                </div>
        );
}

function PreviewTab({ projectId, project }) {
        const [preview, setPreview] = useState(null);
        const [loading, setLoading] = useState(true);

        useEffect(() => {
                let cancelled = false;
                api.get(`/dev-projects/${projectId}/preview`)
                        .then(({ data }) => { if (!cancelled) setPreview(data); })
                        .catch(() => { if (!cancelled) setPreview(null); })
                        .finally(() => { if (!cancelled) setLoading(false); });
                return () => { cancelled = true; };
        }, [projectId]);

        if (loading) {
                return (
                        <div className="h-40 flex items-center justify-center">
                                <Loader2 className="w-5 h-5 animate-spin text-ink-dim" />
                        </div>
                );
        }

        if (!preview?.preview_url) {
                return (
                        <div className="rounded-2xl bg-surface p-6 text-center text-[12px] text-ink-mute">
                                <Globe className="w-6 h-6 text-ink-mute mx-auto mb-2" />
                                <div className="font-medium text-ink mb-1">No preview yet</div>
                                <div>Trigger a build from the Build Console to generate a preview deployment.</div>
                                <Link
                                        to={`/dev-os/projects/${projectId}/console`}
                                        className="mt-3 inline-flex items-center gap-1.5 text-amber-300 hover:underline text-[12px]"
                                >
                                        Open Build Console →
                                </Link>
                        </div>
                );
        }

        return (
                <div className="space-y-2 h-full flex flex-col">
                        <div className="flex items-center gap-2">
                                <Pill tone="green" size="sm">{preview.status || "ready"}</Pill>
                                <a
                                        href={preview.preview_url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-[11px] text-amber-300 hover:underline font-mono truncate flex-1"
                                >
                                        {preview.preview_url}
                                </a>
                        </div>
                        <iframe
                                src={preview.preview_url}
                                title={`${project.name} preview`}
                                className="flex-1 w-full min-h-[260px] rounded-xl bg-bg border border-hairline"
                                sandbox="allow-scripts allow-same-origin allow-forms"
                                data-testid="dev-workspace-preview-iframe"
                        />
                </div>
        );
}
