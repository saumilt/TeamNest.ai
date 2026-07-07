import { Star, Check } from "lucide-react";
import { ALL_MODELS } from "./constants";

/* Multi-model toggle chips. The favorite is always preselected; deselecting
 * down to zero is prevented by the parent. */
export default function ModelComparePicker({ selected, favorite, onToggle }) {
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
