import preact from "@preact/preset-vite";
import tailwindcss from "@tailwindcss/vite";
import { renameSync } from "fs";
import { join } from "path";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

export default defineConfig({
  plugins: [
    preact(),
    tailwindcss(),
    viteSingleFile({ removeViteModuleLoader: true }),
    {
      name: "rename-output",
      closeBundle() {
        const outDir = join(process.cwd(), "max-for-live-device");
        const oldPath = join(outDir, "index.html");
        const newPath = join(outDir, "chat-ui.html");
        try {
          renameSync(oldPath, newPath);
          console.log(
            `Renamed ${oldPath.replace(process.cwd() + "/", "")} -> ${newPath.replace(process.cwd() + "/", "")}`,
          );
        } catch (err) {
          console.error("Error renaming file:", err.message);
        }
      },
    },
  ],
  root: "webui",
  server: { port: 3355 },
  build: {
    outDir: "../max-for-live-device",
    emptyOutDir: false,
    cssCodeSplit: false,
    assetsInlineLimit: 100000000,
  },
});
