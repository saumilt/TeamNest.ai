import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, Github, Cloud, Box, Database, Triangle, Server, Activity, FileText, Layers, MessageSquare, Workflow, GitBranch, CheckCircle2, AlertTriangle, Mail, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import AppBar from "@/components/ui-v2/AppBar";
import Pill from "@/components/ui-v2/Pill";

const INTEGRATIONS = [
        { key: "github", name: "GitHub", icon: Github, category: "code", status: "connected", note: "Real PAT live · creates real PRs" },
        { key: "gitlab", name: "GitLab", icon: GitBranch, category: "code", status: "available" },
        { key: "bitbucket", name: "Bitbucket", icon: GitBranch, category: "code", status: "available" },
        { key: "vercel", name: "Vercel", icon: Triangle, category: "hosting", status: "connected", note: "Real token live · link & deploy" },
        { key: "netlify", name: "Netlify", icon: Cloud, category: "hosting", status: "connected", note: "Real token live · link & deploy" },
        { key: "render", name: "Render", icon: Cloud, category: "hosting", status: "available" },
        { key: "railway", name: "Railway", icon: Cloud, category: "hosting", status: "available" },
        { key: "supabase", name: "Supabase", icon: Database, category: "database", status: "available" },
        { key: "postgres", name: "PostgreSQL", icon: Database, category: "database", status: "available" },
        { key: "firebase", name: "Firebase", icon: Activity, category: "database", status: "available" },
        { key: "aws", name: "AWS", icon: Server, category: "cloud", status: "available" },
        { key: "azure", name: "Azure", icon: Cloud, category: "cloud", status: "available" },
        { key: "gcp", name: "Google Cloud", icon: Cloud, category: "cloud", status: "available" },
        { key: "mailgun", name: "Mailgun", icon: Mail, category: "comms", status: "connected", note: "teamnest.ai DNS verified" },
        { key: "sentry", name: "Sentry", icon: Activity, category: "ops", status: "available" },
        { key: "linear", name: "Linear", icon: Layers, category: "pm", status: "available" },
        { key: "figma", name: "Figma", icon: Box, category: "design", status: "available" },
        { key: "slack", name: "Slack", icon: MessageSquare, category: "comms", status: "available" },
        { key: "jira", name: "Jira", icon: Workflow, category: "pm", status: "available" },
];

const CATEGORIES = { code: "Code", hosting: "Hosting", database: "Database", cloud: "Cloud", ops: "Observability", pm: "Project mgmt", design: "Design", comms: "Comms" };

/** /dev-os/integrations — single-page catalog of Dev OS connectors. */
export default function Integrations() {
        const [status, setStatus] = useState(null);
        const [loading, setLoading] = useState(true);

        useEffect(() => {
                let cancelled = false;
                api.get("/integrations/status")
                        .then(({ data }) => { if (!cancelled) setStatus(data); })
                        .catch(() => { if (!cancelled) setStatus(null); })
                        .finally(() => { if (!cancelled) setLoading(false); });
                return () => { cancelled = true; };
        }, []);

        const groups = Object.keys(CATEGORIES).map((cat) => ({
                cat, label: CATEGORIES[cat], items: INTEGRATIONS.filter((i) => i.category === cat),
        }));
        return (
                <div className="min-h-[100dvh] bg-bg pb-24 md:pb-8 text-ink" data-testid="integrations-page">
                        <AppBar
                                left={
                                        <Link to="/dev-os" className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-white/5" data-testid="int-back">
                                                <ChevronLeft className="w-5 h-5" />
                                        </Link>
                                }
                                center={<div className="text-[15px] font-semibold">Integrations</div>}
                                right={null}
                        />
                        <div className="px-4 md:px-5 pt-4 max-w-3xl mx-auto space-y-5">
                                <LiveStatus loading={loading} status={status} />
                                <div className="text-[12px] text-ink-dim leading-snug">
                                        These connectors are placeholders — Dev OS surfaces their settings here so you can wire credentials when you&apos;re ready. Only GitHub is currently live (mocked PRs).
                                </div>
                                {groups.map((g) => (
                                        <div key={g.cat}>
                                                <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-mute mb-2 px-1">{g.label}</div>
                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                                        {g.items.map((it) => {
                                                                const Icon = it.icon;
                                                                const tone = it.status === "connected" ? "green" : "default";
                                                                return (
                                                                        <div key={it.key} data-testid={`int-${it.key}`} className="rounded-2xl bg-surface p-4 flex items-center gap-3">
                                                                                <div className="w-10 h-10 rounded-xl bg-ai-tint text-ai flex items-center justify-center shrink-0">
                                                                                        <Icon className="w-5 h-5" />
                                                                                </div>
                                                                                <div className="flex-1 min-w-0">
                                                                                        <div className="text-[14px] font-semibold">{it.name}</div>
                                                                                        {it.note && <div className="text-[11px] text-ink-mute mt-0.5">{it.note}</div>}
                                                                                </div>
                                                                                <Pill tone={tone} size="sm">{it.status}</Pill>
                                                                        </div>
                                                                );
                                                        })}
                                                </div>
                                        </div>
                                ))}
                        </div>
                </div>
        );
}


