import type { Config } from "tailwindcss";

/**
 * AtomicTracker palette — modeled on GitHub's primer color system.
 *
 * Strategy: override Tailwind's slate / brand / emerald / amber to GitHub's
 * actual hex values so existing utility classes (`bg-slate-50`, `text-slate-900`,
 * `bg-brand-600`, etc.) automatically render in GitHub's idiom — without
 * touching every component file.
 *
 * Reference: https://primer.style/foundations/color
 */
const config: Config = {
  darkMode: "media",
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // GitHub blue (used as our primary `brand`)
        brand: {
          50: "#ddf4ff",
          100: "#b6e3ff",
          200: "#80ccff",
          300: "#54aeff",
          400: "#218bff",
          500: "#0969da",
          600: "#0969da",
          700: "#0550ae",
          800: "#033d8b",
          900: "#0a3069",
        },
        // GitHub neutral grays — re-mapped onto Tailwind's `slate` keys
        slate: {
          50: "#f6f8fa", // canvas.subtle
          100: "#eaeef2", // canvas.inset
          200: "#d0d7de", // border.default (light)
          300: "#afb8c1", // border.muted
          400: "#8c959f", // fg.subtle
          500: "#6e7781", // fg.muted (light)
          600: "#57606a",
          700: "#424a53",
          800: "#30363d", // border.default (dark)
          900: "#161b22", // canvas.subtle (dark) — used for surfaces/cards
          950: "#0d1117", // canvas (dark) — page background
        },
        // GitHub success green (used as our `emerald`)
        emerald: {
          50: "#dafbe1",
          100: "#aceebb",
          200: "#6fdd8b",
          300: "#4ac26b",
          400: "#2da44e",
          500: "#1f883d",
          600: "#1a7f37",
          700: "#116329",
          800: "#044f1e",
          900: "#003d16",
        },
        // GitHub attention/warning yellow (used as our `amber`)
        amber: {
          50: "#fff8c5",
          100: "#fae17d",
          200: "#eac54f",
          300: "#d4a72c",
          400: "#bf8700",
          500: "#9a6700",
          600: "#7d4e00",
          700: "#633c01",
          800: "#4d2d00",
          900: "#3b2300",
        },
        // GitHub danger red (used as our `red`)
        red: {
          50: "#ffebe9",
          100: "#ffcecb",
          200: "#ffaba8",
          300: "#ff8182",
          400: "#fa4549",
          500: "#cf222e",
          600: "#a40e26",
          700: "#82071e",
          800: "#660018",
          900: "#4c0014",
        },
        accent: {
          500: "#bf8700",
          600: "#9a6700",
        },
      },
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Helvetica",
          "Arial",
          "sans-serif",
        ],
        mono: [
          "ui-monospace",
          "SFMono-Regular",
          "SF Mono",
          "Menlo",
          "Consolas",
          "Liberation Mono",
          "monospace",
        ],
      },
      borderRadius: {
        // GitHub uses 6-12px radii, never the chunky 16/24px we had
        DEFAULT: "6px",
        lg: "8px",
        xl: "12px",
        "2xl": "12px",
      },
    },
  },
  plugins: [],
};

export default config;
