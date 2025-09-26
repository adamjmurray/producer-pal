// config/tailwind.config.mjs
export default {
  content: ["./webui/**/*.{html,jsx}"],
  theme: {
    extend: {
      colors: {
        dark: "#1e1e1e",
        darker: "#252526",
        border: "#3e3e42",
      },
    },
  },
};