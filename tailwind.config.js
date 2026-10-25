/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        display: ["Cinzel", "Marcellus", "serif"],
      },
      colors: {
        /* Shastra palette — existing utility names remapped so the whole
           app re-themes consistently:
           violet-*  → 24K brushed gold
           fuchsia-* → pale champagne gold
           cyan-*    → royal cyan energy */
        violet: {
          50: "#fdf8e7",
          100: "#f9ecc3",
          200: "#f5d97e",
          300: "#eec95c",
          400: "#e3b944",
          500: "#d4af37",
          600: "#b8932c",
          700: "#93751f",
          800: "#6e5716",
          900: "#4a3a0e",
          950: "#2c2308",
        },
        fuchsia: {
          50: "#fefbf0",
          100: "#fcf3d7",
          200: "#f9e6ae",
          300: "#f5d97e",
          400: "#f0cd5f",
          500: "#e9be45",
          600: "#cfa231",
          700: "#a67f24",
          800: "#7a5c1a",
          900: "#523d11",
          950: "#33260a",
        },
        cyan: {
          50: "#eefaff",
          100: "#d9f4ff",
          200: "#b5ecff",
          300: "#82dfff",
          400: "#39d5ff",
          500: "#12c2f5",
          600: "#069cd1",
          700: "#087ca7",
          800: "#0c6485",
          900: "#10526d",
          950: "#0a3549",
        },
        neon: {
          cyan: "#39d5ff",
          violet: "#d4af37",
          magenta: "#f5d97e",
        },
        ink: {
          950: "#030708",
          900: "#071214",
          800: "#0b1d20",
          700: "#123034",
        },
      },
      animation: {
        "spin-slow": "spin 8s linear infinite",
        "spin-slower": "spin 14s linear infinite reverse",
        "pulse-soft": "pulseSoft 3s ease-in-out infinite",
        breathe: "breathe 4s ease-in-out infinite",
        float: "float 6s ease-in-out infinite",
        shimmer: "shimmer 2.5s linear infinite",
      },
      keyframes: {
        pulseSoft: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.45" },
        },
        breathe: {
          "0%, 100%": { transform: "scale(1)" },
          "50%": { transform: "scale(1.06)" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-8px)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
    },
  },
  plugins: [],
};
