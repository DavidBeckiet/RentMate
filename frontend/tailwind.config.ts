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
        sans: ["var(--font-plus-jakarta)", "Inter", "ui-sans-serif", "system-ui", "sans-serif"]
      },
      colors: {
        brandBlue: {
          50: "#f0f9ff",
          100: "#e0f2fe",
          500: "#0284c7",
          600: "#0369a1",
          700: "#075985"
        },
        heroDark: {
          900: "#030712",
          950: "#020617"
        },
        rent: {
          canvas: "#f8fafc",
          surface: "#ffffff",
          muted: "#f1f5f9",
          "surface-muted": "#f1f5f9",
          ink: "#0f172a",
          secondary: "#334155",
          subtle: "#64748b",
          line: "#e2e8f0",
          strong: "#cbd5e1",
          primary: "#0d9488",
          "primary-hover": "#0f766e",
          "primary-subtle": "#ccfbf1",
          accent: "#4f46e5",
          "accent-hover": "#4338ca",
          "accent-subtle": "#e0e7ff"
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
        glass: "0 8px 32px 0 rgba(15, 23, 42, 0.08)",
        "glass-sm": "0 4px 16px 0 rgba(15, 23, 42, 0.06)",
        "card-hover": "0 20px 40px -15px rgba(2, 132, 199, 0.18), 0 10px 20px -10px rgba(15, 23, 42, 0.06)",
        "card-elevated": "0 24px 48px -12px rgba(15, 23, 42, 0.12)",
        "glow-teal": "0 0 25px -5px rgba(13, 148, 136, 0.4)",
        "glow-blue": "0 0 25px -5px rgba(2, 132, 199, 0.4)",
        "glow-indigo": "0 0 25px -5px rgba(79, 70, 229, 0.4)",
        overlay: "0 25px 50px -12px rgba(15, 23, 42, 0.25)"
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
        }
      },
      animation: {
        float: "float 6s ease-in-out infinite",
        "float-slow": "floatSlow 4s ease-in-out infinite",
        "float-reverse": "floatReverse 5s ease-in-out infinite",
        "pulse-glow": "pulse-glow 3s ease-in-out infinite",
        "slide-up": "slide-up-fade 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards",
        "scale-in": "scale-in 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards"
      }
    }
  },
  plugins: []
};

export default config;
