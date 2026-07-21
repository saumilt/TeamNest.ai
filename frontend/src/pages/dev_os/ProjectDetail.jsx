import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import { ChevronLeft, Sparkles, GitPullRequest, ListTodo, FileText, Plus, Loader2, Check, X, Clock, ScanSearch, Bug, MessageSquareText, Brain, Tag } from "lucide-react";
import { api } from "@/lib/api";
import AppBar from "@/components/ui-v2/AppBar";
import Pill from "@/components/ui-v2/Pill";
import useDevOsPresence from "@/hooks/useDevOsPresence";
import PresenceLayer, { PresenceBubbles } from "@/components/dev_os/PresenceLayer";
import HostingPanel from "@/components/dev_os/HostingPanel";

const STATUSES = [
        { key: "backlog", label: "Backlog" },
        { key: "in_progress", label: "In progress" },
        { key: "in_review", label: "In review" },
        { key: "done", label: "Done" },
        { key: "deployed", label: "Deployed" },
];

const TABS = [
        { key: "plan", label: "Plan", icon: FileText },
        { key: "tasks", label: "Tasks", icon: ListTodo },
        { key: "proposals", label: "Proposals", icon: GitPullRequest },
        { key: "bugs", label: "Bugs", icon: Bug },
        { key: "comments", label: "Comments", icon: MessageSquareText },
        { key: "memory", label: "Memory", icon: Brain },
        { key: "releases", label: "Releases", icon: Tag },
];

