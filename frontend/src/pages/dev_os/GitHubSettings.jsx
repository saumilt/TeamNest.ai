import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { ChevronLeft, Github, Loader2, Link2, Unlink, Check } from "lucide-react";
import { api } from "@/lib/api";
import AppBar from "@/components/ui-v2/AppBar";
import Pill from "@/components/ui-v2/Pill";

/** /dev-os/github — workspace-level GitHub connection (mocked). */
export default function GitHubSettings() {
        const [conn, setConn] = useState(null);
        const [loading, setLoading] = useState(true);
        const [org, setOrg] = useState("");
        const [repo, setRepo] = useState("");
        const [saving, setSaving] = useState(false);

        const load = async () => {
                try {
                        const { data } = await api.get("/dev-os/github");
                        setConn(data?.status === "connected" ? data : null);
                } catch {
                        /* noop */
                } finally { setLoading(false); }
        };
        useEffect(() => { load(); }, []);

        const connect = async (e) => {
                e?.preventDefault?.();
                if (!org.trim() || !repo.trim()) {
                        toast.error("Org and repo are required");
                        return;
                }
                setSaving(true);
                try {
                        await api.post("/dev-os/github/connect", { org: org.trim(), repo: repo.trim() });
                        toast.success(`Connected · ${org}/${repo}`);
                        setOrg(""); setRepo("");
                        await load();
                } catch (err) {
                        toast.error(err?.response?.data?.detail || "Could not connect");
                } finally { setSaving(false); }
        };

        const disconnect = async () => {
                if (!window.confirm("Disconnect GitHub? Existing PRs stay; new exports will be blocked.")) return;
                try {
                        await api.delete("/dev-os/github");
                        toast.success("Disconnected");
                        await load();
                } catch (err) {
                        toast.error(err?.response?.data?.detail || "Could not disconnect");
                }
        };

        return (
                <div className="min-h-[100dvh] bg-bg pb-24 md:pb-8 text-ink" data-testid="github-settings">
                        <AppBar
                                left={
                                        <Link to="/dev-os" className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-white/5" data-testid="gh-back">
                                                <ChevronLeft className="w-5 h-5" />
                                        </Link>
                                }
                                center={<div className="text-[15px] font-semibold">GitHub</div>}
                                right={null}
                        />

                        <div className="px-4 md:px-5 pt-4 max-w-xl mx-auto space-y-4">
                                <div className="rounded-2xl bg-ai-tint/60 border border-ai/20 p-4 flex items-start gap-3">
                                        <Github className="w-5 h-5 text-ai shrink-0 mt-0.5" />
                                        <div className="text-[13px] text-ink leading-snug">
                                                Connect a repo so the Reviewer agent can draft PRs for approved improvements. This connection is currently <b>mocked</b> — Dev OS prepares the PR but does NOT push real commits.
                                        </div>
                                </div>

                                {loading ? (
                                        <div className="rounded-2xl bg-surface p-6 text-center text-ink-dim"><Loader2 className="w-5 h-5 animate-spin inline" /></div>
                                ) : conn ? (
                                        <div className="rounded-2xl bg-surface p-5" data-testid="gh-connected">
                                                <div className="flex items-center gap-2 mb-3">
                                                        <Check className="w-5 h-5 text-tn-green" />
                                                        <div className="text-[14px] font-semibold">Connected</div>
                                                        <Pill tone="green" size="sm">active</Pill>
                                                </div>
                                                <div className="text-[12px] text-ink-mute uppercase tracking-wider mb-1">Repository</div>
                                                <a href={conn.repo_url} target="_blank" rel="noopener noreferrer" className="text-[14px] font-mono text-brand hover:underline break-all">{conn.repo_url}</a>
                                                <div className="mt-4 text-[12px] text-ink-mute">Connected at {conn.connected_at?.slice(0, 16)}</div>
                                                {conn.last_sync_at && <div className="text-[12px] text-ink-mute">Last sync {conn.last_sync_at.slice(0, 16)}</div>}
                                                <button type="button" onClick={disconnect} data-testid="gh-disconnect" className="mt-4 h-10 px-4 rounded-xl bg-tn-red/15 text-tn-red text-[13px] font-semibold flex items-center gap-1.5 hover:bg-tn-red/25">
                                                        <Unlink className="w-4 h-4" /> Disconnect
                                                </button>
                                        </div>
                                ) : (
                                        <form onSubmit={connect} className="rounded-2xl bg-surface p-5 space-y-3" data-testid="gh-form">
                                                <div>
                                                        <div className="text-[12px] text-ink-dim mb-1.5">GitHub organisation</div>
                                                        <input data-testid="gh-org" value={org} onChange={(e) => setOrg(e.target.value)} placeholder="acme-corp" className="w-full h-11 px-3.5 rounded-xl bg-bg border border-hairline text-[14px] focus:outline-none focus:ring-2 focus:ring-brand/40" />
                                                </div>
                                                <div>
                                                        <div className="text-[12px] text-ink-dim mb-1.5">Repository</div>
                                                        <input data-testid="gh-repo" value={repo} onChange={(e) => setRepo(e.target.value)} placeholder="my-app" className="w-full h-11 px-3.5 rounded-xl bg-bg border border-hairline text-[14px] focus:outline-none focus:ring-2 focus:ring-brand/40" />
                                                </div>
                                                <button type="submit" disabled={saving} data-testid="gh-connect" className="w-full h-12 rounded-2xl bg-brand text-black font-semibold flex items-center justify-center gap-2 disabled:opacity-60">
                                                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />} Connect
                                                </button>
                                        </form>
                                )}
                        </div>
                </div>
        );
}
