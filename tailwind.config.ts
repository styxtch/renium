import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        app: "var(--bg-app)",
        surface: "var(--bg-surface)",
        elevated: "var(--bg-elevated)",
        input: "var(--bg-input)",
        border: "var(--border)",
        "border-strong": "var(--border-strong)",
        primary: "var(--text-primary)",
        secondary: "var(--text-secondary)",
        muted: "var(--text-muted)",
        accent: "rgb(var(--accent-rgb) / <alpha-value>)",
        "accent-hover": "var(--accent-hover)",
        btn: "var(--btn-primary)",
        "btn-hover": "var(--btn-primary-hover)",
        "btn-text": "var(--btn-primary-text)",
        success: "rgb(var(--success-rgb) / <alpha-value>)",
        warning: "rgb(var(--warning-rgb) / <alpha-value>)",
        error: "rgb(var(--error-rgb) / <alpha-value>)",
        info: "rgb(var(--info-rgb) / <alpha-value>)",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      borderRadius: {
        sm: "8px",
        md: "16px",
        lg: "20px",
      },
      boxShadow: {
        soft: "0 4px 24px rgba(0, 0, 0, 0.4)",
        card: "var(--shadow-card)",
      },
    },
  },
  plugins: [],
};

export default config;
