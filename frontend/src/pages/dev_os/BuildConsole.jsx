import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import { ChevronLeft, Play, Loader2, Github, Rocket, ExternalLink, Check, Clock, Activity } from "lucide-react";
import { api } from "@/lib/api";
import AppBar from "@/components/ui-v2/AppBar";
import Pill from "@/components/ui-v2/Pill";
import FileExplorerPanel from "@/pages/dev_os/FileExplorerPanel";
import TalkToBuildBar from "@/pages/dev_os/TalkToBuildBar";

const STAGE_LABELS = {
        queued:       "Queued",
        planning:     "Planning",
        scaffolding:  "Scaffolding",
        frontend:     "Frontend agent building",
        backend:      "Backend agent building",
        qa:           "QA agent testing",
        security:     "Security review",
        preview:      "Preview deployment",
        complete:     "Build complete",
};

/**
 * /dev-os/projects/:projectId/console — Emergent-style 3-pane build console.
 *
 * Left: project prompt + build actions.  Center: live timeline of the active
 * build (auto-advances via /dev-builds/{id}/advance).  Right: latest preview
 * URL + performance score + PR status.  All work is simulated against
 * dev_builds + dev_preview_deployments + dev_pull_requests.
 */
export default function BuildConsole() {
        const { projectId } = useParams();
        const [project, setProject] = useState(null);
        const [builds, setBuilds] = useState([]);
        const [activeBuildId, setActiveBuildId] = useState(null);
        const [preview, setPreview] = useState(null);
        const [prs, setPrs] = useState([]);
        const [github, setGithub] = useState(null);
        const [busy, setBusy] = useState(false);
        // Bumped by the Talk-to-Build bar after a successful edit so the
        // FileExplorerPanel re-fetches the tree + re-opens the file with
        // its new content. Keeps the chat ↔ code loop tight.
        const [fileRefreshKey, setFileRefreshKey] = useState(0);

        const load = useCallback(async () => {
                const [p, b, pr, prsR, gh] = await Promise.all([
                        api.get(`/dev-projects/${projectId}`),
                        api.get(`/dev-projects/${projectId}/builds`),
                        api.get(`/dev-projects/${projectId}/preview`),
                        api.get(`/dev-projects/${projectId}/pull-requests`),
                        api.get(`/dev-os/github`),
                ]);
                setProject(p.data);
                setBuilds(b.data.builds || []);
                setPreview(pr.data?.empty ? null : pr.data);
                setPrs(prsR.data.pull_requests || []);
                setGithub(gh.data?.status === "connected" ? gh.data : null);
        }, [projectId]);

        useEffect(() => { load().catch(() => {}); }, [load]);

        // Auto-advance any running build every 1.5s.
        useEffect(() => {
                const running = builds.find((b) => b.build_status === "running");
                if (!running) return;
                setActiveBuildId(running.id);
                const tick = setInterval(async () => {
                        try {
                                await api.post(`/dev-builds/${running.id}/advance`, {});
                                await load();
                        } catch { /* noop */ }
                }, 1500);
                return () => clearInterval(tick);
        }, [builds, load]);

        const startBuild = async () => {
                setBusy(true);
                try {
                        const { data } = await api.post(`/dev-projects/${projectId}/builds`, {});
                        toast.success(`Build #${data.build_number} started`);
                        setActiveBuildId(data.id);
                        await load();
                } catch (err) {
                        if (!err.isCreditLimit) toast.error(err?.response?.data?.detail || "Could not start build");
                } finally { setBusy(false); }
        };

        const createPreview = async () => {
                try {
                        await api.post(`/dev-projects/${projectId}/preview`, {});
                        toast.success("Preview deployment created");
                        await load();
                } catch (err) {
                        toast.error(err?.response?.data?.detail || "Preview failed");
                }
        };

        const exportToGitHub = async () => {
                if (!github) {
                        toast.error("Connect GitHub first → /dev-os/github");
                        return;
                }
                try {
                        const { data } = await api.post(`/dev-projects/${projectId}/github/export`, {});
                        if (data?.ok === false) {
                                toast.error(data.reason);
                        } else {
                                toast.success(`PR #${data.pr.pr_number} drafted`);
                                await load();
                        }
                } catch (err) {
                        toast.error(err?.response?.data?.detail || "Export failed");
                }
        };

        if (!project) return <div className="min-h-[100dvh] bg-bg flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-ink-dim" /></div>;

        const activeBuild = builds.find((b) => b.id === activeBuildId) || builds[0];
        const timeline = activeBuild?.timeline || [];

        return (
                <div className="min-h-[100dvh] bg-bg text-ink" data-testid="build-console">
                        <AppBar
                                left={
                                        <Link to={`/dev-os/projects/${projectId}`} className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-white/5" data-testid="bc-back">
                                                <ChevronLeft className="w-5 h-5" />
                                        </Link>
                                }
                                center={<div className="text-[15px] font-semibold truncate max-w-[240px]">{project.name} · Console</div>}
                                right={
                                        <button
                                                type="button"
                                                data-testid="bc-start-build"
                                                onClick={startBuild}
                                                disabled={busy || !!builds.find((b) => b.build_status === "running")}
                                                className="h-9 px-3 rounded-full bg-brand text-black text-[13px] font-semibold flex items-center gap-1.5 hover:bg-brand-deep disabled:opacity-60"
                                        >
                                                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />} Start build
                                        </button>
                                }
                        />

                        <div className="grid grid-cols-1 md:grid-cols-[280px_1fr_320px] gap-3 p-3 md:p-4">
                                {/* LEFT — prompt + actions */}
                                <div className="space-y-3" data-testid="bc-left">
                                        <Card title="Project prompt">
                                                <div className="text-[13px] text-ink-dim leading-snug whitespace-pre-wrap line-clamp-[12]">
                                                        {project.problem || project.description || "—"}
                                                </div>
                                        </Card>
                                        <Card title="Actions">
                                                <button onClick={createPreview} data-testid="bc-create-preview" className="w-full h-10 rounded-xl bg-surface-2 text-ink text-[13px] font-medium flex items-center justify-center gap-2 hover:bg-white/10">
                                                        <Rocket className="w-4 h-4" /> Refresh preview
                                                </button>
                                                <button onClick={exportToGitHub} data-testid="bc-export-gh" className="w-full h-10 rounded-xl bg-surface-2 text-ink text-[13px] font-medium flex items-center justify-center gap-2 hover:bg-white/10 mt-2">
                                                        <Github className="w-4 h-4" /> Export to GitHub
                                                </button>
                                                <Link to="/dev-os/github" className="block w-full text-center h-10 leading-[40px] rounded-xl bg-surface-2 text-ink-dim text-[12px] font-medium hover:bg-white/10 mt-2" data-testid="bc-gh-settings">
                                                        GitHub settings →
                                                </Link>
                                        </Card>
                                </div>

                                {/* CENTER — build timeline */}
                                <div className="space-y-3" data-testid="bc-center">
                                        <Card title={activeBuild ? `Build #${activeBuild.build_number} · ${activeBuild.build_status}` : "No builds yet"}>
                                                {!activeBuild ? (
                                                        <div className="text-[13px] text-ink-dim text-center py-8">Tap <b>Start build</b> to spin up your AI engineering team.</div>
                                                ) : (
                                                        <div className="space-y-2">
                                                                {timeline.map((t, i) => (
                                                                        <div key={i} className="flex items-center gap-2.5 text-[13px]" data-testid={`bc-stage-${t.stage}`}>
                                                                                {t.stage === "complete" || timeline.length > i + 1 ? (
                                                                                        <Check className="w-4 h-4 text-tn-green shrink-0" />
                                                                                ) : (
                                                                                        <Loader2 className="w-4 h-4 animate-spin text-brand shrink-0" />
                                                                                )}
                                                                                <span className="text-ink-dim">{STAGE_LABELS[t.stage] || t.stage}</span>
                                                                                <span className="ml-auto text-[11px] text-ink-mute font-mono">{(t.by || "").slice(0,12)}</span>
                                                                        </div>
                                                                ))}
                                                                {activeBuild.build_status === "running" && (
                                                                        <div className="flex items-center gap-2 text-[13px] text-brand pt-2">
                                                                                <Clock className="w-4 h-4 animate-pulse" /> Working…
                                                                        </div>
                                                                )}
                                                                {activeBuild.build_status === "success" && (
                                                                        <div className="mt-3 pt-3 border-t border-hairline text-[13px]">
                                                                                <div className="flex items-center gap-3">
                                                                                        <Pill tone="green" size="sm">tests {activeBuild.tests_passed ? "passed" : "failed"}</Pill>
                                                                                        <Pill tone="green" size="sm">security ok</Pill>
                                                                                        <Pill tone="brand" size="sm">perf {activeBuild.performance_score}/100</Pill>
                                                                                </div>
                                                                        </div>
                                                                )}
                                                        </div>
                                                )}
                                        </Card>

                                        <Card title="Recent builds">
                                                {builds.length === 0 ? (
                                                        <div className="text-[12px] text-ink-mute">No builds yet.</div>
                                                ) : (
                                                        <div className="space-y-1.5 text-[12px]">
                                                                {builds.slice(0, 8).map((b) => (
                                                                        <button key={b.id} type="button" onClick={() => setActiveBuildId(b.id)} className={`w-full flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-white/5 ${b.id === activeBuildId ? "bg-white/[0.05]" : ""}`}>
                                                                                <span className="font-mono">#{b.build_number}</span>
                                                                                <Pill tone={b.build_status === "success" ? "green" : b.build_status === "running" ? "ai" : "red"} size="sm">{b.build_status}</Pill>
                                                                        </button>
                                                                ))}
                                                        </div>
                                                )}
                                        </Card>
                                </div>

                                {/* RIGHT — preview + PRs */}
                                <div className="space-y-3" data-testid="bc-right">
                                        <Card title="Live preview">
                                                {preview ? (
                                                        <>
                                                                <Pill tone="green" size="sm">{preview.status}</Pill>
                                                                <a
                                                                        href={preview.preview_url?.startsWith("http") ? preview.preview_url : `${window.location.origin}${preview.preview_url}`}
                                                                        target="_blank"
                                                                        rel="noopener noreferrer"
                                                                        className="mt-2 text-[12px] text-brand font-mono break-all flex items-start gap-1.5 hover:underline"
                                                                        data-testid="bc-preview-url"
                                                                >
                                                                        {preview.preview_url} <ExternalLink className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                                                                </a>
                                                        </>
                                                ) : (
                                                        <div className="text-[12px] text-ink-mute">No preview yet. Run a build to create one.</div>
                                                )}
                                        </Card>
                                        <Card title="GitHub">
                                                {github ? (
                                                        <>
                                                                <a href={github.repo_url} target="_blank" rel="noopener noreferrer" className="text-[12px] text-brand font-mono break-all hover:underline">{github.repo_url}</a>
                                                                <div className="text-[11px] text-ink-mute mt-1">Connected by {github.connected_by?.slice(0,8)}</div>
                                                        </>
                                                ) : (
                                                        <div className="text-[12px] text-ink-mute">Not connected. Visit GitHub settings to wire a repo.</div>
                                                )}
                                        </Card>
                                        <Card title="Pull requests">
                                                {prs.length === 0 ? (
                                                        <div className="text-[12px] text-ink-mute">No PRs yet.</div>
                                                ) : (
                                                        prs.slice(0, 4).map((pr) => (
                                                                <a key={pr.id} href={pr.pr_url} target="_blank" rel="noopener noreferrer" className="block py-1.5 text-[12px] hover:bg-white/5 rounded-lg px-1.5" data-testid={`bc-pr-${pr.pr_number}`}>
                                                                        <div className="font-semibold text-ink">#{pr.pr_number} {pr.title}</div>
                                                                        <div className="text-[10px] text-ink-mute font-mono mt-0.5">+{pr.additions} -{pr.deletions} · {pr.files_changed} files · {pr.status}</div>
                                                                </a>
                                                        ))
                                                )}
                                        </Card>
                                        <Card title="Execution mode">
                                                <div className="flex items-center gap-1.5 flex-wrap mb-2">
                                                        <Pill tone={preview ? "green" : "default"} size="sm">app {preview ? "running" : "idle"}</Pill>
                                                        <Pill tone="green" size="sm">db ok</Pill>
                                                        <Pill tone="green" size="sm">api 99.4%</Pill>
                                                </div>
                                                <div className="text-[11px] text-ink-mute leading-snug mb-3">
                                                        See the deployed app health pills, live log stream, and send feedback that turns into bugs automatically.
                                                </div>
                                                <Link
                                                        to={`/dev-os/projects/${projectId}/execution`}
                                                        data-testid="bc-open-execution"
                                                        className="w-full h-10 rounded-xl bg-brand text-black text-[13px] font-semibold flex items-center justify-center gap-2 hover:bg-brand-deep"
                                                >
                                                        <Activity className="w-4 h-4" /> Open execution view
                                                </Link>
                                        </Card>
                                </div>
                        </div>

                        <FileExplorerPanel
                                projectId={projectId}
                                previewUrl={preview?.preview_url}
                                refreshKey={fileRefreshKey}
                        />

                        <TalkToBuildBar
                                projectId={projectId}
                                onChanged={() => setFileRefreshKey((k) => k + 1)}
                        />
                </div>
        );
}

function Card({ title, children }) {
        return (
                <div className="rounded-2xl bg-surface p-4">
                        <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-mute mb-2.5">{title}</div>
                        {children}
                </div>
        );
}
