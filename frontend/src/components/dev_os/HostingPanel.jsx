/* HostingPanel — picker + deploy controls for Vercel & Netlify, rendered
 * inside ProjectDetail (and reused inside DevWorkspacePane if desired).
 *
 * Backend mirrors:
 *   GET  /integrations/{vercel|netlify}/{projects|sites}
 *   GET  /dev-projects/{pid}/{vercel|netlify}/link
 *   POST /dev-projects/{pid}/{vercel|netlify}/link
 *   POST /dev-projects/{pid}/{vercel|netlify}/deploy
 */
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Triangle, Cloud, ExternalLink, Loader2, Plug, Rocket } from "lucide-react";
import { api } from "@/lib/api";
import Pill from "@/components/ui-v2/Pill";

export default function HostingPanel({ projectId }) {
        return (
                <div className="space-y-3" data-testid="hosting-panel">
                        <HostingProvider
                                projectId={projectId}
                                provider="vercel"
                                label="Vercel"
                                Icon={Triangle}
                                listEndpoint="/integrations/vercel/projects"
                                listKey="projects"
                                idField="id"
                                nameField="name"
                                payload={(item) => ({ vercel_project_id: item.id, vercel_project_name: item.name })}
                                linkField="vercel_project_id"
                                nameLinkField="vercel_project_name"
                        />
                        <HostingProvider
                                projectId={projectId}
                                provider="netlify"
                                label="Netlify"
                                Icon={Cloud}
                                listEndpoint="/integrations/netlify/sites"
                                listKey="sites"
                                idField="id"
                                nameField="name"
                                payload={(item) => ({ netlify_site_id: item.id, netlify_site_name: item.name })}
                                linkField="netlify_site_id"
                                nameLinkField="netlify_site_name"
                        />
                </div>
        );
}

