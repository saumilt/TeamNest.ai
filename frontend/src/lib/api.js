import axios from "axios";

const BASE = process.env.REACT_APP_BACKEND_URL;
export const API = `${BASE}/api`;

/**
 * Auth strategy (v2):
 *   - The server sets an HttpOnly `tn_session` cookie on login/signup/demo.
 *   - axios uses `withCredentials: true` so every HTTP request carries the
 *     cookie automatically — we never touch the token in JS for HTTP.
 *   - For WebSocket upgrades (cookies can't be reliably attached to a WS
 *     handshake across browsers) we call `/auth/ws-token` to mint a short-
 *     lived JWT and pass it in the WS query string.
 *
 * We intentionally do NOT use localStorage for the session token any more.
 * The exported helpers below are kept as no-ops / thin shims so the rest of
 * the codebase keeps working without churn.
 */
export const getToken = () => null;
export const setToken = () => {};
export const clearToken = () => {};

export const api = axios.create({ baseURL: API, withCredentials: true });

// Pages that don't require a session — they must not be force-redirected to
// the landing page when `/auth/me` returns 401 (the AuthProvider hits that
// endpoint on every load to detect a logged-in cookie).
const PUBLIC_PATHS = [
  "/",
  "/pricing",
  "/product",
  "/templates",
  "/showcase",
  "/dev-os-guide",
  "/employees-info",
  "/changelog",
  "/login",
  "/signup",
  "/reset-password",
  "/waitlist",
  "/invite",
  "/downloads",
  "/privacy",
  "/terms",
  "/support",
];
// Keep in sync with the public (non-AppShell) routes declared in App.js.
const PUBLIC_PREFIXES = ["/join/", "/s/", "/p/", "/share/", "/call/", "/drop/", "/demo/"];

function isPublicPath(pathname) {
  // Normalize trailing slash so `/downloads` and `/downloads/` both match.
  const p = pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  if (PUBLIC_PATHS.includes(p)) return true;
  return PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err?.response?.status === 401) {
      if (!isPublicPath(window.location.pathname)) {
        window.location.href = "/";
      }
    }
    return Promise.reject(err);
  },
);

/** Mint a fresh 5-minute WS token from the cookie session. */
export async function getWsToken() {
  const { data } = await api.get("/auth/ws-token");
  return data.token;
}

export const wsUrl = (chatId, token) => {
  const url = BASE.replace(/^http/, "ws");
  return `${url}/api/ws/${chatId}?token=${encodeURIComponent(token)}`;
};
