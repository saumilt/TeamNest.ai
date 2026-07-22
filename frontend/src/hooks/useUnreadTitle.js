import { useEffect } from "react";
import { api } from "@/lib/api";

const BASE_TITLE = "TeamNest.ai";

/**
 * Keeps the document title in sync with total unread chat messages, e.g.
 * "(3) TeamNest.ai". This powers the browser tab, the installed PWA window,
 * AND the native desktop (Electron) unread badge, which parses the leading
 * "(N)" from the window title — one source of truth for all surfaces.
 */
export default function useUnreadTitle(enabled = true) {
  useEffect(() => {
    if (!enabled) return undefined;
    let stopped = false;
    let timer;

    const apply = (count) => {
      const n = Number(count) || 0;
      document.title = n > 0 ? `(${n > 99 ? "99+" : n}) ${BASE_TITLE}` : BASE_TITLE;
      // Bridge for the Electron shell (no-op on web/PWA).
      if (typeof window !== "undefined" && window.desktop?.setBadge) {
        try { window.desktop.setBadge(n); } catch { /* noop */ }
      }
    };

    const tick = async () => {
      try {
        const { data } = await api.get("/chats");
        const total = (Array.isArray(data) ? data : []).reduce(
          (sum, c) => sum + (Number(c.unread_count) || 0),
          0,
        );
        if (!stopped) apply(total);
      } catch {
        /* offline / auth transition — leave title as-is */
      }
      if (!stopped) timer = setTimeout(tick, 25000);
    };

    tick();
    const onVisible = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      document.title = BASE_TITLE;
    };
  }, [enabled]);
}