/** /dev-os/projects/:projectId — plan summary + kanban + proposals tabs. */
export default function ProjectDetail() {
        const { projectId } = useParams();
        const [project, setProject] = useState(null);
        const [loading, setLoading] = useState(true);
        const [tab, setTab] = useState("plan");
        const [proposalOpen, setProposalOpen] = useState(false);
        const [scanning, setScanning] = useState(false);
        const { peers, emitCursor, setTab: emitTab } = useDevOsPresence(projectId);

        useEffect(() => { emitTab(tab); }, [tab, emitTab]);

        const load = useCallback(async () => {
                try {
                        const { data } = await api.get(`/dev-projects/${projectId}`);
                        setProject(data);
                } catch (err) {
                        toast.error(err?.response?.data?.detail || "Could not load project");
                } finally {
                        setLoading(false);
                }
        }, [projectId]);

        useEffect(() => {
                load();
        }, [load]);

        const runScan = async () => {
                if (!project?.related_chat_id) {
                        toast.error("This project isn't linked to a chat. Use 'Import from chat' on a new project to enable scanning.");
                        return;
                }
                setScanning(true);
                try {
                        const { data } = await api.post(`/dev-projects/${projectId}/scan`, {
                                create_proposals: true,
                                lookback_messages: 200,
                        });
                        const made = (data.created_proposals || []).length;
                        if (data.signals_found === 0) {
                                toast.info("No improvement signals found in the linked chat.");
                        } else {
                                toast.success(`Scanned ${data.total_scanned} messages · ${data.signals_found} signals · ${made} proposals drafted`);
                        }
                        setTab("proposals");
                        load();
                } catch (err) {
                        if (!err.isCreditLimit) toast.error(err?.response?.data?.detail || "Scan failed");
                } finally {
                        setScanning(false);
                }
        };

        if (loading) {
                return (
                        <div className="min-h-[100dvh] bg-bg text-ink flex items-center justify-center">
                                <Loader2 className="w-6 h-6 animate-spin text-ink-dim" />
                        </div>
                );
        }
        if (!project) return null;

        return (
                <div className="min-h-[100dvh] bg-bg pb-24 md:pb-8 text-ink" data-testid="project-detail">
                        <AppBar
                                left={
                                        <Link to="/dev-os" className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-white/5" data-testid="pd-back">
                                                <ChevronLeft className="w-5 h-5" />
                                        </Link>
                                }
                                center={
                                        <div className="flex items-center gap-2">
                                                <div className="text-[15px] font-semibold truncate max-w-[160px]">{project.name}</div>
                                                <PresenceBubbles peers={peers} />
                                        </div>
                                }
                                right={
                                        <div className="flex items-center gap-1.5">
                                                <Link
                                                        to={`/dev-os/projects/${projectId}/studio`}
                                                        data-testid="pd-studio"
                                                        className="h-9 px-4 rounded-full bg-amber-300 hover:bg-amber-200 text-black text-[13px] font-semibold flex items-center gap-1.5 active:scale-[0.98]"
                                                >
                                                        ⚡ Open Studio
                                                </Link>
                                                <Link
                                                        to={`/dev-os/projects/${projectId}/console`}
                                                        data-testid="pd-console"
                                                        className="h-9 px-3 rounded-full bg-surface text-ink-dim text-[13px] font-semibold flex items-center gap-1.5 hover:bg-white/[0.06]"
                                                >
                                                        Console
                                                </Link>
                                                <button
                                                        type="button"
                                                        data-testid="pd-scan"
                                                        disabled={scanning}
                                                        onClick={runScan}
                                                        title={project?.related_chat_id ? "Scan linked chat for improvement signals" : "Link a chat to enable scanning"}
                                                        className="h-9 px-3 rounded-full bg-surface text-ink-dim text-[13px] font-semibold flex items-center gap-1.5 hover:bg-white/[0.06] disabled:opacity-50"
                                                >
                                                        {scanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <ScanSearch className="w-4 h-4" />}
                                                        Scan
                                                </button>
                                                <button
                                                        type="button"
                                                        data-testid="pd-new-proposal"
                                                        onClick={() => setProposalOpen(true)}
                                                        className="h-9 px-3 rounded-full bg-ai text-black text-[13px] font-semibold flex items-center gap-1.5 hover:opacity-90"
                                                >
                                                        <Sparkles className="w-4 h-4" /> Propose
                                                </button>
                                        </div>
                                }
                        />

                        {/* Header card */}
                        <div className="px-4 md:px-5 pt-4">
                                <div className="rounded-2xl bg-surface p-4">
                                        <div className="flex items-start gap-3">
                                                <div className="flex-1 min-w-0">
                                                        <div className="text-[18px] font-bold">{project.name}</div>
                                                        <div className="text-[13px] text-ink-dim mt-1">{project.description || project.problem}</div>
                                                </div>
                                                <div className="flex flex-col items-end gap-1.5 shrink-0">
                                                        <Pill tone={project.health === "stable" ? "green" : "ai"} size="sm">{project.status || "draft"}</Pill>
                                                        <span className="text-[11px] text-ink-mute font-mono">{project.version}</span>
                                                </div>
                                        </div>
                                </div>
                        </div>

                        {/* Tabs */}
                        <div className="px-4 md:px-5 mt-4 flex gap-1.5">
                                {TABS.map((t) => {
                                        const active = tab === t.key;
                                        const Icon = t.icon;
                                        return (
                                                <button
                                                        key={t.key}
                                                        type="button"
                                                        data-testid={`pd-tab-${t.key}`}
                                                        onClick={() => setTab(t.key)}
                                                        className={`h-9 px-3.5 rounded-full text-[13px] font-semibold flex items-center gap-1.5 transition-colors ${
                                                                active ? "bg-brand text-black" : "bg-surface text-ink-dim hover:bg-white/5"
                                                        }`}
                                                >
                                                        <Icon className="w-4 h-4" /> {t.label}
                                                </button>
                                        );
                                })}
                        </div>

                        <div className="px-4 md:px-5 mt-4">
                                <PresenceLayer
                                        peers={peers}
                                        tab={tab}
                                        onMove={(x, y) => emitCursor(x, y, tab)}
                                >
                                        {tab === "plan" && (
                                                <div className="space-y-4">
                                                        <PlanView plan={project.plan || {}} />
                                                        <HostingPanel projectId={projectId} />
                                                </div>
                                        )}
                                        {tab === "tasks" && <TaskKanban tasks={project.tasks || []} onChange={load} />}
                                        {tab === "proposals" && <ProposalsList proposals={project.proposals || []} onDecide={load} />}
                                        {tab === "bugs" && <BugsTab projectId={projectId} />}
                                        {tab === "comments" && <CommentsTab projectId={projectId} />}
                                        {tab === "memory" && <MemoryTab projectId={projectId} />}
                                        {tab === "releases" && <ReleasesTab projectId={projectId} />}
                                </PresenceLayer>
                        </div>

                        {proposalOpen && (
                                <ProposalDialog
                                        projectId={project.id}
                                        onClose={() => setProposalOpen(false)}
                                        onCreated={() => {
                                                setProposalOpen(false);
                                                setTab("proposals");
                                                load();
                                        }}
                                />
                        )}
                </div>
        );
}

