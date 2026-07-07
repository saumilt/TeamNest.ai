/* Renders live cursor dots + name tags for remote peers on a Dev OS tab.
 *
 * Wraps any container as `position: relative` — children render normally; the
 * overlay is absolute and pointer-events-none so it can't block clicks.
 *
 * Props:
 *   peers:    array from useDevOsPresence({ user_id, name, color, cursor })
 *   tab:      string — only peers whose cursor.tab matches show up
 *   onMove:   (x, y) => void  — emits NORMALIZED 0..1 coords relative to box
 */
import { useRef } from "react";
import { MousePointer2 } from "lucide-react";

export default function PresenceLayer({ peers, tab, onMove, children }) {
        const boxRef = useRef(null);

        const handleMove = (e) => {
                if (!onMove) return;
                const el = boxRef.current;
                if (!el) return;
                const rect = el.getBoundingClientRect();
                if (rect.width === 0 || rect.height === 0) return;
                const x = (e.clientX - rect.left) / rect.width;
                const y = (e.clientY - rect.top) / rect.height;
                onMove(Math.max(0, Math.min(1, x)), Math.max(0, Math.min(1, y)));
        };

        const visiblePeers = (peers || []).filter(
                (p) => p.cursor && p.cursor.tab === tab,
        );

        return (
                <div
                        ref={boxRef}
                        onMouseMove={handleMove}
                        className="relative"
                        data-testid="presence-layer"
                >
                        {children}
                        <div className="pointer-events-none absolute inset-0 z-30" data-testid="presence-overlay">
                                {visiblePeers.map((p) => (
                                        <div
                                                key={p.user_id}
                                                className="absolute transition-transform duration-100 ease-out"
                                                style={{
                                                        left: `${p.cursor.x * 100}%`,
                                                        top: `${p.cursor.y * 100}%`,
                                                        transform: "translate(-2px, -2px)",
                                                }}
                                                data-testid={`presence-cursor-${p.user_id}`}
                                        >
                                                <MousePointer2
                                                        className="w-4 h-4"
                                                        style={{ color: p.color || "#fbbf24", fill: p.color || "#fbbf24" }}
                                                />
                                                <div
                                                        className="absolute left-3 top-3 px-1.5 py-0.5 rounded text-[10px] font-medium text-black whitespace-nowrap shadow-md"
                                                        style={{ backgroundColor: p.color || "#fbbf24" }}
                                                >
                                                        {p.name || "User"}
                                                </div>
                                        </div>
                                ))}
                        </div>
                </div>
        );
}

/** Small avatar bubble row showing all peers regardless of tab. Drop into
 *  AppBar or tab headers. */
export function PresenceBubbles({ peers, max = 5 }) {
        if (!peers || peers.length === 0) return null;
        const visible = peers.slice(0, max);
        const extra = peers.length - max;
        return (
                <div className="flex items-center -space-x-1.5" data-testid="presence-bubbles">
                        {visible.map((p) => (
                                <div
                                        key={p.user_id}
                                        title={p.name || "User"}
                                        className="w-6 h-6 rounded-full ring-2 ring-bg flex items-center justify-center text-[10px] font-bold text-black"
                                        style={{ backgroundColor: p.color || "#fbbf24" }}
                                        data-testid={`presence-bubble-${p.user_id}`}
                                >
                                        {(p.name || "?")[0].toUpperCase()}
                                </div>
                        ))}
                        {extra > 0 && (
                                <div className="w-6 h-6 rounded-full ring-2 ring-bg bg-surface-2 text-ink-dim flex items-center justify-center text-[10px] font-semibold">
                                        +{extra}
                                </div>
                        )}
                </div>
        );
}
