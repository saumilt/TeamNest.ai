import { Star } from "lucide-react";
import {
        Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ALL_MODELS } from "./constants";

/* The "default AI" picker — sets the user's favorite_ai_model in preferences
 * and also resets the multi-model selection back to just that one model. */
export default function FavoritePicker({ favorite, savingFavorite, onChange }) {
        return (
                <div className="flex items-center gap-2 mb-3 flex-wrap">
                        <Star className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400" />
                        <span className="label-mono text-yellow-300">DEFAULT AI ·</span>
                        <Select value={favorite} onValueChange={onChange}>
                                <SelectTrigger
                                        data-testid="favorite-ai-select"
                                        className="h-7 w-[140px] bg-[#0a0a0a] border-white/10 rounded-sm text-xs font-mono uppercase tracking-widest"
                                >
                                        <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-[#121214] border-white/10">
                                        {ALL_MODELS.map((m) => (
                                                <SelectItem
                                                        key={m.key}
                                                        value={m.key}
                                                        className="text-xs font-mono uppercase tracking-widest"
                                                >
                                                        {m.name}{m.fast ? " ⚡" : ""}
                                                </SelectItem>
                                        ))}
                                </SelectContent>
                        </Select>
                        <span className="text-[10px] text-zinc-500 font-mono">
                                {savingFavorite ? "saving…" : "(saved for you · used automatically)"}
                        </span>
                </div>
        );
}
