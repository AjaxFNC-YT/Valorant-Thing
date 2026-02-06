/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        base: {
          900: "rgb(var(--base-900) / <alpha-value>)",
          800: "rgb(var(--base-800) / <alpha-value>)",
          700: "rgb(var(--base-700) / <alpha-value>)",
          600: "rgb(var(--base-600) / <alpha-value>)",
          500: "rgb(var(--base-500) / <alpha-value>)",
          400: "rgb(var(--base-400) / <alpha-value>)",
        },
        border: {
          DEFAULT: "rgb(var(--border) / <alpha-value>)",
          light: "rgb(var(--border-light) / <alpha-value>)",
        },
        text: {
          primary: "rgb(var(--text-primary) / <alpha-value>)",
          secondary: "rgb(var(--text-secondary) / <alpha-value>)",
          muted: "rgb(var(--text-muted) / <alpha-value>)",
        },
        val: {
          red: "rgb(var(--val-red) / <alpha-value>)",
          redDark: "rgb(var(--val-red-dark) / <alpha-value>)",
        },
        accent: {
          blue: "rgb(var(--accent-blue) / <alpha-value>)",
          blueDark: "rgb(var(--accent-blue-dark) / <alpha-value>)",
        },
        status: {
          green: "rgb(var(--status-green) / <alpha-value>)",
          yellow: "rgb(var(--status-yellow) / <alpha-value>)",
          red: "rgb(var(--status-red) / <alpha-value>)",
        },
      },
      fontFamily: {
        display: ['"Chakra Petch"', "system-ui", "sans-serif"],
        body: ['"IBM Plex Sans"', "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
