// config/vite.config.mjs
import { defineConfig } from "vite";
import preact from "@preact/preset-vite";
import tailwindcss from "tailwindcss";

export default defineConfig({
  plugins: [preact()],
  root: "webui",
  server: { port: 3355 },
  css: {
    postcss: {
      plugins: [tailwindcss("./config/tailwind.config.mjs")],
    },
  },
});