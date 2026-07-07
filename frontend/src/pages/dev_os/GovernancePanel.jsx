import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { ChevronLeft, ShieldCheck, Save, Loader2, Moon, Zap, Bell, Send } from "lucide-react";
import { api } from "@/lib/api";
import { requestPushPermission } from "@/lib/onesignal";
import AppBar from "@/components/ui-v2/AppBar";

const TOGGLES = [
        { key: "auto_approve_documentation", label: "Auto-approve documentation proposals", help: "Docs-only changes (no code) approve themselves." },
        { key: "auto_approve_low_risk", label: "Auto-approve low-risk proposals", help: "Bypass the human queue for proposals tagged risk_level=low." },
        { key: "require_human_for_deployment", label: "Require human sign-off for deployments", help: "DevOps agent cannot ship without a human approval." },
        { key: "require_human_for_security", label: "Require human sign-off for security changes", help: "Security agent edits always go through review." },
        { key: "nightly_scan_enabled", label: "Nightly auto-scan of linked chats", help: "Once every 22h, scan each chat-linked project for new bug/UX/perf/churn signals and draft proposals automatically." },
        { key: "daily_push_enabled", label: "Daily push digest to mobile", help: "Send a OneSignal push when the daily digest has content. Requires OneSignal SDK init on the client." },
        { key: "daily_email_enabled", label: "Daily email digest", help: "Email the digest via Resend (requires RESEND_API_KEY + verified sending domain in backend .env)." },
];

const AGENTS_KEYS = ["product_ceo", "architect", "frontend", "backend", "qa", "security", "devops", "growth", "reviewer"];