// ─── Plan tab ─────────────────────────────────────────────────────────────
function PlanView({ plan }) {        if (!plan || Object.keys(plan).length === 0) {
                return <div className="text-center text-ink-dim text-[13px] py-8">No plan yet.</div>;
        }
        const stack = plan.technical_stack || {};
        return (
                <div className="space-y-4">
                        {plan.product_brief && (
                                <PlanCard title="Product brief">
                                        <p className="text-[13px] text-ink-dim leading-relaxed whitespace-pre-wrap">{plan.product_brief}</p>
                                </PlanCard>
                        )}
                        {(plan.user_roles?.length || 0) > 0 && (
                                <PlanCard title="User roles">
                                        <div className="flex flex-wrap gap-1.5">
                                                {plan.user_roles.map((r) => <Pill key={r} size="sm">{r}</Pill>)}
                                        </div>
                                </PlanCard>
                        )}
                        {(plan.mvp_modules?.length || 0) > 0 && (
                                <PlanCard title="MVP modules">
                                        <ul className="space-y-2">
                                                {plan.mvp_modules.map((m, i) => (
                                                        <li key={i} className="text-[13px]">
                                                                <div className="font-semibold text-ink">{m.name}</div>
                                                                <div className="text-ink-dim mt-0.5">{m.description}</div>
                                                        </li>
                                                ))}
                                        </ul>
                                </PlanCard>
                        )}
                        {Object.keys(stack).length > 0 && (
                                <PlanCard title="Technical stack">
                                        <div className="grid grid-cols-2 gap-2 text-[13px]">
                                                {Object.entries(stack).map(([k, v]) => (
                                                        <div key={k}>
                                                                <div className="text-[11px] uppercase tracking-wider text-ink-mute">{k}</div>
                                                                <div className="text-ink">{String(v)}</div>
                                                        </div>
                                                ))}
                                        </div>
                                </PlanCard>
                        )}
                        {(plan.database_entities?.length || 0) > 0 && (
                                <PlanCard title="Database entities">
                                        <div className="space-y-2 text-[13px]">
                                                {plan.database_entities.map((e, i) => (
                                                        <div key={i}>
                                                                <div className="font-semibold text-ink">{e.name}</div>
                                                                <div className="text-ink-dim font-mono text-[11px] mt-0.5">{(e.fields || []).join(" · ")}</div>
                                                        </div>
                                                ))}
                                        </div>
                                </PlanCard>
                        )}
                        {(plan.qa_checklist?.length || 0) > 0 && (
                                <PlanCard title="QA checklist">
                                        <ul className="space-y-1.5 text-[13px] text-ink-dim list-disc list-inside">
                                                {plan.qa_checklist.map((c, i) => <li key={i}>{c}</li>)}
                                        </ul>
                                </PlanCard>
                        )}
                        {(plan.security_checklist?.length || 0) > 0 && (
                                <PlanCard title="Security checklist">
                                        <ul className="space-y-1.5 text-[13px] text-ink-dim list-disc list-inside">
                                                {plan.security_checklist.map((c, i) => <li key={i}>{c}</li>)}
                                        </ul>
                                </PlanCard>
                        )}
                        {(plan.deployment_plan?.length || 0) > 0 && (
                                <PlanCard title="Deployment plan">
                                        <ol className="space-y-1.5 text-[13px] text-ink-dim list-decimal list-inside">
                                                {plan.deployment_plan.map((s, i) => <li key={i}>{s}</li>)}
                                        </ol>
                                </PlanCard>
                        )}
                        {(plan.success_metrics?.length || 0) > 0 && (
                                <PlanCard title="Success metrics">
                                        <div className="flex flex-wrap gap-1.5">
                                                {plan.success_metrics.map((m) => <Pill key={m} tone="brand" size="sm">{m}</Pill>)}
                                        </div>
                                </PlanCard>
                        )}
                </div>
        );
}

function PlanCard({ title, children }) {
        return (
                <div className="rounded-2xl bg-surface p-4">
                        <div className="text-[12px] font-semibold uppercase tracking-wider text-ink-mute mb-3">{title}</div>
                        {children}
                </div>
        );
}

