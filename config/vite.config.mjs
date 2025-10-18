import preact from "@preact/preset-vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

export default defineConfig({
  plugins: [preact(), tailwindcss(), viteSingleFile()],
  root: "webui",
  server: { port: 3355 },
  build: {
    cssCodeSplit: false,
    assetsInlineLimit: 100000000,
  },
});