/** /dev-os/governance — workspace owner controls per-agent risk policy. */
export default function GovernancePanel() {
        const [policy, setPolicy] = useState(null);
        const [loading, setLoading] = useState(true);
        const [saving, setSaving] = useState(false);
        const [running, setRunning] = useState(false);
        const [pushing, setPushing] = useState(false);

        useEffect(() => {
                api.get("/dev-os/governance")
                        .then((r) => setPolicy(r.data.policy))
                        .catch(() => toast.error("Could not load governance policy"))
                        .finally(() => setLoading(false));
        }, []);

        const update = (patch) => setPolicy((p) => ({ ...p, ...patch }));
        const toggleAgent = (key) => setPolicy((p) => ({
                ...p,
                agent_enabled: { ...p.agent_enabled, [key]: !p.agent_enabled[key] },
        }));

        const save = async () => {
                setSaving(true);
                try {
                        await api.put("/dev-os/governance", {
                                auto_approve_low_risk: policy.auto_approve_low_risk,
                                auto_approve_documentation: policy.auto_approve_documentation,
                                require_human_for_deployment: policy.require_human_for_deployment,
                                require_human_for_security: policy.require_human_for_security,
                                nightly_scan_enabled: !!policy.nightly_scan_enabled,
                                daily_push_enabled: !!policy.daily_push_enabled,
                                daily_email_enabled: !!policy.daily_email_enabled,
                                quiet_hours_start: Number(policy.quiet_hours_start ?? 22),
                                quiet_hours_end: Number(policy.quiet_hours_end ?? 7),
                                max_credits_without_approval: Number(policy.max_credits_without_approval) || 0,
                                agent_enabled: policy.agent_enabled,
                        });
                        toast.success("Governance policy saved");
                } catch (err) {
                        toast.error(err?.response?.data?.detail || "Could not save");
                } finally {
                        setSaving(false);
                }
        };

        const runNow = async () => {
                setRunning(true);
                try {
                        const { data } = await api.post("/dev-os/run-nightly-scan", {});
                        toast.success(`Scanned ${data.scanned_projects} project(s) · drafted ${data.drafted_proposals} proposal(s)`);
                } catch (err) {
                        toast.error(err?.response?.data?.detail || "Scan failed");
                } finally {
                        setRunning(false);
                }
        };

        const testPush = async () => {
                setPushing(true);
                try {
                        // Make sure the browser has push permission before asking the server
                        // to deliver — otherwise the user only sees "no subscription".
                        await requestPushPermission();
                        const { data } = await api.post("/dev-os/daily-digest/push-test", {});
                        if (data?.ok) {
                                toast.success(`Push sent · recipients: ${data.recipients ?? 0}`);
                        } else if (data?.reason === "not_configured") {
                                toast.error("OneSignal isn't configured on this server.");
                        } else if (data?.reason === "no_subscribers") {
                                toast.error("No OneSignal subscription found for your account yet — initialise the SDK first.");
                        } else {
                                toast.error(data?.reason || "Push failed");
                        }
                } catch (err) {
                        toast.error(err?.response?.data?.detail || "Push failed");
                } finally {
                        setPushing(false);
                }
        };

        if (loading || !policy) {
                return (
                        <div className="min-h-[100dvh] bg-bg flex items-center justify-center">
                                <Loader2 className="w-6 h-6 animate-spin text-ink-dim" />
                        </div>
                );
        }

        return (
                <div className="min-h-[100dvh] bg-bg pb-24 md:pb-8 text-ink" data-testid="governance-panel">
                        <AppBar
                                left={
                                        <Link to="/dev-os" className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-white/5" data-testid="gov-back">
                                                <ChevronLeft className="w-5 h-5" />
                                        </Link>
                                }
                                center={<div className="text-[15px] font-semibold">Governance</div>}
                                right={
                                        <button
                                                type="button"
                                                data-testid="gov-save"
                                                onClick={save}
                                                disabled={saving}
                                                className="h-9 px-3 rounded-full bg-brand text-black text-[13px] font-semibold flex items-center gap-1.5 hover:bg-brand-deep disabled:opacity-60"
                                        >
                                                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save
                                        </button>
                                }
                        />

                        <div className="px-4 md:px-5 pt-4 max-w-2xl mx-auto space-y-5">
                                <div className="rounded-2xl bg-ai-tint/60 border border-ai/20 p-4 flex items-start gap-3">
                                        <ShieldCheck className="w-5 h-5 text-ai shrink-0 mt-0.5" />
                                        <div className="text-[13px] text-ink leading-snug">
                                                Set guardrails for AI agents. Auto-approval routes safe proposals straight to <b>approved</b>; everything else waits for human review.
                                        </div>
                                </div>

                                <Section title="Approval rules">
                                        {TOGGLES.map((t) => (
                                                <Toggle
                                                        key={t.key}
                                                        testid={`gov-toggle-${t.key}`}
                                                        label={t.label}
                                                        help={t.help}
                                                        on={!!policy[t.key]}
                                                        onChange={() => update({ [t.key]: !policy[t.key] })}
                                                />
                                        ))}
                                        <div className="pt-3 border-t border-hairline">
                                                <div className="text-[13px] font-medium mb-1.5">Max credits without approval</div>
                                                <input
                                                        type="number"
                                                        data-testid="gov-max-credits"
                                                        min={0}
                                                        max={1000}
                                                        value={policy.max_credits_without_approval}
                                                        onChange={(e) => update({ max_credits_without_approval: e.target.value })}
                                                        className="w-32 h-11 px-3 rounded-xl bg-surface border border-hairline text-[14px] focus:outline-none focus:ring-2 focus:ring-brand/40"
                                                />
                                                <div className="text-[11px] text-ink-mute mt-1">Proposals costing more than this require human sign-off.</div>
                                        </div>
                                        <div className="pt-3 border-t border-hairline">
                                                <div className="text-[13px] font-medium mb-2">Quiet hours (UTC)</div>
                                                <div className="flex items-center gap-3">
                                                        <div>
                                                                <div className="text-[11px] text-ink-mute mb-1">Start</div>
                                                                <input
                                                                        type="number"
                                                                        data-testid="gov-quiet-start"
                                                                        min={0}
                                                                        max={23}
                                                                        value={policy.quiet_hours_start ?? 22}
                                                                        onChange={(e) => update({ quiet_hours_start: Number(e.target.value) })}
                                                                        className="w-20 h-10 px-3 rounded-xl bg-surface border border-hairline text-[14px] text-center focus:outline-none focus:ring-2 focus:ring-brand/40"
                                                                />
                                                        </div>
                                                        <div className="text-ink-mute">→</div>
                                                        <div>
                                                                <div className="text-[11px] text-ink-mute mb-1">End</div>
                                                                <input
                                                                        type="number"
                                                                        data-testid="gov-quiet-end"
                                                                        min={0}
                                                                        max={23}
                                                                        value={policy.quiet_hours_end ?? 7}
                                                                        onChange={(e) => update({ quiet_hours_end: Number(e.target.value) })}
                                                                        className="w-20 h-10 px-3 rounded-xl bg-surface border border-hairline text-[14px] text-center focus:outline-none focus:ring-2 focus:ring-brand/40"
                                                                />
                                                        </div>
                                                </div>
                                                <div className="text-[11px] text-ink-mute mt-1.5">Digest pushes / emails skip this window (e.g. 22 → 7 = no DMs between 10pm–7am UTC).</div>
                                        </div>
                                </Section>

                                <Section title="Nightly auto-scan &amp; push">
                                        <div className="flex items-start gap-3">
                                                <div className="w-10 h-10 rounded-xl bg-ai-tint text-ai flex items-center justify-center shrink-0">
                                                        <Moon className="w-5 h-5" />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                        <div className="text-[13px] font-medium">Trigger a scan right now</div>
                                                        <div className="text-[11px] text-ink-mute mt-0.5 leading-snug">
                                                                Runs the nightly scheduler on demand across all chat-linked projects in this workspace.
                                                        </div>
                                                </div>
                                                <button
                                                        type="button"
                                                        data-testid="gov-run-scan"
                                                        onClick={runNow}
                                                        disabled={running}
                                                        className="h-9 px-3 rounded-full bg-ai text-black text-[12px] font-semibold flex items-center gap-1.5 disabled:opacity-50"
                                                >
                                                        {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />} Run now
                                                </button>
                                        </div>
                                        <div className="pt-3 border-t border-hairline flex items-start gap-3">
                                                <div className="w-10 h-10 rounded-xl bg-brand-tint text-brand flex items-center justify-center shrink-0">
                                                        <Bell className="w-5 h-5" />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                        <div className="text-[13px] font-medium">Send me a test push</div>
                                                        <div className="text-[11px] text-ink-mute mt-0.5 leading-snug">
                                                                Delivers today&apos;s digest as a OneSignal push to your account. Requires the OneSignal SDK to be initialised on this device.
                                                        </div>
                                                </div>
                                                <button
                                                        type="button"
                                                        data-testid="gov-test-push"
                                                        onClick={testPush}
                                                        disabled={pushing}
                                                        className="h-9 px-3 rounded-full bg-brand text-black text-[12px] font-semibold flex items-center gap-1.5 disabled:opacity-50"
                                                >
                                                        {pushing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Send
                                                </button>
                                        </div>
                                </Section>

                                <Section title="Enabled agents">
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                                {AGENTS_KEYS.map((k) => (
                                                        <Toggle
                                                                key={k}
                                                                testid={`gov-agent-${k}`}
                                                                label={k.replace("_", " ")}
                                                                on={!!policy.agent_enabled?.[k]}
                                                                onChange={() => toggleAgent(k)}
                                                        />
                                                ))}
                                        </div>
                                </Section>
                        </div>
                </div>
        );
}

function Section({ title, children }) {
        return (
                <div>
                        <div className="text-[12px] font-semibold uppercase tracking-wider text-ink-mute mb-2 px-1">{title}</div>
                        <div className="rounded-2xl bg-surface border border-hairline p-4 space-y-3">{children}</div>
                </div>
        );
}

function Toggle({ label, help, on, onChange, testid }) {
        return (
                <button
                        type="button"
                        data-testid={testid}
                        onClick={onChange}
                        className="w-full flex items-center gap-3 p-2 -mx-2 rounded-xl hover:bg-white/[0.04] text-left transition-colors"
                >
                        <div className="flex-1 min-w-0">
                                <div className="text-[13px] font-medium capitalize text-ink">{label}</div>
                                {help && <div className="text-[11px] text-ink-mute mt-0.5">{help}</div>}
                        </div>
                        <div
                                className={`w-10 h-6 rounded-full p-0.5 transition-colors ${on ? "bg-brand" : "bg-surface-2"}`}
                                role="switch"
                                aria-checked={on}
                        >
                                <div className={`w-5 h-5 rounded-full bg-white transition-transform ${on ? "translate-x-4" : ""}`} />
                        </div>
                </button>
        );
}
