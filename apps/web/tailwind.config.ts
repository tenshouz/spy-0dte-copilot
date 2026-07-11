import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

/**
 * Design tokens for the "terminal" theme — see src/app/globals.css for the
 * CSS custom properties these map to. Palette rationale (per PRD Section 10.1):
 * a near-black slate background (not pure #000, which flattens depth on real
 * monitors), a single desaturated blue for structural chrome, and signal
 * colors reserved ONLY for directional bias (bull green / bear red / wait amber)
 * so color always means something rather than decorating.
 */
const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        panel: {
          DEFAULT: "hsl(var(--panel))",
          border: "hsl(var(--panel-border))",
          hover: "hsl(var(--panel-hover))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        bull: {
          DEFAULT: "hsl(var(--bull))",
          muted: "hsl(var(--bull-muted))",
        },
        bear: {
          DEFAULT: "hsl(var(--bear))",
          muted: "hsl(var(--bear-muted))",
        },
        wait: {
          DEFAULT: "hsl(var(--wait))",
          muted: "hsl(var(--wait-muted))",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      fontVariantNumeric: {
        tabular: "tabular-nums",
      },
      keyframes: {
        "pulse-dot": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.35" },
        },
      },
      animation: {
        "pulse-dot": "pulse-dot 2s ease-in-out infinite",
      },
    },
  },
  plugins: [tailwindcssAnimate],
};

export default config;
