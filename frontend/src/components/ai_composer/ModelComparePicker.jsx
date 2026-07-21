import { Star, Check, Lock, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { ALL_MODELS } from "./constants";

/* Multi-model toggle chips. The favorite is always preselected; deselecting
 * down to zero is prevented by the parent.
 *
 * When `locked` (free plan, no comparison entitlement) we replace the chips
 * with a slim upgrade banner — the single-model favorite still works. */
export default function ModelComparePicker({ selected, favorite, onToggle, locked = false }) {
        if (locked) {
                return (
                        <div
                                data-testid="compare-upgrade-banner"
                                className="mb-4 flex items-center justify-between gap-3 border border-yellow-500/25 bg-yellow-500/[0.05] rounded-sm px-3 py-2.5"
                        >
                                <div className="flex items-center gap-2 min-w-0">
                                        <Lock className="w-3.5 h-3.5 text-yellow-400 shrink-0" />
                                        <span className="text-[11px] text-zinc-300 leading-snug">
                                                Compare multiple AI models side-by-side on{" "}
                                                <span className="text-yellow-300 font-semibold">Pro</span>.
                                        </span>
                                </div>
                                <Link
                                        to="/billing"
                                        data-testid="compare-upgrade-btn"
                                        className="shrink-0 bg-yellow-500 text-black hover:bg-yellow-400 text-[10px] font-mono uppercase tracking-widest px-2.5 py-1.5 rounded-sm inline-flex items-center gap-1.5"
                                >
                                        <Sparkles className="w-3 h-3" /> Upgrade to compare
                                </Link>
                        </div>
                );
        }
        return (
                <>
                        <div className="label-mono mb-2">
                                ADDITIONAL TOOLS TO COMPARE
                                <span className="ml-1 normal-case tracking-normal text-zinc-500">
                                        (optional · click to add for side-by-side)
                                </span>
                        </div>
                        <div className="flex flex-wrap gap-2 mb-4">
                                {ALL_MODELS.map((m) => {
                                        const isOn = selected.has(m.key);
                                        const isFav = m.key === favorite;
                                        return (
                                                <button
                                                        key={m.key}
                                                        data-testid={`model-toggle-${m.key}`}
                                                        onClick={() => onToggle(m.key)}
                                                        className={`px-3 py-1.5 text-xs font-mono uppercase tracking-widest rounded-sm border transition-colors flex items-center gap-1.5 ${
                                                                isOn
                                                                        ? "bg-yellow-500 text-black border-yellow-500"
                                                                        : "border-white/10 text-zinc-400 hover:border-yellow-500/30 hover:text-yellow-200"
                                                        }`}
                                                >
                                                        {isFav && <Star className={`w-3 h-3 ${isOn ? "fill-black" : "fill-yellow-400 text-yellow-400"}`} />}
                                                        {m.name}
                                                        {isOn && !isFav && <Check className="w-3 h-3" />}
                                                </button>
                                        );
                                })}
                        </div>
                </>
        );
}