/** "Live connections" status banner — shows the real GitHub/Vercel account
 * the PAT belongs to plus the Mailgun domain DNS state. */
function LiveStatus({ loading, status }) {
        if (loading) {
                return (
                        <div className="rounded-2xl bg-surface p-4 flex items-center gap-2 text-[12px] text-ink-mute" data-testid="live-status-loading">
                                <Loader2 className="w-4 h-4 animate-spin" /> Checking live connections…
                        </div>
                );
        }
        if (!status) return null;
        return (
                <div className="rounded-2xl bg-surface p-4" data-testid="live-status-card">
                        <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-mute mb-3">
                                Live connections
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                                <ConnectionTile
                                        label="GitHub"
                                        icon={Github}
                                        ok={status.github?.ok}
                                        title={status.github?.login || "Not connected"}
                                        subtitle={status.github?.ok ? `PAT belongs to @${status.github.login}` : status.github?.reason}
                                        testid="live-status-github"
                                />
                                <ConnectionTile
                                        label="Vercel"
                                        icon={Triangle}
                                        ok={status.vercel?.ok}
                                        title={status.vercel?.username ? `@${status.vercel.username}` : "Not connected"}
                                        subtitle={status.vercel?.ok ? (status.vercel.name || status.vercel.email) : status.vercel?.reason}
                                        testid="live-status-vercel"
                                />
                                <ConnectionTile
                                        label="Netlify"
                                        icon={Cloud}
                                        ok={status.netlify?.ok}
                                        title={status.netlify?.full_name || status.netlify?.email || "Not connected"}
                                        subtitle={status.netlify?.ok ? `${status.netlify.site_count ?? 0} site${status.netlify.site_count === 1 ? "" : "s"}` : status.netlify?.reason}
                                        testid="live-status-netlify"
                                />
                                <ConnectionTile
                                        label="Mailgun"
                                        icon={Mail}
                                        ok={status.mailgun_domain?.ok && status.mailgun_domain.is_verified}
                                        title={status.mailgun_domain?.domain || "No domain"}
                                        subtitle={status.mailgun_domain?.ok
                                                ? `${status.mailgun_domain.state} · ${(status.mailgun_domain.records || []).filter(r => r.valid).length}/${(status.mailgun_domain.records || []).length} DNS records OK`
                                                : status.mailgun_domain?.reason}
                                        testid="live-status-mailgun"
                                />
                        </div>
                        {status.mailgun_domain?.records?.length > 0 && (
                                <div className="mt-3 grid grid-cols-2 md:grid-cols-5 gap-1.5" data-testid="mailgun-dns-records">
                                        {status.mailgun_domain.records.map((r, i) => (
                                                <div
                                                        key={i}
                                                        className={`px-2 py-1.5 rounded-md text-[10px] font-mono uppercase tracking-wider flex items-center gap-1 ${
                                                                r.valid ? "bg-tn-green/10 text-tn-green ring-1 ring-tn-green/20" : "bg-tn-red/10 text-tn-red ring-1 ring-tn-red/20"
                                                        }`}
                                                >
                                                        {r.valid ? <CheckCircle2 className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
                                                        {r.purpose}
                                                </div>
                                        ))}
                                </div>
                        )}
                </div>
        );
}

function ConnectionTile({ label, icon: Icon, ok, title, subtitle, testid }) {
        return (
                <div
                        data-testid={testid}
                        className={`rounded-xl p-3 ${ok ? "bg-tn-green/[0.06] ring-1 ring-tn-green/20" : "bg-bg/40 ring-1 ring-hairline"}`}
                >
                        <div className="flex items-center gap-2 mb-1">
                                <Icon className={`w-4 h-4 ${ok ? "text-tn-green" : "text-ink-mute"}`} />
                                <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-mute">{label}</div>
                                <div className="ml-auto">
                                        <Pill tone={ok ? "green" : "default"} size="sm">{ok ? "live" : "—"}</Pill>
                                </div>
                        </div>
                        <div className="text-[13px] font-semibold text-ink truncate">{title}</div>
                        <div className="text-[11px] text-ink-mute truncate" title={subtitle}>{subtitle || "—"}</div>
                </div>
        );
}
