import { useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Wand2, Sparkles } from "lucide-react";
import { toast } from "sonner";

const ACTIONS = [
  { key: "fix_grammar", label: "Fix grammar" },
  { key: "make_professional", label: "Professional" },
  { key: "make_shorter", label: "Shorter" },
  { key: "make_detailed", label: "More detailed" },
  { key: "make_persuasive", label: "Persuasive" },
  { key: "make_diplomatic", label: "Diplomatic" },
  { key: "bullet_points", label: "Bullet points" },
  { key: "improve_tone", label: "Improve tone" },
  { key: "fact_check", label: "Fact-check" },
  { key: "translate", label: "Translate to Spanish" },
];

export default function AskAIDrawer({ open, onOpenChange, text, onApply }) {
  const [improved, setImproved] = useState("");
  const [busy, setBusy] = useState(false);
  const [lastAction, setLastAction] = useState(null);

  const run = async (action) => {
    setBusy(true);
    setLastAction(action);
    try {
      const { data } = await api.post("/ai/improve", {
        text,
        action,
        target_language: action === "translate" ? "Spanish" : "English",
      });
      setImproved(data.improved);
    } catch (e) {
      toast.error("AI improvement failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        className="bg-[#0a0a0a] border-white/10 text-white w-[480px] sm:max-w-[480px] p-0 flex flex-col"
        data-testid="ask-ai-drawer"
      >
        <SheetHeader className="px-6 pt-6 pb-3 border-b border-white/5 shrink-0">
          <SheetTitle className="font-display tracking-tight flex items-center gap-2">
            <Wand2 className="w-5 h-5 text-yellow-400" />
            Ask AI Before Posting
          </SheetTitle>
        </SheetHeader>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4 min-h-0">
          <div>
            <div className="label-mono mb-2">ORIGINAL</div>
            <div className="bg-[#121214] border border-white/10 rounded-sm p-3 text-sm text-zinc-300 whitespace-pre-wrap max-h-[200px] overflow-y-auto min-h-[64px]">
              {text || <span className="text-zinc-600">Type a message first.</span>}
            </div>
          </div>

          <div>
            <div className="label-mono mb-2">IMPROVE WITH</div>
            <div className="grid grid-cols-2 gap-2">
              {ACTIONS.map((a) => (
                <button
                  key={a.key}
                  data-testid={`improve-${a.key}`}
                  onClick={() => run(a.key)}
                  disabled={!text || busy}
                  className="text-left px-3 py-2 text-xs font-mono uppercase tracking-widest border border-white/10 hover:border-yellow-500/40 hover:bg-yellow-500/5 text-zinc-300 hover:text-yellow-200 rounded-sm disabled:opacity-30"
                >
                  {a.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="label-mono mb-2 flex items-center justify-between">
              <span>AI IMPROVED {lastAction ? `· ${lastAction.toUpperCase()}` : ""}</span>
              {busy && <span className="text-yellow-400">Working…</span>}
            </div>
            <div className="bg-black border border-yellow-500/20 rounded-sm p-3 text-sm text-zinc-100 whitespace-pre-wrap min-h-[120px]">
              {busy ? (
                <div className="space-y-2">
                  <div className="h-3 shimmer rounded-sm" />
                  <div className="h-3 shimmer rounded-sm w-4/5" />
                  <div className="h-3 shimmer rounded-sm w-3/5" />
                </div>
              ) : improved ? (
                improved
              ) : (
                <span className="text-zinc-500">Pick an action to see AI suggestions.</span>
              )}
            </div>
          </div>
        </div>

        {/* Sticky action footer — always visible */}
        <div className="border-t border-white/10 bg-[#0a0a0a] px-6 py-4 flex gap-2 shrink-0">
          <Button
            data-testid="apply-improved"
            onClick={() => onApply(improved)}
            disabled={!improved || busy}
            className="flex-1 bg-yellow-500 text-black hover:bg-yellow-400 rounded-sm font-mono uppercase text-xs tracking-widest h-10"
          >
            <Sparkles className="w-3.5 h-3.5 mr-1.5" />
            Replace message
          </Button>
          <Button
            data-testid="cancel-improve"
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="border-white/10 bg-transparent hover:bg-white/5 rounded-sm font-mono uppercase text-xs tracking-widest h-10"
          >
            Cancel
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