// ─── Tasks tab (kanban) ───────────────────────────────────────────────────
function TaskKanban({ tasks, onChange }) {
        const grouped = useMemo(() => {
                const m = {};
                STATUSES.forEach((s) => (m[s.key] = []));
                (tasks || []).forEach((t) => {
                        const k = m[t.status] ? t.status : "backlog";
                        m[k].push(t);
                });
                return m;
        }, [tasks]);

        const cycle = async (task) => {
                const idx = STATUSES.findIndex((s) => s.key === task.status);
                const next = STATUSES[(idx + 1) % STATUSES.length].key;
                try {
                        await api.patch(`/dev-tasks/${task.id}`, { status: next });
                        onChange();
                } catch {
                        toast.error("Could not update task");
                }
        };

        if (!tasks || tasks.length === 0) {
                return <div className="text-center text-ink-dim text-[13px] py-8">No tasks yet — the Product CEO will seed a backlog when you create a project.</div>;
        }

        return (
                <div className="flex gap-3 overflow-x-auto -mx-4 px-4 md:-mx-5 md:px-5 pb-2" data-testid="task-kanban">
                        {STATUSES.map((s) => (
                                <div key={s.key} className="w-[260px] shrink-0">
                                        <div className="flex items-center justify-between mb-2 px-1">
                                                <div className="text-[12px] font-semibold uppercase tracking-wider text-ink-mute">{s.label}</div>
                                                <span className="text-[11px] text-ink-mute">{grouped[s.key].length}</span>
                                        </div>
                                        <div className="space-y-2">
                                                {grouped[s.key].map((t) => (
                                                        <button
                                                                key={t.id}
                                                                type="button"
                                                                data-testid={`task-${t.id}`}
                                                                onClick={() => cycle(t)}
                                                                title="Tap to advance status"
                                                                className="w-full text-left rounded-xl bg-surface p-3 hover:bg-white/5 active:scale-[0.99] transition"
                                                        >
                                                                <div className="text-[13px] font-semibold text-ink">{t.title}</div>
                                                                <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                                                                        {t.owning_agent && <Pill tone="ai" size="sm">{t.owning_agent}</Pill>}
                                                                        <Pill tone={t.priority === "high" ? "red" : "default"} size="sm">{t.priority || "medium"}</Pill>
                                                                        <Pill tone={t.risk_level === "high" ? "red" : t.risk_level === "medium" ? "ai" : "green"} size="sm">{t.risk_level || "low"} risk</Pill>
                                                                </div>
                                                        </button>
                                                ))}
                                                {grouped[s.key].length === 0 && (
                                                        <div className="rounded-xl border border-dashed border-hairline p-3 text-[12px] text-ink-mute text-center">empty</div>
                                                )}
                                        </div>
                                </div>
                        ))}
                </div>
        );
}

// ─── Proposals tab ────────────────────────────────────────────────────────
function ProposalsList({ proposals, onDecide }) {
        if (!proposals || proposals.length === 0) {
                return (
                        <div className="text-center text-ink-dim text-[13px] py-8">
                                No proposals yet. Tap <b>Propose</b> to ask an AI agent to suggest an improvement.
                        </div>
                );
        }
        return (
                <div className="space-y-3" data-testid="proposals-list">
                        {proposals.map((p) => (
                                <ProposalRow key={p.id} proposal={p} onDecide={onDecide} />
                        ))}
                </div>
        );
}

