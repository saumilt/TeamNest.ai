import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Loader2, Lock, Sparkles } from "lucide-react";
import HireDevTeamButton from "@/components/chat/HireDevTeamButton";

/**
 * TemplatesPanel — browse ready-made app templates inside the Builders tab.
 * Browsing is always free; applying one requires the @devmanager hire.
 */
export default function TemplatesPanel({ locked, relatedChatId, onBuild, busy }) {
  const [templates, setTemplates] = useState(null);
  const [applying, setApplying] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api.get("/dev-os/templates")
      .then(({ data }) => { if (!cancelled) setTemplates(data.templates || []); })
      .catch(() => { if (!cancelled) setTemplates([]); });
    return () => { cancelled = true; };
  }, []);

  const applyTemplate = async (t) => {
    if (busy || applying) return;
    setApplying(t.id);
    try {
      const { data } = await api.get(`/dev-os/templates/${t.id}`);
      const brief = data?.template?.brief || data?.brief || {};
      const problem = brief.problem || t.tagline || t.name;
      const must = brief.requirements?.must_have;
      onBuild(
        `Rebuild this app using the "${t.name}" template. ${problem}` +
        (must ? ` Must-have: ${must}.` : "") +
        " Build all pages, navigation, working forms, demo data and a demo login.",
      );
      toast.success(`Applying the ${t.name} template — @devmanager is on it`);
    } catch {
      toast.error("Couldn't load that template — try again");
    } finally {
      setApplying(null);
    }
  };

  if (templates === null) {
    return (
      <div className="h-full flex items-center justify-center text-ink-mute">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading templates…
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-4 space-y-3" data-testid="templates-panel">
      {locked && (
        <div className="rounded-xl border border-amber-400/30 bg-amber-400/[0.06] p-3 flex flex-wrap items-center gap-3" data-testid="templates-locked-banner">
          <Lock className="w-4 h-4 text-amber-300 shrink-0" />
          <div className="min-w-0 flex-1 text-[12px] text-ink-dim">
            Browse freely — hire <span className="text-amber-200 font-medium">@devmanager</span> once
            to apply a template to your app.
          </div>
          {relatedChatId && <HireDevTeamButton chatId={relatedChatId} variant="toolbar" />}
        </div>
      )}
      <div className="grid sm:grid-cols-2 gap-3">
        {templates.map((t) => (
          <div key={t.id} className="rounded-xl bg-surface ring-1 ring-hairline p-4 flex flex-col gap-2" data-testid={`template-card-${t.id}`}>
            <div className="flex items-center gap-2">
              <div className="text-[13px] font-semibold text-ink flex-1 min-w-0 truncate">{t.name}</div>
              <span className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-surface-2 text-ink-mute">{t.category}</span>
            </div>
            <div className="text-[12px] text-ink-dim leading-snug">{t.tagline}</div>
            {t.best_for && (
              <div className="text-[11px] text-ink-mute leading-snug">Best for: {t.best_for}</div>
            )}
            <div className="mt-auto pt-1">
              {locked ? (
                <button type="button" disabled data-testid={`template-use-${t.id}`}
                  className="h-8 px-3 rounded-pill bg-surface-2 ring-1 ring-hairline text-ink-mute text-[12px] font-medium inline-flex items-center gap-1.5 cursor-not-allowed">
                  <Lock className="w-3 h-3" /> Hire to use
                </button>
              ) : (
                <button type="button" disabled={busy || !!applying} onClick={() => applyTemplate(t)}
                  data-testid={`template-use-${t.id}`}
                  className="h-8 px-3 rounded-pill bg-amber-400/15 text-amber-200 ring-1 ring-amber-400/30 hover:bg-amber-400/25 text-[12px] font-semibold inline-flex items-center gap-1.5 disabled:opacity-40">
                  {applying === t.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                  Use this template
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
