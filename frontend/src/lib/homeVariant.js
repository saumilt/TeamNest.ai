import safeStorage from "@/lib/safeStorage";

// Which Home look the user sees. Explicit choice wins; brand-new accounts
// default to the guided "start" (Start Center) look.
const KEY = "tn:home:variant";
const NEW_USER_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export const HOME_LOOKS = [
  { value: "classic", label: "Chat View", desc: "Standard overview — chats, tasks & research" },
  { value: "start", label: "Start Center", desc: "Big action cards for every feature" },
  { value: "ask", label: "ChatGPT Layout", desc: "Prompt-first, like ChatGPT" },
  { value: "focus", label: "Claude Layout", desc: "Calm composer + jump back in, like Claude" },
];

const VALID = HOME_LOOKS.map((l) => l.value);

function normalize(v) {
  if (v === "new") return "start"; // migrate the original two-way flag
  return VALID.includes(v) ? v : null;
}

export function isBrandNew(user) {
  const c = user?.created_at;
  if (!c) return false;
  const t = new Date(c).getTime();
  if (!Number.isFinite(t)) return false;
  return Date.now() - t < NEW_USER_WINDOW_MS;
}

export function getHomeVariant(user) {
  const v = normalize(safeStorage.get(KEY));
  if (v) return v;
  // Default everyone (no stored choice) to the guided Start Center — the
  // "What do you want to do?" hub. Users can still switch looks.
  return "start";
}

export function setHomeVariant(v) {
  const nv = normalize(v) || "classic";
  safeStorage.set(KEY, nv);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("tn:home-variant", { detail: nv }));
  }
}

// Post-login landing route — always the Home page so users land directly on
// their chosen layout (Chat View / Start Center / ChatGPT / Claude).
export function homeLanding() {
  return "/dashboard";
}