function ProposalRow({ proposal, onDecide }) {
        const [busy, setBusy] = useState(false);
        const decide = async (decision) => {
                setBusy(true);
                try {
                        await api.post(`/improvement-proposals/${proposal.id}/decide`, { decision, reviewer_notes: "" });
                        toast.success(decision === "approve" ? "Proposal approved" : "Proposal updated");
                        onDecide();
                } catch (err) {
                        toast.error(err?.response?.data?.detail || "Could not update");
                } finally {
                        setBusy(false);
                }
        };

        const statusTone = {
                pending: "ai",
                in_review: "default",
                approved: "green",
                rejected: "red",
                deployed: "green",
        }[proposal.status] || "default";

        return (
                <div className="rounded-2xl bg-surface p-4">
                        <div className="flex items-start gap-2">
                                <div className="flex-1 min-w-0">
                                        <div className="text-[14px] font-semibold">{proposal.title}</div>
                                        <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                                                <Pill tone={statusTone} size="sm">{proposal.status}</Pill>
                                                <Pill tone="ai" size="sm">{proposal.proposal_type}</Pill>
                                                <Pill tone={proposal.risk_level === "high" ? "red" : proposal.risk_level === "medium" ? "ai" : "green"} size="sm">{proposal.risk_level} risk</Pill>
                                        </div>
                                </div>
                                <span className="text-[11px] text-ink-mute font-mono shrink-0">{proposal.estimated_credits || 0} cr</span>
                        </div>
                        <div className="mt-3 space-y-2 text-[13px]">
                                <div>
                                        <div className="text-[11px] uppercase tracking-wider text-ink-mute">Problem</div>
                                        <div className="text-ink-dim">{proposal.current_problem}</div>
                                </div>
                                <div>
                                        <div className="text-[11px] uppercase tracking-wider text-ink-mute">Proposed change</div>
                                        <div className="text-ink-dim">{proposal.proposed_change}</div>
                                </div>
                                <div>
                                        <div className="text-[11px] uppercase tracking-wider text-ink-mute">Expected impact</div>
                                        <div className="text-ink-dim">{proposal.expected_impact}</div>
                                </div>
                        </div>
                        {proposal.status === "pending" && (
                                <div className="mt-3 flex gap-2">
                                        <button
                                                type="button"
                                                data-testid={`approve-${proposal.id}`}
                                                disabled={busy}
                                                onClick={() => decide("approve")}
                                                className="h-9 px-3.5 rounded-full bg-tn-green/15 text-tn-green text-[12px] font-semibold flex items-center gap-1.5 hover:bg-tn-green/25 disabled:opacity-50"
                                        >
                                                <Check className="w-3.5 h-3.5" /> Approve
                                        </button>
                                        <button
                                                type="button"
                                                data-testid={`reject-${proposal.id}`}
                                                disabled={busy}
                                                onClick={() => decide("reject")}
                                                className="h-9 px-3.5 rounded-full bg-tn-red/15 text-tn-red text-[12px] font-semibold flex items-center gap-1.5 hover:bg-tn-red/25 disabled:opacity-50"
                                        >
                                                <X className="w-3.5 h-3.5" /> Reject
                                        </button>
                                        <button
                                                type="button"
                                                data-testid={`request-${proposal.id}`}
                                                disabled={busy}
                                                onClick={() => decide("request_changes")}
                                                className="h-9 px-3.5 rounded-full bg-surface-2 text-ink-dim text-[12px] font-semibold flex items-center gap-1.5 hover:bg-white/10 disabled:opacity-50"
                                        >
                                                <Clock className="w-3.5 h-3.5" /> Request changes
                                        </button>
                                </div>
                        )}
                </div>
        );
}

function ProposalDialog({ projectId, onClose, onCreated }) {
        const [signal, setSignal] = useState("");
        const [submitting, setSubmitting] = useState(false);

        const submit = async (e) => {
                e.preventDefault();
                if (!signal.trim()) {
                        toast.error("Describe the signal");
                        return;
                }
                setSubmitting(true);
                try {
                        await api.post("/improvement-proposals", { project_id: projectId, signal: signal.trim(), role: "reviewer" });
                        toast.success("Reviewer agent drafted a proposal");
                        onCreated();
                } catch (err) {
                        toast.error(err?.response?.data?.detail || "Could not create proposal");
                        setSubmitting(false);
                }
        };

        return (
                <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end md:items-center justify-center p-0 md:p-6" onClick={onClose} data-testid="proposal-dialog">
                        <form
                                onClick={(e) => e.stopPropagation()}
                                onSubmit={submit}
                                className="w-full md:max-w-lg rounded-t-3xl md:rounded-3xl bg-surface p-5 border border-hairline space-y-4"
                        >
                                <div className="flex items-center gap-2">
                                        <div className="w-10 h-10 rounded-xl bg-ai-tint text-ai flex items-center justify-center">
                                                <Sparkles className="w-5 h-5" />
                                        </div>
                                        <div>
                                                <div className="text-[15px] font-bold">New improvement proposal</div>
                                                <div className="text-[12px] text-ink-dim">Reviewer Agent · Claude Sonnet 4.5</div>
                                        </div>
                                </div>
                                <label className="block">
                                        <div className="text-[12px] text-ink-dim mb-1.5">What signal are you reacting to?</div>
                                        <textarea
                                                data-testid="proposal-signal"
                                                value={signal}
                                                onChange={(e) => setSignal(e.target.value)}
                                                rows={4}
                                                placeholder="e.g. 3 customers in last week reported the onboarding flow is confusing. Bounce rate on /signup is 60%."
                                                className="w-full px-3.5 py-2.5 rounded-xl bg-bg border border-hairline text-ink text-[14px] resize-none focus:outline-none focus:ring-2 focus:ring-ai/40 focus:border-ai"
                                        />
                                </label>
                                <div className="flex gap-2">
                                        <button
                                                type="button"
                                                onClick={onClose}
                                                className="flex-1 h-12 rounded-2xl bg-surface-2 text-ink-dim font-semibold"
                                                data-testid="proposal-cancel"
                                        >
                                                Cancel
                                        </button>
                                        <button
                                                type="submit"
                                                disabled={submitting}
                                                data-testid="proposal-submit"
                                                className="flex-1 h-12 rounded-2xl bg-ai text-black font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
                                        >
                                                {submitting ? (
                                                        <>
                                                                <Loader2 className="w-4 h-4 animate-spin" /> Drafting…
                                                        </>
                                                ) : (
                                                        <>
                                                                <Plus className="w-4 h-4" /> Generate
                                                        </>
                                                )}
                                        </button>
                                </div>
                        </form>
                </div>
        );
}

