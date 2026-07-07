import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Rocket, Globe, Save, Loader2, Settings2, Activity } from "lucide-react";
import { api } from "@/lib/api";
import PublishDialog from "@/components/chat/PublishDialog";
import SellTemplateSection from "@/components/market/SellTemplateSection";

/**
 * ReleasePanel — everything about shipping, in one tab:
 * publish to TeamNest production, deploy to Vercel, env vars, and the
 * project's recent release/edit activity.
 */
export default function ReleasePanel({ project, refreshKey }) {
  const projectId = project.id;
  const [publishOpen, setPublishOpen] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [envVars, setEnvVars] = useState({});
  const [envDirty, setEnvDirty] = useState(false);
  const [activity, setActivity] = useState([]);
  const [production, setProduction] = useState(null);
  const [domainInput, setDomainInput] = useState("");
  const [savingDomain, setSavingDomain] = useState(false);
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    api.get(`/dev-projects/${projectId}/production`)
      .then(({ data }) => { setProduction(data); setDomainInput(data.custom_domain || ""); })
      .catch(() => setProduction(null));
  }, [projectId, publishOpen]);

  const verifyDomain = async () => {
    setVerifying(true);
    try {
      const { data } = await api.post(`/dev-projects/${projectId}/verify-domain`);
      setProduction((p) => ({ ...p, domain_status: data.domain_status, domain_check_detail: data.detail }));
      if (data.verified) toast.success(`Domain verified — ${data.detail}`);
      else toast.warning(data.detail || "DNS not verified yet");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Verification failed");
    }
    setVerifying(false);
  };

  const saveDomain = async () => {
    setSavingDomain(true);
    try {
      const { data } = await api.patch(`/dev-projects/${projectId}/production`, {
        custom_domain: domainInput.trim(),
      });
      setProduction(data);
      toast.success(domainInput.trim() ? "Domain saved — add the CNAME to go live" : "Domain removed");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not save domain");
    }
    setSavingDomain(false);
  };

  useEffect(() => {
    api.get(`/dev-projects/${projectId}/env-vars`)
      .then(({ data }) => { setEnvVars(data.env_vars || {}); setEnvDirty(false); })
      .catch(() => {});
  }, [projectId]);

  const loadActivity = useCallback(() => {
    api.get(`/dev-projects/${projectId}/audit-logs?limit=20`)
      .then(({ data }) => setActivity(data.logs || data || []))
      .catch(() => setActivity([]));
  }, [projectId]);

  useEffect(() => { loadActivity(); }, [loadActivity, refreshKey]);

  const onDeploy = async () => {
    if (deploying) return;
    setDeploying(true);
    try {
      const { data } = await api.post(`/dev-projects/${projectId}/vercel/deploy`);
      if (data?.url) {
        toast.success("Deployed to Vercel");
        window.open(data.url, "_blank", "noopener");
      } else {
        toast.success("Deploy started");
      }
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Deploy failed — connect Vercel in settings");
    }
    setDeploying(false);
  };

  const saveEnv = async () => {
    try {
      await api.put(`/dev-projects/${projectId}/env-vars`, { env_vars: envVars });
      setEnvDirty(false);
      toast.success("Environment variables saved");
    } catch { toast.error("Save failed"); }
  };

  return (
    <div className="h-full overflow-y-auto p-4 space-y-4" data-testid="ds-release-panel">
      {/* Publish */}
      <section className="rounded-xl bg-surface-2 ring-1 ring-hairline p-4">
        <div className="flex items-center gap-2 mb-1">
          <Globe className="w-4 h-4 text-amber-300" />
          <div className="text-[13px] font-semibold text-ink">Publish to production</div>
        </div>
        <p className="text-[12px] text-ink-mute mb-3">
          Snapshot the current build to a live public URL. Your test preview stays
          editable — production only changes when you re-publish.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setPublishOpen(true)}
            data-testid="ds-release-publish"
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-pill bg-amber-300 hover:bg-amber-200 text-black font-semibold text-[13px]"
          >
            <Globe className="w-3.5 h-3.5" /> Publish
          </button>
          <button
            type="button"
            onClick={onDeploy}
            disabled={deploying}
            data-testid="ds-release-vercel"
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-pill bg-surface hover:bg-surface-3 text-ink text-[13px] ring-1 ring-hairline disabled:opacity-50"
          >
            {deploying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Rocket className="w-3.5 h-3.5" />}
            Deploy to Vercel
          </button>
        </div>
      </section>

      {/* Custom domain */}
      <section className="rounded-xl bg-surface-2 ring-1 ring-hairline p-4">
        <div className="inline-flex items-center gap-2 mb-1">
          <Globe className="w-4 h-4 text-ink-mute" />
          <div className="text-[13px] font-semibold text-ink">Custom domain</div>
          {production?.domain_status && (
            <span className={`text-[10px] px-2 py-0.5 rounded-full ring-1 ${production.domain_status === "connected" ? "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30" : "bg-amber-400/15 text-amber-300 ring-amber-400/30"}`}>
              {production.domain_status === "connected" ? "Connected" : "Waiting for DNS"}
            </span>
          )}
        </div>
        {production ? (
          <>
            <p className="text-[12px] text-ink-mute mb-3">
              Serve your published app on your own domain. Point a CNAME at{" "}
              <code className="text-amber-300 font-mono">{window.location.hostname}</code>{" "}
              and enter the domain below.
            </p>
            <label className="flex items-center gap-2 mb-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={!!production.showcase_opt_in}
                data-testid="ds-showcase-optin"
                onChange={async (e) => {
                  try {
                    const { data } = await api.patch(`/dev-projects/${projectId}/production`, {
                      showcase_opt_in: e.target.checked,
                    });
                    setProduction(data);
                    toast.success(e.target.checked ? "Added to the Built with TeamNest showcase" : "Removed from showcase");
                  } catch { toast.error("Could not update showcase setting"); }
                }}
                className="accent-amber-300 w-3.5 h-3.5"
              />
              <span className="text-[12px] text-ink-dim">
                Feature this app in the public <span className="text-amber-300">Built with TeamNest</span> showcase
              </span>
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={domainInput}
                onChange={(e) => setDomainInput(e.target.value)}
                placeholder="app.yourcompany.com"
                data-testid="ds-domain-input"
                className="flex-1 h-9 px-3 rounded-lg bg-surface ring-1 ring-hairline text-[12px] font-mono text-ink outline-none focus:ring-amber-400/40 placeholder:text-ink-mute"
              />
              <button
                type="button"
                onClick={saveDomain}
                disabled={savingDomain}
                data-testid="ds-domain-save"
                className="h-9 px-4 rounded-pill bg-amber-300 hover:bg-amber-200 text-black font-semibold text-[12px] disabled:opacity-40"
              >
                {savingDomain ? "Saving…" : "Save"}
              </button>
              {production.custom_domain && production.domain_status !== "connected" && (
                <button
                  type="button"
                  onClick={verifyDomain}
                  disabled={verifying}
                  data-testid="ds-domain-verify"
                  className="h-9 px-4 rounded-pill bg-surface hover:bg-surface-3 ring-1 ring-hairline text-ink font-semibold text-[12px] disabled:opacity-40"
                >
                  {verifying ? "Checking…" : "Verify DNS"}
                </button>
              )}
            </div>
            {production.custom_domain && production.domain_status !== "connected" && production.domain_verify_token && (
              <p className="text-[11px] text-ink-mute mt-2" data-testid="ds-domain-txt-hint">
                Can't use a CNAME at the apex? Add a TXT record at{" "}
                <code className="text-amber-300 font-mono">_teamnest.{production.custom_domain}</code>{" "}
                with value <code className="text-amber-300 font-mono">{production.domain_verify_token}</code>{" "}
                then hit Verify DNS.
                {production.domain_check_detail && (
                  <span className="block mt-1 text-ink-dim">Last check: {production.domain_check_detail}</span>
                )}
              </p>
            )}
          </>
        ) : (
          <p className="text-[12px] text-ink-mute">Publish the app first, then connect a custom domain here.</p>
        )}
      </section>

      {/* Sell as template */}
      <SellTemplateSection project={project} />

      {/* Env vars */}
      <section className="rounded-xl bg-surface-2 ring-1 ring-hairline p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="inline-flex items-center gap-2">
            <Settings2 className="w-4 h-4 text-ink-mute" />
            <div className="text-[13px] font-semibold text-ink">Environment variables</div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setEnvVars((v) => ({ ...v, "": "" }))}
              data-testid="ds-env-add"
              className="text-[12px] h-8 px-3 rounded-pill bg-surface hover:bg-surface-3 text-ink ring-1 ring-hairline"
            >
              + Add
            </button>
            <button
              type="button"
              onClick={saveEnv}
              disabled={!envDirty}
              data-testid="ds-env-save"
              className="inline-flex items-center gap-1.5 text-[12px] h-8 px-3 rounded-pill bg-amber-300 hover:bg-amber-200 text-black font-semibold disabled:opacity-40"
            >
              <Save className="w-3.5 h-3.5" /> Save
            </button>
          </div>
        </div>
        <div className="space-y-2">
          {Object.entries(envVars).map(([k, v], i) => (
            <div key={`${i}-${k}`} className="flex gap-2">
              <input
                type="text"
                defaultValue={k}
                placeholder="KEY_NAME"
                onBlur={(e) => {
                  const newKey = e.target.value.trim();
                  if (newKey === k) return;
                  setEnvVars((s) => {
                    const next = { ...s };
                    delete next[k];
                    if (newKey) next[newKey] = v;
                    return next;
                  });
                  setEnvDirty(true);
                }}
                className="w-1/3 h-9 px-3 rounded-lg bg-surface ring-1 ring-hairline text-[12px] font-mono text-ink outline-none focus:ring-amber-400/40"
              />
              <input
                type="text"
                value={v}
                placeholder="value"
                onChange={(e) => {
                  setEnvVars((s) => ({ ...s, [k]: e.target.value }));
                  setEnvDirty(true);
                }}
                className="flex-1 h-9 px-3 rounded-lg bg-surface ring-1 ring-hairline text-[12px] font-mono text-ink outline-none focus:ring-amber-400/40"
              />
              <button
                type="button"
                onClick={() => {
                  setEnvVars((s) => { const n = { ...s }; delete n[k]; return n; });
                  setEnvDirty(true);
                }}
                className="text-ink-mute hover:text-rose-300 text-[11px] px-2"
              >
                Remove
              </button>
            </div>
          ))}
          {Object.keys(envVars).length === 0 && (
            <div className="text-[12px] text-ink-mute italic">No variables yet.</div>
          )}
        </div>
      </section>

      {/* Activity */}
      <section className="rounded-xl bg-surface-2 ring-1 ring-hairline p-4">
        <div className="inline-flex items-center gap-2 mb-3">
          <Activity className="w-4 h-4 text-ink-mute" />
          <div className="text-[13px] font-semibold text-ink">Recent activity</div>
        </div>
        <ul className="space-y-2">
          {[...activity]
            .sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""))
            .map((a) => (
              <li key={a.id} className="rounded-lg bg-surface ring-1 ring-hairline p-3">
                <div className="text-[11px] text-ink-dim flex items-center gap-2">
                  <span className="px-1.5 py-0.5 rounded bg-brand-tint text-brand text-[10px] uppercase tracking-wide font-semibold">
                    {a.action}
                  </span>
                  <span className="text-ink-mute">{new Date(a.created_at).toLocaleString()}</span>
                </div>
                <div className="text-[12px] text-ink mt-1">{a.summary || "—"}</div>
              </li>
            ))}
          {activity.length === 0 && (
            <li className="text-[12px] text-ink-mute italic">No activity yet.</li>
          )}
        </ul>
      </section>

      <PublishDialog open={publishOpen} onOpenChange={setPublishOpen} project={project} />
    </div>
  );
}
