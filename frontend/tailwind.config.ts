import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./features/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-manrope)", "Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["var(--font-space-grotesk)", "Arial Black", "sans-serif"]
      },
      colors: {
        brandBlue: {
          50: "#eef7f1",
          100: "#dcefe3",
          200: "#b9dec8",
          400: "#3d8b66",
          500: "#176b4d",
          600: "#0f573e",
          700: "#0c4533"
        },
        heroDark: {
          900: "#123a33",
          950: "#092b27"
        },
        rent: {
          canvas: "#f5f3eb",
          surface: "#fffdf7",
          muted: "#ece9df",
          "surface-muted": "#f0eee6",
          ink: "#13352f",
          secondary: "#38564f",
          subtle: "#6d7f79",
          line: "#dddcd2",
          strong: "#c9c8bc",
          primary: "#176b4d",
          "primary-hover": "#0f573e",
          "primary-subtle": "#dcefe3",
          accent: "#c9f269",
          "accent-hover": "#b8e653",
          "accent-subtle": "#eef9cf",
          coral: "#ff7657",
          yellow: "#ffd34e"
        }
      },
      borderRadius: {
        control: "0.75rem",
        card: "1.25rem",
        "2xl": "1rem",
        "3xl": "1.5rem",
        "4xl": "2rem"
      },
      boxShadow: {
        glass: "5px 5px 0 #092b27",
        "glass-sm": "3px 3px 0 #092b27",
        "card-hover": "8px 8px 0 #092b27",
        "card-elevated": "10px 10px 0 #092b27",
        "glow-teal": "6px 6px 0 #092b27",
        "glow-blue": "6px 6px 0 #092b27",
        "glow-indigo": "6px 6px 0 #092b27",
        overlay: "12px 12px 0 rgba(9, 43, 39, 0.96)"
      },
      maxWidth: {
        product: "80rem"
      },
      keyframes: {
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-8px)" }
        },
        floatSlow: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-10px)" }
        },
        floatReverse: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(8px)" }
        },
        "pulse-glow": {
          "0%, 100%": { opacity: "0.6", transform: "scale(1)" },
          "50%": { opacity: "1", transform: "scale(1.05)" }
        },
        shimmer: {
          "100%": { transform: "translateX(100%)" }
        },
        "slide-up-fade": {
          "0%": { opacity: "0", transform: "translateY(16px)" },
          "100%": { opacity: "1", transform: "translateY(0)" }
        },
        "scale-in": {
          "0%": { opacity: "0", transform: "scale(0.96)" },
          "100%": { opacity: "1", transform: "scale(1)" }
        },
        drift: {
          "0%, 100%": { transform: "translate3d(0, 0, 0) rotate(0deg)" },
          "50%": { transform: "translate3d(18px, -14px, 0) rotate(4deg)" }
        },
        marquee: {
          from: { transform: "translateX(0)" },
          to: { transform: "translateX(-50%)" }
        }
      },
      animation: {
        float: "float 6s ease-in-out infinite",
        "float-slow": "floatSlow 4s ease-in-out infinite",
        "float-reverse": "floatReverse 5s ease-in-out infinite",
        "pulse-glow": "pulse-glow 3s ease-in-out infinite",
        "slide-up": "slide-up-fade 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards",
        "scale-in": "scale-in 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards",
        drift: "drift 10s ease-in-out infinite",
        marquee: "marquee 28s linear infinite"
      }
    }
  },
  plugins: []
};

export default config;
