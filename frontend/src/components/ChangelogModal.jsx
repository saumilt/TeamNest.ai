import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import {
  Dialog, DialogContent, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Sparkles, Brain, Gavel, MessageSquareText, Clock, Bell, Shield, ArrowRight, X,
} from "lucide-react";

const ICONS = {
  sparkles: Sparkles, brain: Brain, gavel: Gavel, message: MessageSquareText,
  clock: Clock, bell: Bell, shield: Shield,
};

/**
 * Auto-opens once per user when the backend's CHANGELOG_VERSION differs from
 * the user's stored last_seen_changelog_version. "Got it" marks it seen.
 *
 * Mounted in App.js so it can show on any page after login.
 */
export default function ChangelogModal() {
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);

  useEffect(() => {
    // Best-effort — silently skip if user not authed or endpoint missing
    api.get("/changelog")
      .then(({ data }) => {
        setData(data);
        if (data.unseen) setOpen(true);
      })
      .catch(() => {});
  }, []);

  const dismiss = async () => {
    setOpen(false);
    try {
      await api.post("/changelog/seen");
    } catch {
      // silent — modal still closes
    }
  };

  if (!data || !data.entries?.length) return null;
  const entry = data.entries[0];

  return (
    <Dialog open={open} onOpenChange={(v) => !v && dismiss()}>
      <DialogContent
        className="bg-[#0a0a0a] border-white/10 text-white max-w-2xl p-0 overflow-hidden"
        data-testid="changelog-modal"
      >
        <div className="bg-gradient-to-br from-yellow-500/15 via-purple-500/10 to-cyan-500/10 px-6 py-5 border-b border-white/10">
          <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-widest text-yellow-300/80 mb-2">
            <Sparkles className="w-3.5 h-3.5" />
            {data.version}
          </div>
          <h2 className="text-2xl font-semibold text-white"><DialogTitle asChild><span>{entry.title}</span></DialogTitle></h2>
          {entry.tagline && (
            <p className="text-sm text-zinc-300 mt-1">{entry.tagline}</p>
          )}
        </div>

        <div className="px-6 py-5 max-h-[60vh] overflow-y-auto">
          <div className="space-y-4">
            {entry.highlights.map((h, i) => {
              const Icon = ICONS[h.icon] || Sparkles;
              return (
                <div
                  key={h.title}
                  className="flex gap-3 group hover:bg-white/[0.03] -mx-2 px-2 py-2 rounded-sm transition-colors"
                  data-testid={`changelog-item-${i}`}
                >
                  <div className="w-9 h-9 rounded-sm bg-purple-500/15 border border-purple-400/30 flex items-center justify-center shrink-0">
                    <Icon className="w-4 h-4 text-purple-300" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-white text-sm">{h.title}</div>
                    <div className="text-xs text-zinc-400 mt-1 leading-relaxed">{h.body}</div>
                    {h.link && (
                      <button
                        onClick={() => { dismiss(); nav(h.link); }}
                        data-testid={`changelog-cta-${i}`}
                        className="mt-2 text-[11px] font-mono uppercase tracking-widest text-purple-300 hover:text-purple-200 inline-flex items-center gap-1"
                      >
                        {h.link_label || "Try it"} <ArrowRight className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="px-6 py-4 border-t border-white/10 flex items-center justify-between gap-3 bg-black/40">
          <div className="text-[11px] text-zinc-500">
            You can revisit this anytime under <span className="text-zinc-300">Help → What's new</span>.
          </div>
          <Button
            onClick={dismiss}
            data-testid="changelog-dismiss"
            className="bg-yellow-500 text-black hover:bg-yellow-400 rounded-sm font-medium"
          >
            Got it
          </Button>
        </div>

        <button
          onClick={dismiss}
          aria-label="Close"
          data-testid="changelog-close-x"
          className="absolute top-3 right-3 w-7 h-7 rounded-sm hover:bg-white/10 flex items-center justify-center text-zinc-400 hover:text-white"
        >
          <X className="w-4 h-4" />
        </button>
      </DialogContent>
    </Dialog>
  );
}
