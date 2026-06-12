/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        surface: {
          base: "var(--bg-primary)",
          card: "var(--bg-card)",
          elevated: "var(--bg-elevated)",
          input: "var(--bg-input)",
        },
        content: {
          primary: "var(--text-primary)",
          secondary: "var(--text-secondary)",
          muted: "var(--text-muted)",
        },
        border: {
          DEFAULT: "var(--border)",
          active: "var(--border-active)",
        },
        accent: {
          DEFAULT: "var(--accent)",
          light: "var(--accent-light)",
        },
      },
      boxShadow: {
        xs: "var(--shadow-xs)",
        sm: "var(--shadow-sm)",
        card: "var(--card-shadow)",
        "card-hover": "var(--card-shadow-hover)",
        lg: "var(--shadow-lg)",
      },
      borderRadius: {
        card: "1rem",
        sheet: "1.5rem",
        button: "0.75rem",
      },
      spacing: {
        safe: "env(safe-area-inset-bottom)",
      },
      animation: {
        "shimmer": "shimmer 2s infinite linear",
      },
      keyframes: {
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
    },
  },
  plugins: [],
};
