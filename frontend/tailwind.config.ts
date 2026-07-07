import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // V3 design system: the app's neutral scale is redefined here (instead of
        // Tailwind's default blue-gray slate) so every existing slate-* class across
        // the codebase picks up V3's violet-tinted neutrals with no per-file changes.
        slate: {
          50: "#F7F7FB",
          100: "#EFEFF6",
          200: "#E7E7F1",
          300: "#D3D3E3",
          400: "#9A9DB0",
          500: "#6B6F86",
          600: "#565A72",
          700: "#40435C",
          800: "#2A2C42",
          900: "#1D1F35",
          950: "#14162B"
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))"
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))"
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))"
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))"
        }
      },
      borderRadius: {
        lg: "8px",
        md: "6px",
        sm: "4px",
        // Card radius for the approved redesign — kept separate from `lg` since
        // `lg` is used 100+ times app-wide for buttons/badges/modals/etc, not just cards.
        card: "12px"
      },
      boxShadow: {
        panel: "0 1px 3px rgba(20, 22, 43, 0.07), 0 1px 2px rgba(20, 22, 43, 0.04)"
      }
    }
  },
  plugins: []
} satisfies Config;
