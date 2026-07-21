import { useEffect, useMemo, useState } from "react";
import { Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

import { ALL_MODELS, FALLBACK_FAVORITE } from "./ai_composer/constants";
import PreflightBanner from "./ai_composer/PreflightBanner";
import ImageAttachments from "./ai_composer/ImageAttachments";
import FavoritePicker from "./ai_composer/FavoritePicker";
import MemoryModeRow from "./ai_composer/MemoryModeRow";
import ContextPanel from "./ai_composer/ContextPanel";
import ModelComparePicker from "./ai_composer/ModelComparePicker";

/**
 * AI research composer — thin orchestrator over `components/ai_composer/*`.
 *
 * Responsible for owning the high-level state (text, selected models,
 * memory mode, extra context, preflight) and delegating individual UI
 * sections to small focused sub-components.  Was a 350+ LOC monolith
 * before; now under 150.
 */
export default function AIComposer({
        chatId,
        defaultModels,
        initialText = "",
        imageAttachments = [],
        onSubmit,
        onCancel,
        forceMulti = false,
        comparisonAllowed = true,
}) {
        const [text, setText] = useState(initialText);
        const [favorite, setFavorite] = useState(FALLBACK_FAVORITE);
        const [selected, setSelected] = useState(new Set([FALLBACK_FAVORITE]));
        const [submitting, setSubmitting] = useState(false);
        const [savingFavorite, setSavingFavorite] = useState(false);
        const [memoryMode, setMemoryMode] = useState("chat");
        const [extraContext, setExtraContext] = useState("");
        const [contextOpen, setContextOpen] = useState(false);
        const [preflight, setPreflight] = useState(null);

        // Per-chat AI billing preflight — tells the user who'll be charged and
        // whether AI is allowed at all before they type a single word.
        useEffect(() => {
                if (!chatId) return;
                let cancelled = false;
                api.get(`/chats/${chatId}/ai-preflight?estimated_credits=20`)
                        .then(({ data }) => { if (!cancelled) setPreflight(data); })
                        .catch(() => {});
                return () => { cancelled = true; };
        }, [chatId]);

        // Load user's favorite AI tool. Default selection = favorite only
        // (single-tool fast path).  Honor explicit multi-model pre-selection
        // when `forceMulti` is true (e.g. research re-runs).
        useEffect(() => {
                let cancelled = false;
                (async () => {
                        try {
                                const { data } = await api.get("/user/preferences");
                                if (cancelled) return;
                                const fav = data?.favorite_ai_model || FALLBACK_FAVORITE;
                                setFavorite(fav);
                                if (comparisonAllowed && forceMulti && Array.isArray(defaultModels) && defaultModels.length >= 2) {
                                        setSelected(new Set(defaultModels));
                                } else {
                                        setSelected(new Set([fav]));
                                }
                        } catch (err) {
                                console.warn("[ai-composer] preferences fetch failed", err);
                                setSelected(new Set([FALLBACK_FAVORITE]));
                        }
                })();
                return () => { cancelled = true; };
        }, []);

        const toggle = (key) => {
                if (!comparisonAllowed) return;            // paid-only: single model
                const next = new Set(selected);
                if (next.has(key)) {
                        if (next.size <= 1) return;          // keep at least one
                        next.delete(key);
                } else {
                        next.add(key);
                }
                setSelected(next);
        };

        const setFavoriteAndSelect = async (newFav) => {
                setFavorite(newFav);
                setSelected(new Set([newFav]));
                setSavingFavorite(true);
                try {
                        await api.patch("/user/preferences", { favorite_ai_model: newFav, favorite_models: [] });
                        toast.success(`Default AI · ${ALL_MODELS.find((m) => m.key === newFav)?.name || newFav}`);
                } catch (err) {
                        console.warn("[ai-composer] save favorite failed", err);
                } finally {
                        setSavingFavorite(false);
                }
        };

        const submit = async () => {
                if ((!text.trim() && imageAttachments.length === 0) || selected.size === 0) return;
                if (preflight && !preflight.allowed) {
                        toast.error(preflight.reason || "AI is blocked in this group.");
                        return;
                }
                setSubmitting(true);
                try {
                        const enrichedText = extraContext.trim()
                                ? `[Extra context provided by user:\n${extraContext.trim()}\n]\n\n${text}`
                                : text;
                        await onSubmit(
                                enrichedText,
                                Array.from(selected),
                                { memoryMode, extraContext: extraContext.trim() || null },
                        );
                } finally {
                        setSubmitting(false);
                }
        };

        const buttonLabel = useMemo(() => {
                if (submitting) return "Running…";
                if (selected.size === 1) {
                        const m = ALL_MODELS.find((x) => x.key === [...selected][0]);
                        return `Ask ${m?.name || "AI"}`;
                }
                return `Ask ${selected.size} models · compare`;
        }, [submitting, selected]);

        const disabled = submitting
                || (!text.trim() && imageAttachments.length === 0)
                || selected.size === 0;

        return (
                <div
                        className="border border-yellow-500/30 bg-yellow-500/[0.03] rounded-sm p-4 fade-in"
                        data-testid="ai-composer"
                >
                        <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2">
                                        <Sparkles className="w-4 h-4 text-yellow-400" />
                                        <div className="label-mono text-yellow-400">AI RESEARCH COMPOSER</div>
                                </div>
                                <button
                                        onClick={onCancel}
                                        data-testid="close-ai-composer"
                                        className="text-zinc-500 hover:text-white"
                                >
                                        <X className="w-4 h-4" />
                                </button>
                        </div>

                        <PreflightBanner preflight={preflight} />

                        <Textarea
                                data-testid="ai-question-input"
                                value={text}
                                onChange={(e) => setText(e.target.value)}
                                placeholder={
                                        imageAttachments.length > 0
                                                ? "Ask anything about the photo… (leave blank for general description)"
                                                : "Compare US vs EU for our Pro tier launch. Include market size, pricing tolerance, and compliance lift…"
                                }
                                className="bg-[#0a0a0a] border-white/10 rounded-sm min-h-[80px] mb-3"
                        />

                        <ImageAttachments attachments={imageAttachments} />

                        <FavoritePicker
                                favorite={favorite}
                                savingFavorite={savingFavorite}
                                onChange={setFavoriteAndSelect}
                        />

                        <MemoryModeRow
                                memoryMode={memoryMode}
                                onMemoryModeChange={setMemoryMode}
                                extraContext={extraContext}
                                contextOpen={contextOpen}
                                onToggleContext={() => setContextOpen((v) => !v)}
                        />

                        <ContextPanel
                                open={contextOpen}
                                value={extraContext}
                                onChange={setExtraContext}
                                onClear={() => setExtraContext("")}
                        />

                        <ModelComparePicker
                                selected={selected}
                                favorite={favorite}
                                onToggle={toggle}
                                locked={!comparisonAllowed}
                        />

                        <div className="flex items-center justify-between gap-2">
                                <div className="text-[10px] font-mono text-zinc-500">
                                        {selected.size === 1
                                                ? "Single-tool mode · no synthesis, fastest reply"
                                                : `Multi-tool mode · auto-pick best (favors ${ALL_MODELS.find((m) => m.key === favorite)?.name}) + synthesize`}
                                </div>
                                <div className="flex gap-2">
                                        <Button
                                                variant="outline"
                                                onClick={onCancel}
                                                className="border-white/10 bg-transparent hover:bg-white/5 rounded-sm font-mono uppercase text-[10px] tracking-widest h-9"
                                        >
                                                Cancel
                                        </Button>
                                        <Button
                                                data-testid="ai-research-submit"
                                                onClick={submit}
                                                disabled={disabled}
                                                className="bg-yellow-500 text-black hover:bg-yellow-400 rounded-sm font-mono uppercase text-[10px] tracking-widest h-9"
                                        >
                                                <Sparkles className="w-3 h-3 mr-1.5" />
                                                {buttonLabel}
                                        </Button>
                                </div>
                        </div>
                </div>
        );
}
