/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        base: "#0d0f14",
        surface: "#161921",
        card: "#1e2130",
        hover: "#252837",
        border: "#2d3148",
      },
    },
  },
  plugins: [],
};
