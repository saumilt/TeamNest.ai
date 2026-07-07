import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Check,
  Copy,
  ExternalLink,
  Globe,
  Loader2,
  Rocket,
  UploadCloud,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";

/**
 * PublishDialog — ship the generated app from the test preview to:
 *   1. TeamNest production hosting (/p/{slug}) — instant, stable URL,
 *      only changes when you re-publish. Plus a custom-domain CNAME setup.
 *   2. Vercel — real deploy with the user's access token.
 *   3. Netlify — real deploy with the user's personal access token.
 */
export default function PublishDialog({ open, onOpenChange, project }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg bg-surface border-hairline" data-testid="publish-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-ink">
            <Rocket className="w-4 h-4 text-amber-300" />
            Publish {project?.name}
          </DialogTitle>
          <DialogDescription className="text-ink-mute text-[12.5px]">
            Your test preview stays editable — production only changes when you publish.
          </DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="teamnest">
          <TabsList className="grid grid-cols-3 bg-surface-2">
            <TabsTrigger value="teamnest" data-testid="publish-tab-teamnest">TeamNest</TabsTrigger>
            <TabsTrigger value="vercel" data-testid="publish-tab-vercel">Vercel</TabsTrigger>
            <TabsTrigger value="netlify" data-testid="publish-tab-netlify">Netlify</TabsTrigger>
          </TabsList>
          <TabsContent value="teamnest">
            <TeamNestTab project={project} active={open} />
          </TabsContent>
          <TabsContent value="vercel">
            <ExternalDeployTab project={project} provider="vercel" />
          </TabsContent>
          <TabsContent value="netlify">
            <ExternalDeployTab project={project} provider="netlify" />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function CopyLink({ url, testid }) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied");
    } catch {
      toast.info(url);
    }
  };
  return (
    <div className="flex items-center gap-1.5 bg-surface-2 rounded-lg px-2.5 h-9 ring-1 ring-hairline min-w-0">
      <Globe className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        data-testid={testid}
        className="flex-1 truncate text-[12px] text-emerald-300 hover:underline"
      >
        {url}
      </a>
      <button type="button" onClick={copy} className="text-ink-mute hover:text-ink p-1" title="Copy">
        <Copy className="w-3.5 h-3.5" />
      </button>
      <a href={url} target="_blank" rel="noopener noreferrer" className="text-ink-mute hover:text-ink p-1" title="Open">
        <ExternalLink className="w-3.5 h-3.5" />
      </a>
    </div>
  );
}

