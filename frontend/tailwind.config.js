/** @type {import('tailwindcss').Config} */
module.exports = {
	darkMode: ["class"],
	content: ["./src/**/*.{js,jsx,ts,tsx}", "./public/index.html"],
	theme: {
		extend: {
			borderRadius: {
				lg: "var(--radius)",
				md: "calc(var(--radius) - 2px)",
				sm: "calc(var(--radius) - 4px)",
				bubble: "18px",
				pill: "22px",
				card: "16px",
			},
			colors: {
				// -- TeamNest v2 design tokens (Feb 2026) --
				bg: "#0A0A0E",
				surface: "#17171E",
				"surface-2": "#1F1F27",
				"surface-3": "#272731",
				hairline: "rgba(255,255,255,0.08)",
				ink: "#F5F5F7",
				"ink-dim": "rgba(245,245,247,0.62)",
				"ink-mute": "rgba(245,245,247,0.40)",
				brand: {
					DEFAULT: "#FFD23F",
					deep: "#E0A800",
					tint: "rgba(255,210,63,0.14)",
				},
				ai: {
					DEFAULT: "#B794F4",
					tint: "rgba(183,148,244,0.16)",
				},
				"tn-green": "#34D399",
				"tn-red": "#F87171",
				"bubble-out": "#3A2E14",
				// -- legacy shadcn tokens preserved so existing components compile --
				background: "hsl(var(--background))",
				foreground: "hsl(var(--foreground))",
				card: { DEFAULT: "hsl(var(--card))", foreground: "hsl(var(--card-foreground))" },
				popover: { DEFAULT: "hsl(var(--popover))", foreground: "hsl(var(--popover-foreground))" },
				primary: { DEFAULT: "hsl(var(--primary))", foreground: "hsl(var(--primary-foreground))" },
				secondary: { DEFAULT: "hsl(var(--secondary))", foreground: "hsl(var(--secondary-foreground))" },
				muted: { DEFAULT: "hsl(var(--muted))", foreground: "hsl(var(--muted-foreground))" },
				destructive: { DEFAULT: "hsl(var(--destructive))", foreground: "hsl(var(--destructive-foreground))" },
				border: "hsl(var(--border))",
				input: "hsl(var(--input))",
				ring: "hsl(var(--ring))",
				chart: {
					1: "hsl(var(--chart-1))",
					2: "hsl(var(--chart-2))",
					3: "hsl(var(--chart-3))",
					4: "hsl(var(--chart-4))",
					5: "hsl(var(--chart-5))",
				},
			},
			fontFamily: {
				sans: ["Inter", "system-ui", "-apple-system", "sans-serif"],
				mono: ['"JetBrains Mono"', "ui-monospace", "monospace"],
			},
			keyframes: {
				"accordion-down": { from: { height: "0" }, to: { height: "var(--radix-accordion-content-height)" } },
				"accordion-up": { from: { height: "var(--radix-accordion-content-height)" }, to: { height: "0" } },
				"tap-press": { "0%": { transform: "scale(1)" }, "50%": { transform: "scale(0.97)" }, "100%": { transform: "scale(1)" } },
			},
			animation: {
				"accordion-down": "accordion-down 0.2s ease-out",
				"accordion-up": "accordion-up 0.2s ease-out",
				"tap-press": "tap-press 40ms ease-out",
			},
		},
	},
	plugins: [require("tailwindcss-animate"), require("@tailwindcss/typography")],
};
