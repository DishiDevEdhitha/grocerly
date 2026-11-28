import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#14261B",
        leaf: { DEFAULT: "#1E7B3F", dark: "#145A2E" },
        mint: "#E6F3E8",
        paper: "#F5F8F4",
        turmeric: "#F2A81D",
        chilli: "#D8412F",
        slate2: "#5E6E64",
        tile: { green: "#E4F3E6", purple: "#EEE8FB", orange: "#FFEFDD", blue: "#E4EFFB", peach: "#FFF1E6", rose: "#FBE9E7", yellow: "#FFF6D9", sky: "#E3F2FD" },
      },
      fontFamily: {
        display: ["var(--font-display)", "system-ui", "sans-serif"],
        body: ["var(--font-body)", "system-ui", "sans-serif"],
      },
      borderRadius: { tile: "18px" },
    },
  },
  plugins: [],
};
export default config;
