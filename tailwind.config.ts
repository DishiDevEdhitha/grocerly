import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#12231D",
        leaf: { DEFAULT: "#1F7A5A", dark: "#15594F" },
        mint: "#E3F0E9",
        paper: "#F4F7F5",
        turmeric: "#E8A317",
        chilli: "#C93B2B",
        slate2: "#5B6B65",
      },
      fontFamily: {
        display: ["var(--font-display)", "system-ui", "sans-serif"],
        body: ["var(--font-body)", "system-ui", "sans-serif"],
      },
      borderRadius: { tile: "22px" },
    },
  },
  plugins: [],
};
export default config;