function HostingProvider({
        projectId, provider, label, Icon,
        listEndpoint, listKey, idField, nameField,
        payload, linkField, nameLinkField,
}) {
        const [link, setLink] = useState(null);
        const [items, setItems] = useState([]);
        const [loadingList, setLoadingList] = useState(false);
        const [linking, setLinking] = useState(false);
        const [deploying, setDeploying] = useState(false);
        const [showPicker, setShowPicker] = useState(false);

        const loadLink = useCallback(async () => {
                try {
                        const { data } = await api.get(`/dev-projects/${projectId}/${provider}/link`);
                        setLink(data?.link || null);
                } catch { /* noop */ }
        }, [projectId, provider]);

        useEffect(() => { loadLink(); }, [loadLink]);

        const loadList = async () => {
                setLoadingList(true);
                try {
                        const { data } = await api.get(listEndpoint);
                        if (data?.ok === false) {
                                toast.error(`${label} not configured: ${data.reason}`);
                                setItems([]);
                        } else {
                                setItems(data?.[listKey] || []);
                        }
                } catch (e) {
                        toast.error(e?.response?.data?.detail || `Could not load ${label} list`);
                } finally {
                        setLoadingList(false);
                }
        };

        const linkItem = async (item) => {
                setLinking(true);
                try {
                        await api.post(`/dev-projects/${projectId}/${provider}/link`, payload(item));
                        toast.success(`${label} linked · ${item[nameField]}`);
                        setShowPicker(false);
                        loadLink();
                } catch (e) {
                        toast.error(e?.response?.data?.detail || "Link failed");
                } finally {
                        setLinking(false);
                }
        };

        const deploy = async () => {
                setDeploying(true);
                try {
                        const { data } = await api.post(`/dev-projects/${projectId}/${provider}/deploy`);
                        if (data?.ok) {
                                toast.success(`${label} deploy queued`);
                        } else {
                                toast.error(`Deploy failed: ${data?.reason || "unknown"}`);
                        }
                } catch (e) {
                        toast.error(e?.response?.data?.detail || "Deploy failed");
                } finally {
                        setDeploying(false);
                }
        };

        return (
                <div className="rounded-2xl bg-surface p-4" data-testid={`hosting-${provider}`}>
                        <div className="flex items-center gap-2 mb-3">
                                <Icon className="w-4 h-4 text-ink-mute" />
                                <div className="text-[12px] font-semibold uppercase tracking-wider text-ink">{label}</div>
                                <div className="ml-auto">
                                        <Pill tone={link ? "green" : "default"} size="sm">{link ? "linked" : "not linked"}</Pill>
                                </div>
                        </div>

                        {link ? (
                                <div className="space-y-2">
                                        <div className="text-[13px] font-semibold text-ink truncate" data-testid={`hosting-${provider}-name`}>
                                                {link[nameLinkField]}
                                        </div>
                                        <div className="text-[10px] text-ink-mute font-mono truncate">
                                                {link[linkField]}
                                        </div>
                                        <div className="flex items-center gap-2 pt-1">
                                                <button
                                                        type="button"
                                                        onClick={deploy}
                                                        disabled={deploying}
                                                        data-testid={`hosting-${provider}-deploy`}
                                                        className="h-8 px-3 rounded-lg bg-brand text-black text-[12px] font-semibold flex items-center gap-1.5 hover:bg-brand-deep disabled:opacity-60"
                                                >
                                                        {deploying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Rocket className="w-3.5 h-3.5" />}
                                                        Deploy
                                                </button>
                                                <button
                                                        type="button"
                                                        onClick={() => { setShowPicker(true); loadList(); }}
                                                        data-testid={`hosting-${provider}-change`}
                                                        className="h-8 px-3 rounded-lg bg-surface-2 text-ink-dim text-[12px] hover:text-ink hover:bg-white/10"
                                                >
                                                        Change…
                                                </button>
                                        </div>
                                </div>
                        ) : (
                                <button
                                        type="button"
                                        onClick={() => { setShowPicker(true); loadList(); }}
                                        data-testid={`hosting-${provider}-link`}
                                        className="w-full h-10 rounded-xl bg-surface-2 text-ink-dim text-[13px] font-medium flex items-center justify-center gap-1.5 hover:bg-white/10 hover:text-ink"
                                >
                                        <Plug className="w-4 h-4" />
                                        Link a {label} {provider === "vercel" ? "project" : "site"}
                                </button>
                        )}

                        {showPicker && (
                                <div className="mt-3 p-3 rounded-xl bg-bg/60 border border-hairline" data-testid={`hosting-${provider}-picker`}>
                                        <div className="text-[11px] font-mono uppercase tracking-wider text-ink-mute mb-2">
                                                Pick a {label} {provider === "vercel" ? "project" : "site"}
                                        </div>
                                        {loadingList ? (
                                                <div className="py-4 flex items-center justify-center">
                                                        <Loader2 className="w-4 h-4 animate-spin text-ink-dim" />
                                                </div>
                                        ) : items.length === 0 ? (
                                                <div className="text-[12px] text-ink-mute py-2">
                                                        No {label} {provider === "vercel" ? "projects" : "sites"} found. Create one on {label} first.
                                                </div>
                                        ) : (
                                                <div className="space-y-1 max-h-56 overflow-y-auto">
                                                        {items.map((it) => (
                                                                <button
                                                                        key={it[idField]}
                                                                        type="button"
                                                                        disabled={linking}
                                                                        onClick={() => linkItem(it)}
                                                                        data-testid={`hosting-${provider}-pick-${it[idField]}`}
                                                                        className="w-full text-left px-2 py-2 rounded-lg hover:bg-white/5 disabled:opacity-60 flex items-center gap-2 group"
                                                                >
                                                                        <div className="flex-1 min-w-0">
                                                                                <div className="text-[13px] text-ink truncate">{it[nameField]}</div>
                                                                                {it.framework && (
                                                                                        <div className="text-[10px] text-ink-mute font-mono">{it.framework}</div>
                                                                                )}
                                                                                {it.url && (
                                                                                        <div className="text-[10px] text-ink-mute font-mono truncate">{it.url}</div>
                                                                                )}
                                                                        </div>
                                                                        <ExternalLink className="w-3 h-3 text-ink-mute opacity-0 group-hover:opacity-100" />
                                                                </button>
                                                        ))}
                                                </div>
                                        )}
                                        <button
                                                type="button"
                                                onClick={() => setShowPicker(false)}
                                                className="mt-2 text-[11px] text-ink-mute hover:text-ink"
                                        >
                                                Cancel
                                        </button>
                                </div>
                        )}
                </div>
        );
}