// ─── Phase 3b tabs ────────────────────────────────────────────────────────
function BugsTab({ projectId }) {
        const [bugs, setBugs] = useState([]);
        const [open, setOpen] = useState(false);
        const load = useCallback(() => api.get(`/dev-projects/${projectId}/bugs`).then((r) => setBugs(r.data.bugs || [])).catch(() => {}), [projectId]);
        useEffect(() => { load(); }, [load]);
        const advance = async (id) => { try { await api.post(`/dev-bugs/${id}/advance`, {}); load(); } catch { toast.error("Could not advance"); } };
        return (
                <div className="space-y-3" data-testid="bugs-tab">
                        <button data-testid="bugs-new" onClick={() => setOpen(true)} className="h-9 px-3 rounded-full bg-tn-red/15 text-tn-red text-[13px] font-semibold flex items-center gap-1.5 hover:bg-tn-red/25">
                                <Plus className="w-4 h-4" /> Report bug
                        </button>
                        {bugs.length === 0 ? <div className="text-ink-dim text-[13px] text-center py-8">No bugs reported yet.</div>
                        : bugs.map((b) => (
                                <div key={b.id} data-testid={`bug-${b.id}`} className="rounded-2xl bg-surface p-4">
                                        <div className="flex items-start gap-2">
                                                <div className="flex-1 min-w-0">
                                                        <div className="text-[14px] font-semibold">{b.title}</div>
                                                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                                                                <Pill tone={b.severity === "critical" || b.severity === "high" ? "red" : "default"} size="sm">{b.severity}</Pill>
                                                                <Pill tone="ai" size="sm">{b.status}</Pill>
                                                                <Pill tone="brand" size="sm">@{b.assigned_agent}</Pill>
                                                        </div>
                                                </div>
                                                {b.status !== "closed" && (
                                                        <button onClick={() => advance(b.id)} data-testid={`bug-advance-${b.id}`} className="h-8 px-2.5 rounded-full bg-surface-2 text-ink-dim text-[12px] hover:bg-white/10">Advance</button>
                                                )}
                                        </div>
                                        {b.description && <div className="text-[13px] text-ink-dim mt-2">{b.description}</div>}
                                        {b.steps_to_reproduce && <div className="mt-2 text-[12px] text-ink-mute"><span className="uppercase tracking-wider mr-1">Steps:</span>{b.steps_to_reproduce.slice(0, 200)}</div>}
                                        <div className="mt-3 flex items-center gap-1.5 flex-wrap">
                                                {(b.timeline || []).map((t, i) => <Pill key={i} size="sm">{t.event}</Pill>)}
                                        </div>
                                </div>
                        ))}
                        {open && <BugDialog projectId={projectId} onClose={() => setOpen(false)} onCreated={() => { setOpen(false); load(); }} />}
                </div>
        );
}

