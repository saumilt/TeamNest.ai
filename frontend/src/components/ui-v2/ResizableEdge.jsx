import { useCallback, useEffect, useRef } from "react";

/**
 * Vertical drag handle anchored to the right edge of a sidebar / panel.
 *
 * Props:
 *   onResize(nextWidth)   — called continuously while dragging
 *   minWidth, maxWidth    — clamp range in px
 *   side                  — "right" (default) drags rightward; "left" drags leftward
 *
 * Usage:
 *   <aside style={{ width: 240 }} className="relative ...">
 *     ... your sidebar content ...
 *     <ResizableEdge minWidth={64} maxWidth={420} onResize={setWidth} />
 *   </aside>
 *
 * The handle is a 4-px hit zone with a subtle hover/active highlight. It
 * grabs `mousedown` and listens on `window` for `mousemove` / `mouseup` so a
 * fast drag doesn't escape the element.
 */
export default function ResizableEdge({
  onResize,
  minWidth = 56,
  maxWidth = 480,
  side = "right",
  testid,
}) {
  const draggingRef = useRef(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  const onMove = useCallback((e) => {
    if (!draggingRef.current) return;
    const dx = e.clientX - startXRef.current;
    const delta = side === "right" ? dx : -dx;
    const next = Math.min(maxWidth, Math.max(minWidth, startWidthRef.current + delta));
    onResize(next);
  }, [onResize, minWidth, maxWidth, side]);

  const onUp = useCallback(() => {
    draggingRef.current = false;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  }, []);

  useEffect(() => {
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [onMove, onUp]);

  const onDown = (e) => {
    const parent = e.currentTarget.parentElement;
    if (!parent) return;
    startXRef.current = e.clientX;
    startWidthRef.current = parent.getBoundingClientRect().width;
    draggingRef.current = true;
    document.body.style.cursor = "ew-resize";
    document.body.style.userSelect = "none";
    e.preventDefault();
  };

  return (
    <div
      onMouseDown={onDown}
      data-testid={testid}
      role="separator"
      aria-orientation="vertical"
      title="Drag to resize"
      className={`absolute top-0 ${side === "right" ? "right-0" : "left-0"} h-full w-1 cursor-ew-resize z-20 hover:bg-brand/40 active:bg-brand/60 transition-colors`}
    />
  );
}
