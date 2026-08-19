import safeStorage from "@/lib/safeStorage";

// Which Home look the user sees. Explicit choice wins; brand-new accounts
// default to the guided "start" (Start Center) look.
const KEY = "tn:home:variant";
const NEW_USER_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export const HOME_LOOKS = [
  { value: "classic", label: "Classic", desc: "Dashboard overview with stats" },
  { value: "start", label: "Start Center", desc: "Big action cards for every feature" },
  { value: "ask", label: "Ask AI", desc: "Prompt-first, like ChatGPT" },
  { value: "focus", label: "Focus", desc: "Calm composer + jump back in, like Claude" },
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
  return isBrandNew(user) ? "start" : "classic";
}

export function setHomeVariant(v) {
  safeStorage.set(KEY, normalize(v) || "classic");
}

// Post-login landing route for this user's chosen/default Home look.
export function homeLanding(user) {
  return getHomeVariant(user) === "classic" ? "/chats" : "/dashboard";
}
