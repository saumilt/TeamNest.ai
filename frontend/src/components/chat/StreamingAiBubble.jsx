import { Sparkles, Loader2, Check } from "lucide-react";
import Bubble from "@/components/ui-v2/Bubble";

/**
 * StreamingAiBubble — shown for a running multi-model @ai question while its
 * answers stream in one model at a time (partial results). Each selected model
 * shows a spinner until its answer lands, then the answer appears. Replaced by
 * the final synthesized answer once every model has responded.
 */
export default function StreamingAiBubble({ message }) {
        const models = message?.metadata?.models || [];
        const partials = message?.metadata?.partials || [];
        const byKey = {};
        for (const p of partials) byKey[p.model_key] = p;
        const allIn = partials.length >= models.length && models.length > 0;

        return (
                <div className="flex gap-2.5" data-testid={`streaming-${message.id}`}>
                        <div className="w-8 shrink-0">
                                <div className="w-8 h-8 rounded-full bg-ai-tint flex items-center justify-center ring-1 ring-ai/40">
                                        <Sparkles className="w-4 h-4 text-ai" />
                                </div>
                        </div>
                        <div className="flex flex-col max-w-[78%] sm:max-w-[68%] items-start">
                                <span className="text-[12px] font-semibold text-violet-300 mb-1 px-1">
                                        AI · {partials.length}/{models.length} models responded
                                </span>
                                <Bubble variant="ai">
                                        <div className="space-y-2.5">
                                                {models.map((mk) => {
                                                        const p = byKey[mk];
                                                        return (
                                                                <div key={mk} data-testid={`streaming-model-${mk}`} className="text-[13px]">
                                                                        <div className="flex items-center gap-1.5 mb-0.5">
                                                                                {p ? (
                                                                                        <Check className="w-3 h-3 text-tn-green shrink-0" />
                                                                                ) : (
                                                                                        <Loader2 className="w-3 h-3 text-ai animate-spin shrink-0" />
                                                                                )}
                                                                                <span className="font-semibold text-ink">{p?.model_name || mk}</span>
                                                                                {!p && (
                                                                                        <span className="text-[11px] text-ink-mute italic">thinking…</span>
                                                                                )}
                                                                        </div>
                                                                        {p && (
                                                                                <div className="text-ink-dim whitespace-pre-wrap break-words pl-[18px] line-clamp-6">
                                                                                        {p.answer}
                                                                                </div>
                                                                        )}
                                                                </div>
                                                        );
                                                })}
                                        </div>
                                        {allIn && (
                                                <div className="mt-2 flex items-center gap-1.5 text-[11px] text-ai italic">
                                                        <Loader2 className="w-3 h-3 animate-spin" />
                                                        Synthesizing the best answer…
                                                </div>
                                        )}
                                </Bubble>
                        </div>
                </div>
        );
}
