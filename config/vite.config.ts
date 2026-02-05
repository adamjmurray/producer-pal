// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: AGPL-3.0-or-later

import preact from "@preact/preset-vite";
import tailwindcss from "@tailwindcss/vite";
import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..");
const licensePath = join(rootDir, "LICENSE");
const licenseText = readFileSync(licensePath, "utf-8");

export default defineConfig({
  define: {
    "import.meta.env.ENABLE_RAW_LIVE_API": JSON.stringify(
      process.env.ENABLE_RAW_LIVE_API === "true",
    ),
  },
  resolve: {
    alias: {
      "#webui": resolve(__dirname, "../webui/src"),
    },
  },
  plugins: [
    preact(),
    tailwindcss(),
    viteSingleFile({ removeViteModuleLoader: true }),
    {
      name: "rename-output",
      closeBundle() {
        const outDir = join(rootDir, "max-for-live-device");
        const oldPath = join(outDir, "index.html");
        const newPath = join(outDir, "chat-ui.html");
        try {
          renameSync(oldPath, newPath);
          console.log(
            `Renamed ${oldPath.replace(rootDir + "/", "")} -> ${newPath.replace(rootDir + "/", "")}`,
          );
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          console.error("Error renaming file:", message);
        }
      },
    },
    {
      name: "add-license-header",
      closeBundle() {
        const outDir = join(rootDir, "max-for-live-device");
        const filePath = join(outDir, "chat-ui.html");

        try {
          const content = readFileSync(filePath, "utf-8");

          const licenseHeader = `<!--
${licenseText}
This file includes bundled dependencies:
- Preact (MIT License)
- Marked (MIT License)
- Tailwind CSS (MIT License)
- @modelcontextprotocol/sdk (MIT License)
- @google/genai (Apache License 2.0)

See https://github.com/adamjmurray/producer-pal/tree/main/licenses for third-party licenses.
-->

`;

          const contentWithHeader = licenseHeader + content;
          writeFileSync(filePath, contentWithHeader, "utf-8");
          console.log(
            `Added license header to ${filePath.replace(rootDir + "/", "")}`,
          );
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          console.error("Error adding license header:", message);
        }
      },
    },
  ],
  root: "webui",
  server: { port: 5173 },
  build: {
    outDir: "../max-for-live-device",
    emptyOutDir: false,
    cssCodeSplit: false,
    assetsInlineLimit: 100000000,
  },
});