function TeamNestTab({ project, active }) {
  const [release, setRelease] = useState(null);
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [slugDraft, setSlugDraft] = useState("");
  const [domainDraft, setDomainDraft] = useState("");
  const [savingDomain, setSavingDomain] = useState(false);
  const [gates, setGates] = useState(null);
  const [awaitingApproval, setAwaitingApproval] = useState(false);

  const load = useCallback(async () => {
    if (!project?.id) return;
    setLoading(true);
    try {
      const { data } = await api.get(`/dev-projects/${project.id}/production`);
      setRelease(data);
      setSlugDraft(data.slug);
      setDomainDraft(data.custom_domain || "");
    } catch {
      setRelease(null);
    } finally {
      setLoading(false);
    }
    // Launch checklist — QA + security gates (best-effort).
    try {
      const { data } = await api.post(`/dev-projects/${project.id}/gates/run`);
      setGates(data);
    } catch { setGates(null); }
  }, [project?.id]);

  useEffect(() => { if (active) load(); }, [active, load]);

  const publish = async (override = false) => {
    setPublishing(true);
    try {
      const { data } = await api.post(`/dev-projects/${project.id}/publish`, {
        slug: slugDraft || undefined,
        override_gates: override,
      });
      if (data?.status === "approval_requested") {
        setAwaitingApproval(true);
        toast.info("Sent to your Product Manager for approval — check the chat");
        return;
      }
      setRelease(data);
      setSlugDraft(data.slug);
      toast.success(`v${data.version} is live 🎉`);
    } catch (e) {
      const detail = e?.response?.data?.detail;
      if (detail?.code === "gates_failed") {
        setGates(detail.gates);
        toast.error("Launch checklist failed — review the issues below");
      } else {
        toast.error(typeof detail === "string" ? detail : "Publish failed");
      }
    } finally {
      setPublishing(false);
    }
  };

  const saveDomain = async () => {
    setSavingDomain(true);
    try {
      const { data } = await api.patch(`/dev-projects/${project.id}/production`, {
        custom_domain: domainDraft.trim(),
      });
      setRelease(data);
      toast.success(domainDraft.trim() ? "Domain saved — set up the CNAME below" : "Domain removed");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not save domain");
    } finally {
      setSavingDomain(false);
    }
  };

  const prodUrl = release ? `${window.location.origin}/p/${release.slug}` : null;
  const host = window.location.host;

  if (loading) {
    return (
      <div className="py-8 flex items-center justify-center text-ink-mute text-[12px] gap-2">
        <Loader2 className="w-4 h-4 animate-spin" /> Checking production status…
      </div>
    );
  }

  return (
    <div className="space-y-4 pt-2">
      {/* Launch checklist — QA + security gates */}
      {gates && (
        <div className="flex flex-wrap items-center gap-1.5" data-testid="launch-checklist">
          <span
            data-testid="gate-qa-badge"
            className={`inline-flex items-center h-5 px-2 rounded-full ring-1 text-[10.5px] font-semibold ${
              gates.qa?.ok
                ? "bg-emerald-400/15 text-emerald-300 ring-emerald-400/30"
                : "bg-red-400/15 text-red-300 ring-red-400/30"
            }`}
          >
            QA {gates.qa?.passed}/{gates.qa?.total}
          </span>
          <span
            data-testid="gate-security-badge"
            className={`inline-flex items-center h-5 px-2 rounded-full ring-1 text-[10.5px] font-semibold ${
              gates.security?.ok
                ? "bg-emerald-400/15 text-emerald-300 ring-emerald-400/30"
                : "bg-red-400/15 text-red-300 ring-red-400/30"
            }`}
          >
            Security {gates.security?.ok ? "passed" : `${gates.security?.high_count} high risk`}
          </span>
          <span className="text-[10.5px] text-ink-mute">
            {gates.ok ? "🟢 Safe to publish" : "🔴 Must fix (or owner override)"}
          </span>
        </div>
      )}
      {gates && !gates.ok && (
        <div className="rounded-lg bg-red-400/5 ring-1 ring-red-400/20 p-2.5 space-y-1" data-testid="gate-issues">
          {(gates.qa?.checks || []).filter((c) => !c.ok).map((c) => (
            <div key={c.name} className="text-[11px] text-red-300">✗ QA: {c.name}</div>
          ))}
          {(gates.security?.issues || []).filter((i) => i.severity === "high").slice(0, 5).map((i, idx) => (
            <div key={idx} className="text-[11px] text-red-300">✗ {i.message} · <code>{i.path}</code></div>
          ))}
          <button
            type="button"
            onClick={() => publish(true)}
            disabled={publishing}
            data-testid="publish-override-btn"
            className="mt-1 text-[11px] text-amber-300 hover:underline"
          >
            Publish anyway (owner override) →
          </button>
        </div>
      )}
      {awaitingApproval && (
        <div
          data-testid="awaiting-approval-banner"
          className="rounded-lg bg-amber-400/10 ring-1 ring-amber-400/30 p-2.5 text-[12px] text-amber-200"
        >
          ⏳ Publish requested — your Product Manager received an approval card in the chat.
          The release goes live as soon as they approve.
        </div>
      )}
      {release ? (
        <>
          <div className="flex items-center gap-2 text-[12px] text-ink-dim">
            <span className="inline-flex items-center gap-1 h-5 px-2 rounded-full bg-emerald-400/15 text-emerald-300 ring-1 ring-emerald-400/30 font-semibold text-[10.5px]">
              <Check className="w-3 h-3" /> Live · v{release.version}
            </span>
            <span>published {new Date(release.published_at).toLocaleString()}</span>
          </div>
          <CopyLink url={prodUrl} testid="production-url-link" />
        </>
      ) : (
        <p className="text-[12.5px] text-ink-dim">
          Not published yet. Publishing snapshots the current working build into a stable
          public URL — separate from your test preview.
        </p>
      )}

      <div className="space-y-1.5">
        <label className="text-[11px] uppercase tracking-wider text-ink-mute">App name (URL slug)</label>
        <div className="flex gap-2">
          <div className="flex-1 flex items-center bg-surface-2 rounded-lg ring-1 ring-hairline px-2.5">
            <span className="text-[12px] text-ink-mute shrink-0">/p/</span>
            <Input
              value={slugDraft}
              onChange={(e) => setSlugDraft(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))}
              placeholder={project?.name?.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "my-app"}
              data-testid="publish-slug-input"
              className="border-0 bg-transparent h-9 px-1 text-[13px] focus-visible:ring-0"
            />
          </div>
          <Button
            onClick={() => publish(false)}
            disabled={publishing}
            data-testid="publish-now-btn"
            className="bg-amber-300 hover:bg-amber-200 text-black font-semibold h-9"
          >
            {publishing
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : release ? "Publish update" : "Publish"}
          </Button>
        </div>
      </div>

      {release && (
        <div className="space-y-1.5 pt-1 border-t border-hairline">
          <label className="text-[11px] uppercase tracking-wider text-ink-mute pt-2 block">
            Custom domain
          </label>
          <div className="flex gap-2">
            <Input
              value={domainDraft}
              onChange={(e) => setDomainDraft(e.target.value)}
              placeholder="app.yourcompany.com"
              data-testid="custom-domain-input"
              className="bg-surface-2 border-hairline h-9 text-[13px]"
            />
            <Button
              onClick={saveDomain}
              disabled={savingDomain}
              variant="outline"
              data-testid="custom-domain-save"
              className="h-9 border-hairline"
            >
              {savingDomain ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
            </Button>
          </div>
          {release.custom_domain && (
            <div
              data-testid="dns-instructions"
              className="rounded-lg bg-surface-2 ring-1 ring-hairline p-3 text-[11.5px] text-ink-dim space-y-1.5"
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold text-ink">DNS setup</span>
                <span className="inline-flex items-center h-5 px-2 rounded-full bg-amber-400/15 text-amber-300 ring-1 ring-amber-400/30 text-[10px] font-semibold">
                  Pending DNS
                </span>
              </div>
              <p>Add this record at your domain registrar:</p>
              <code className="block bg-black/40 rounded p-2 text-[11px] text-amber-200">
                CNAME&nbsp;&nbsp;{release.custom_domain}&nbsp;&nbsp;→&nbsp;&nbsp;{host}
              </code>
              <p className="text-ink-mute">
                Propagation can take up to 24h. Until then, your app stays reachable at{" "}
                <span className="text-emerald-300">{prodUrl}</span>.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const PROVIDER_META = {
  vercel: {
    label: "Vercel",
    tokenHint: "Vercel Dashboard → Settings → Tokens",
    tokenUrl: "https://vercel.com/account/tokens",
    extraField: { key: "team_id", label: "Team ID (optional)", placeholder: "team_..." },
  },
  netlify: {
    label: "Netlify",
    tokenHint: "Netlify → User settings → Applications → Personal access tokens",
    tokenUrl: "https://app.netlify.com/user/applications#personal-access-tokens",
    extraField: { key: "site_name", label: "Site name (optional)", placeholder: "my-app" },
  },
};

function ExternalDeployTab({ project, provider }) {
  const meta = PROVIDER_META[provider];
  const [token, setToken] = useState("");
  const [extra, setExtra] = useState("");
  const [deploying, setDeploying] = useState(false);
  const [result, setResult] = useState(null);

  const deploy = async () => {
    setDeploying(true);
    setResult(null);
    try {
      const body = { token: token.trim() };
      if (extra.trim()) body[meta.extraField.key] = extra.trim();
      const { data } = await api.post(`/dev-projects/${project.id}/deploy/${provider}`, body);
      setResult(data);
      toast.success(`Deployed to ${meta.label} 🚀`);
    } catch (e) {
      toast.error(e?.response?.data?.detail || `${meta.label} deploy failed`);
    } finally {
      setDeploying(false);
    }
  };

  return (
    <div className="space-y-3 pt-2">
      <p className="text-[12.5px] text-ink-dim">
        Deploys your app&apos;s frontend to {meta.label} with your own account. Your token is
        used once and never stored.
      </p>
      <div className="space-y-1.5">
        <label className="text-[11px] uppercase tracking-wider text-ink-mute">
          {meta.label} access token
        </label>
        <Input
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="Paste your token"
          data-testid={`${provider}-token-input`}
          className="bg-surface-2 border-hairline h-9 text-[13px]"
        />
        <a
          href={meta.tokenUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[11px] text-amber-300 hover:underline inline-flex items-center gap-1"
        >
          Get a token: {meta.tokenHint} <ExternalLink className="w-3 h-3" />
        </a>
      </div>
      <div className="space-y-1.5">
        <label className="text-[11px] uppercase tracking-wider text-ink-mute">
          {meta.extraField.label}
        </label>
        <Input
          value={extra}
          onChange={(e) => setExtra(e.target.value)}
          placeholder={meta.extraField.placeholder}
          data-testid={`${provider}-extra-input`}
          className="bg-surface-2 border-hairline h-9 text-[13px]"
        />
      </div>
      <Button
        onClick={deploy}
        disabled={!token.trim() || deploying}
        data-testid={`${provider}-deploy-btn`}
        className="w-full bg-amber-300 hover:bg-amber-200 text-black font-semibold h-9"
      >
        {deploying ? (
          <span className="inline-flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Deploying — can take ~30s…
          </span>
        ) : (
          <span className="inline-flex items-center gap-2">
            <UploadCloud className="w-4 h-4" /> Deploy to {meta.label}
          </span>
        )}
      </Button>
      {result?.url && <CopyLink url={result.url} testid={`${provider}-result-url`} />}
    </div>
  );
}