function BugDialog({ projectId, onClose, onCreated }) {
        const [f, setF] = useState({ title: "", description: "", steps: "", severity: "medium", affected_screen: "" });
        const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
        const submit = async (e) => {
                e.preventDefault();
                if (!f.title.trim()) { toast.error("Title required"); return; }
                try { await api.post(`/dev-projects/${projectId}/bugs`, f); toast.success("Bug reported"); onCreated(); }
                catch (err) { toast.error(err?.response?.data?.detail || "Failed"); }
        };
        return (
                <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end md:items-center justify-center p-0 md:p-6" onClick={onClose} data-testid="bug-dialog">
                        <form onClick={(e) => e.stopPropagation()} onSubmit={submit} className="w-full md:max-w-lg rounded-t-3xl md:rounded-3xl bg-surface p-5 border border-hairline space-y-3">
                                <div className="text-[15px] font-bold">Report a bug</div>
                                <input data-testid="bug-title" value={f.title} onChange={set("title")} placeholder="Bug title" className="w-full h-11 px-3.5 rounded-xl bg-bg border border-hairline text-[14px]" />
                                <input data-testid="bug-screen" value={f.affected_screen} onChange={set("affected_screen")} placeholder="Affected screen (e.g. /reports/royalty)" className="w-full h-11 px-3.5 rounded-xl bg-bg border border-hairline text-[14px]" />
                                <textarea data-testid="bug-desc" value={f.description} onChange={set("description")} placeholder="Description" rows={2} className="w-full px-3.5 py-2 rounded-xl bg-bg border border-hairline text-[14px] resize-none" />
                                <textarea data-testid="bug-steps" value={f.steps} onChange={set("steps")} placeholder="Steps to reproduce&#10;1. ...&#10;2. ..." rows={3} className="w-full px-3.5 py-2 rounded-xl bg-bg border border-hairline text-[14px] resize-none" />
                                <select data-testid="bug-sev" value={f.severity} onChange={set("severity")} className="w-full h-11 px-3.5 rounded-xl bg-bg border border-hairline text-[14px]">
                                        <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option>
                                </select>
                                <div className="flex gap-2">
                                        <button type="button" onClick={onClose} className="flex-1 h-12 rounded-2xl bg-surface-2 text-ink-dim font-semibold">Cancel</button>
                                        <button type="submit" data-testid="bug-submit" className="flex-1 h-12 rounded-2xl bg-tn-red text-white font-semibold">Report</button>
                                </div>
                        </form>
                </div>
        );
}

function CommentsTab({ projectId }) {
        const [rows, setRows] = useState([]);
        const [text, setText] = useState("");
        const [screen, setScreen] = useState("");
        const load = useCallback(() => api.get(`/dev-projects/${projectId}/preview-comments`).then((r) => setRows(r.data.comments || [])).catch(() => {}), [projectId]);
        useEffect(() => { load(); }, [load]);
        const add = async (e) => {
                e.preventDefault();
                if (!text.trim()) return;
                try { await api.post(`/dev-projects/${projectId}/preview-comments`, { screen_name: screen, comment: text }); setText(""); setScreen(""); load(); } catch { toast.error("Failed"); }
        };
        const toBug = async (id) => { try { await api.post(`/dev-preview-comments/${id}/convert-to-bug`, {}); toast.success("Converted to bug"); load(); } catch { toast.error("Failed"); } };
        return (
                <div className="space-y-3" data-testid="comments-tab">
                        <form onSubmit={add} className="rounded-2xl bg-surface p-3 space-y-2">
                                <input data-testid="comment-screen" value={screen} onChange={(e) => setScreen(e.target.value)} placeholder="Screen name (optional)" className="w-full h-10 px-3 rounded-xl bg-bg border border-hairline text-[13px]" />
                                <textarea data-testid="comment-text" value={text} onChange={(e) => setText(e.target.value)} placeholder="Leave a comment on the preview…" rows={2} className="w-full px-3 py-2 rounded-xl bg-bg border border-hairline text-[13px] resize-none" />
                                <button type="submit" data-testid="comment-submit" className="h-9 px-3 rounded-full bg-brand text-black text-[13px] font-semibold">Post</button>
                        </form>
                        {rows.length === 0 ? <div className="text-ink-dim text-[13px] text-center py-6">No comments yet.</div>
                        : rows.map((c) => (
                                <div key={c.id} className="rounded-2xl bg-surface p-3 flex items-start gap-2">
                                        <div className="flex-1 min-w-0">
                                                {c.screen_name && <div className="text-[11px] text-ink-mute font-mono">{c.screen_name}</div>}
                                                <div className="text-[13px]">{c.comment}</div>
                                                <div className="flex gap-1.5 mt-1.5">
                                                        {c.resolved && <Pill tone="green" size="sm">resolved</Pill>}
                                                        {c.converted_to_bug_id && <Pill tone="ai" size="sm">bug</Pill>}
                                                </div>
                                        </div>
                                        {!c.converted_to_bug_id && (
                                                <button onClick={() => toBug(c.id)} data-testid={`comment-to-bug-${c.id}`} className="text-[11px] text-tn-red font-semibold hover:underline">→ bug</button>
                                        )}
                                </div>
                        ))}
                </div>
        );
}

