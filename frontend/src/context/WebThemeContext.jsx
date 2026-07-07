import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { applyTheme } from "@/theme/web-tokens";
import safeStorage from "@/lib/safeStorage";

const WebThemeCtx = createContext({ theme: "dark", setTheme: () => {} });

const STORAGE_KEY = "theme";
const isValidTheme = (v) => v === "dark" || v === "light";

function readInitialTheme() {
  // Default to dark for the marketing site brand identity. Only honor a user's
  // explicit prior choice (via the theme toggle). OS-level `prefers-color-scheme`
  // is intentionally ignored so the brand doesn't render "white-glare" on first
  // paint for the majority of visitors. The validator guards against a tampered
  // localStorage value silently breaking applyTheme().
  return safeStorage.get(STORAGE_KEY, { fallback: "dark", validator: isValidTheme });
}

export function WebThemeProvider({ children, forceDark = false }) {
  const [theme, setThemeState] = useState(() => (forceDark ? "dark" : readInitialTheme()));

  useEffect(() => {
    applyTheme(forceDark ? "dark" : theme);
  }, [theme, forceDark]);

  const setTheme = useCallback((t) => {
    if (!isValidTheme(t)) return;
    setThemeState(t);
    safeStorage.set(STORAGE_KEY, t);
  }, []);

  const value = useMemo(() => ({
    theme: forceDark ? "dark" : theme,
    setTheme,
    toggle: () => setTheme(theme === "dark" ? "light" : "dark"),
  }), [theme, forceDark, setTheme]);

  return <WebThemeCtx.Provider value={value}>{children}</WebThemeCtx.Provider>;
}

export function useWebTheme() {
  return useContext(WebThemeCtx);
}
