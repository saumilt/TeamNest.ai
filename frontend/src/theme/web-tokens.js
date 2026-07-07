// Marketing site design tokens (dark + light themes).
// Mirrors mobile app palette + adds light variant for the marketing site.

export const darkColors = {
  bg: "#0A0A0E",
  bg2: "#111116",
  surface: "#17171E",
  surface2: "#1F1F27",
  surface3: "#272731",
  hairline: "rgba(255,255,255,0.08)",
  hairlineStrong: "rgba(255,255,255,0.14)",
  text: "#F5F5F7",
  textDim: "rgba(245,245,247,0.62)",
  textMute: "rgba(245,245,247,0.40)",
  brand: "#FFD23F",
  brandTint: "rgba(255,210,63,0.14)",
  ai: "#B794F4",
  aiTint: "rgba(183,148,244,0.16)",
  green: "#34D399",
  red: "#F87171",
};

export const lightColors = {
  bg: "#FAFAF7",
  bg2: "#F4F3EE",
  surface: "#FFFFFF",
  surface2: "#F4F3EE",
  surface3: "#EAE8E0",
  hairline: "rgba(10,10,14,0.08)",
  hairlineStrong: "rgba(10,10,14,0.16)",
  text: "#0A0A0E",
  textDim: "rgba(10,10,14,0.62)",
  textMute: "rgba(10,10,14,0.40)",
  brand: "#FFD23F",
  brandTint: "rgba(255,210,63,0.14)",
  ai: "#B794F4",
  aiTint: "rgba(183,148,244,0.16)",
  green: "#10B981",
  red: "#DC2626",
};

export const radii = {
  card: 20,
  button: 12,
  input: 14,
  pill: 999,
};

export const motion = {
  pageEnter: "200ms cubic-bezier(.2,.7,.2,1)",
  reveal: "280ms cubic-bezier(.2,.7,.2,1)",
  press: "80ms cubic-bezier(.2,.7,.2,1)",
};

/** Inject CSS variables for the given theme onto :root. */
export function applyTheme(theme = "dark") {
  if (typeof document === "undefined") return;
  const c = theme === "light" ? lightColors : darkColors;
  const root = document.documentElement;
  Object.entries(c).forEach(([k, v]) => {
    // camelCase → kebab-case
    const cssVar = "--w-" + k.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase());
    root.style.setProperty(cssVar, v);
  });
  root.setAttribute("data-theme", theme);
}
