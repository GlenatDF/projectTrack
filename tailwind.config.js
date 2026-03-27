/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        base:    "var(--color-base)",
        surface: "var(--color-surface)",
        panel:   "var(--color-panel)",
        card:    "var(--color-card)",
        hover:   "var(--color-hover)",
        border:  "var(--color-border)",
        "border-subtle": "var(--color-border-subtle)",
      },
      fontSize: {
        "2xs": ["11px", { lineHeight: "1.4" }],
      },
    },
  },
  plugins: [],
};
