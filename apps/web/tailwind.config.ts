import type { Config } from "tailwindcss";

// الألوان مربوطة بمتغيّرات CSS المعرّفة في globals.css (design tokens).
// المرجع البصري: design-references/ — موثّق في DESIGN.md.
export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        card: "var(--surface)",
        "surface-2": "var(--surface-2)",
        topbar: "var(--topbar)",
        line: "var(--border)",
        ink: "var(--text)",
        muted: "var(--text-muted)",
        subtle: "var(--text-subtle)",
        primary: {
          DEFAULT: "var(--primary)",
          strong: "var(--primary-strong)",
          soft: "var(--primary-soft)",
          fg: "var(--primary-fg)",
        },
        success: { DEFAULT: "var(--success)", soft: "var(--success-soft)" },
        warning: { DEFAULT: "var(--warning)", soft: "var(--warning-soft)" },
        danger: { DEFAULT: "var(--danger)", soft: "var(--danger-soft)" },
        info: { DEFAULT: "var(--info)", soft: "var(--info-soft)" },
      },
      borderColor: { DEFAULT: "var(--border)" },
      borderRadius: { card: "14px" },
      fontFamily: { sans: ["var(--font-sans)"] },
      boxShadow: {
        card: "0 1px 2px rgba(16,24,40,.04), 0 1px 3px rgba(16,24,40,.05)",
      },
    },
  },
  plugins: [],
} satisfies Config;