function MemoryTab({ projectId }) {
        const [items, setItems] = useState([]);
        const [note, setNote] = useState("");
        const [cat, setCat] = useState("product");
        const load = useCallback(() => api.get(`/dev-projects/${projectId}/memory`).then((r) => setItems(r.data.items || [])).catch(() => {}), [projectId]);
        useEffect(() => { load(); }, [load]);
        const add = async (e) => {
                e.preventDefault();
                if (!note.trim()) return;
                try { await api.post(`/dev-projects/${projectId}/memory`, { category: cat, note }); setNote(""); load(); } catch { toast.error("Failed"); }
        };
        const cats = ["product","technical","ui","business","user_feedback","bugs","patterns","roadmap","security","deployment","stack"];
        return (
                <div className="space-y-3" data-testid="memory-tab">
                        <form onSubmit={add} className="rounded-2xl bg-surface p-3 space-y-2">
                                <select data-testid="memory-cat" value={cat} onChange={(e) => setCat(e.target.value)} className="w-full h-10 px-3 rounded-xl bg-bg border border-hairline text-[13px]">
                                        {cats.map((c) => <option key={c} value={c}>{c}</option>)}
                                </select>
                                <textarea data-testid="memory-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Franchisees prefer CSV upload over manual entry" rows={2} className="w-full px-3 py-2 rounded-xl bg-bg border border-hairline text-[13px] resize-none" />
                                <button type="submit" data-testid="memory-submit" className="h-9 px-3 rounded-full bg-brand text-black text-[13px] font-semibold">Save memory</button>
                        </form>
                        {items.length === 0 ? <div className="text-ink-dim text-[13px] text-center py-6">No memory yet.</div>
                        : items.map((m) => (
                                <div key={m.id} className="rounded-2xl bg-surface p-3" data-testid={`memory-${m.id}`}>
                                        <Pill tone="ai" size="sm">{m.category}</Pill>
                                        <div className="text-[13px] mt-1.5">{m.note}</div>
                                </div>
                        ))}
                </div>
        );
}

function ReleasesTab({ projectId }) {
        const [rows, setRows] = useState([]);
        const [version, setVersion] = useState("v0.1.0");
        const [busy, setBusy] = useState(false);
        const load = useCallback(() => api.get(`/dev-projects/${projectId}/release-notes`).then((r) => setRows(r.data.releases || [])).catch(() => {}), [projectId]);
        useEffect(() => { load(); }, [load]);
        const generate = async () => {
                setBusy(true);
                try { await api.post(`/dev-projects/${projectId}/release-notes`, { version }); toast.success(`Released ${version}`); load(); }
                catch (err) { toast.error(err?.response?.data?.detail || "Failed"); }
                finally { setBusy(false); }
        };
        return (
                <div className="space-y-3" data-testid="releases-tab">
                        <div className="flex gap-2 rounded-2xl bg-surface p-3">
                                <input data-testid="release-version" value={version} onChange={(e) => setVersion(e.target.value)} placeholder="v0.5.0" className="flex-1 h-10 px-3 rounded-xl bg-bg border border-hairline text-[13px] font-mono" />
                                <button onClick={generate} disabled={busy} data-testid="release-generate" className="h-10 px-4 rounded-xl bg-brand text-black text-[13px] font-semibold disabled:opacity-60">
                                        {busy ? "Drafting…" : "Generate"}
                                </button>
                        </div>
                        {rows.length === 0 ? <div className="text-ink-dim text-[13px] text-center py-6">No releases yet.</div>
                        : rows.map((r) => (
                                <div key={r.id} className="rounded-2xl bg-surface p-4">
                                        <div className="flex items-center gap-2">
                                                <Tag className="w-4 h-4 text-brand" />
                                                <div className="font-mono font-semibold">{r.version}</div>
                                                <span className="ml-auto text-[11px] text-ink-mute">{(r.created_at || "").slice(0, 10)}</span>
                                        </div>
                                        <pre className="mt-2 text-[12px] text-ink-dim whitespace-pre-wrap font-sans">{r.notes_md}</pre>
                                </div>
                        ))}
                </div>
        );
}


// Named re-exports for DevWorkspacePane embedded use.
export { PlanView, TaskKanban, BugsTab, MemoryTab };
