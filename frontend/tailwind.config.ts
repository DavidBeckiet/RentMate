import type { Config } from "tailwindcss";

const color = (token: string) => `rgb(var(--color-${token}) / <alpha-value>)`;

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
        display: ["var(--font-be-vietnam-pro)", "var(--font-space-grotesk)", "sans-serif"]
      },
      fontSize: {
        "ui-xs": ["var(--font-size-xs)", { lineHeight: "var(--line-height-xs)" }],
        "ui-sm": ["var(--font-size-sm)", { lineHeight: "var(--line-height-sm)" }],
        "ui-base": ["var(--font-size-base)", { lineHeight: "var(--line-height-base)" }],
        "heading-sm": ["var(--font-size-lg)", { lineHeight: "var(--line-height-lg)" }],
        "heading-md": ["var(--font-size-xl)", { lineHeight: "var(--line-height-xl)" }],
        "heading-lg": ["var(--font-size-2xl)", { lineHeight: "var(--line-height-2xl)" }],
        display: ["var(--font-size-display)", { lineHeight: "var(--line-height-display)" }]
      },
      spacing: {
        "token-1": "var(--space-1)",
        "token-2": "var(--space-2)",
        "token-3": "var(--space-3)",
        "token-4": "var(--space-4)",
        "token-6": "var(--space-6)",
        "token-8": "var(--space-8)",
        "token-12": "var(--space-12)",
        "token-16": "var(--space-16)",
        "token-24": "var(--space-24)"
      },
      colors: {
        background: color("background"),
        surface: {
          DEFAULT: color("surface"),
          subtle: color("surface-subtle")
        },
        foreground: color("foreground"),
        muted: {
          DEFAULT: color("muted"),
          foreground: color("muted-foreground")
        },
        border: {
          DEFAULT: color("border"),
          strong: color("border-strong")
        },
        primary: {
          DEFAULT: color("primary"),
          hover: color("primary-hover"),
          foreground: color("primary-foreground"),
          subtle: color("primary-subtle")
        },
        "brand-dark": color("brand-dark"),
        success: {
          DEFAULT: color("success"),
          foreground: color("success-foreground"),
          subtle: color("success-subtle")
        },
        warning: {
          DEFAULT: color("warning"),
          foreground: color("warning-foreground"),
          subtle: color("warning-subtle")
        },
        danger: {
          DEFAULT: color("danger"),
          hover: color("danger-hover"),
          foreground: color("danger-foreground"),
          subtle: color("danger-subtle")
        },
        info: {
          DEFAULT: color("info"),
          foreground: color("info-foreground"),
          subtle: color("info-subtle")
        },
        accent: {
          DEFAULT: color("accent"),
          hover: color("accent-hover"),
          subtle: color("accent-subtle")
        },
        coral: color("decorative-coral"),
        sky: color("decorative-blue"),
        focus: color("focus-ring"),
        "focus-accent": color("focus-accent"),
        disabled: color("control-disabled"),
        /* Compatibility aliases are retained until old routes are rebuilt. New code uses semantic names above. */
        brandBlue: {
          50: color("primary-50"),
          100: color("primary-100"),
          200: color("primary-200"),
          400: color("primary-400"),
          500: color("primary"),
          600: color("primary-hover"),
          700: color("primary-700")
        },
        heroDark: {
          900: color("foreground-soft"),
          950: color("foreground")
        },
        rent: {
          canvas: color("background"),
          surface: color("surface"),
          muted: color("muted"),
          "surface-muted": color("surface-subtle"),
          ink: color("foreground"),
          secondary: color("muted-foreground"),
          subtle: color("subtle-foreground"),
          line: color("border"),
          strong: color("border-strong"),
          primary: color("primary"),
          "primary-hover": color("primary-hover"),
          "primary-subtle": color("primary-100"),
          accent: color("accent"),
          "accent-hover": color("accent-hover"),
          "accent-subtle": color("accent-subtle"),
          coral: color("decorative-coral"),
          yellow: color("decorative-yellow")
        }
      },
      borderRadius: {
        control: "var(--radius-control)",
        card: "var(--radius-card)",
        overlay: "var(--radius-overlay)",
        "2xl": "var(--radius-overlay)",
        "3xl": "1.5rem",
        "4xl": "2rem"
      },
      zIndex: {
        content: "0",
        sticky: "20",
        header: "30",
        dropdown: "40",
        backdrop: "50",
        drawer: "60",
        dialog: "70",
        toast: "80",
        skip: "90"
      },
      boxShadow: {
        surface: "var(--shadow-surface)",
        raised: "var(--shadow-raised)",
        "overlay-soft": "var(--shadow-overlay)",
        /* Compatibility aliases: old routes keep their class names while adopting the new soft elevation. */
        glass: "var(--shadow-surface)",
        "glass-sm": "0 1px 2px rgb(var(--color-foreground) / 0.04)",
        "card-hover": "var(--shadow-raised)",
        "card-elevated": "var(--shadow-overlay)",
        "glow-teal": "var(--shadow-raised)",
        "glow-blue": "var(--shadow-raised)",
        "glow-indigo": "var(--shadow-raised)",
        overlay: "var(--shadow-overlay)"
      },
      transitionDuration: {
        fast: "var(--motion-fast)",
        standard: "var(--motion-standard)",
        slow: "var(--motion-slow)"
      },
      transitionTimingFunction: {
        standard: "var(--rm-ease-standard)",
        enter: "var(--rm-ease-out)",
        exit: "var(--rm-ease-in)",
        emphasized: "cubic-bezier(0.2, 0.8, 0.2, 1)"
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
