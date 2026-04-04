import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  "#fef2f2",
          100: "#fee2e2",
          200: "#fecaca",
          300: "#fca5a5",
          400: "#f87171",
          500: "#ef4444",
          600: "#cc1111",   // ACWG red
          700: "#b91c1c",
          800: "#991b1b",
          900: "#7f1d1d",
          950: "#450a0a",
        },
        navy: {
          50:  "#eff6ff",
          100: "#dbeafe",
          200: "#bfdbfe",
          300: "#93c5fd",
          400: "#60a5fa",
          500: "#3b82f6",
          600: "#1d4ed8",
          700: "#1e3a8a",   // ACWG navy
          800: "#1e3a6e",
          900: "#172554",
        },
        risk: {
          low:    "#22c55e",
          medium: "#f59e0b",
          high:   "#ef4444",
        },
      },
      fontFamily: {
        sans:    ["var(--font-geist-sans)", "system-ui", "sans-serif"],
        mono:    ["var(--font-geist-mono)", "monospace"],
        display: ["var(--font-display)", "system-ui", "sans-serif"],
      },
      animation: {
        "fade-in":   "fadeIn 0.3s ease-out",
        "slide-up":  "slideUp 0.3s ease-out",
        "pulse-slow":"pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
      },
      keyframes: {
        fadeIn:  { "0%": { opacity: "0" }, "100%": { opacity: "1" } },
        slideUp: { "0%": { opacity: "0", transform: "translateY(8px)" }, "100%": { opacity: "1", transform: "translateY(0)" } },
      },
    },
  },
  plugins: [],
};

export default config;
