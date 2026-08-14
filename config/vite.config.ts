// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import preact from "@preact/preset-vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";
import { BUILD_SHA } from "./build-sha.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..");
const licensePath = join(rootDir, "LICENSE");
const licenseText = readFileSync(licensePath, "utf-8");
const buildInputsPath = join(
  rootDir,
  "max-for-live-device/chat-ui.inputs.json",
);

let buildInputs: string[] = [];

export default defineConfig({
  // Bake the build identity in, same as the rolldown bundles do. The browser has
  // no `process`, so this must always substitute to a literal.
  define: {
    "process.env.BUILD_SHA": JSON.stringify(BUILD_SHA),
  },
  resolve: {
    alias: {
      "#webui": resolve(__dirname, "../webui/src"),
      "#src": resolve(__dirname, "../src"),
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
- Preact (MIT)
- Marked (MIT)
- DOMPurify (Apache-2.0 OR MPL-2.0)
- idb (ISC)
- Tailwind CSS, incl. @tailwindcss/typography (MIT)
- Vercel AI SDK: ai, @ai-sdk/{anthropic,google,mistral,openai,provider-utils} (Apache-2.0)
- @openrouter/ai-sdk-provider (Apache-2.0)
- @openai/agents (MIT)
- @google/genai (Apache-2.0)
- CodeMirror 6: @codemirror/{state,view,commands,language,lang-markdown} (MIT)
- @lezer/highlight (MIT)
- @modelcontextprotocol/sdk (MIT)

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
    {
      // Record what this build read. The rolldown build compares the record
      // against chat-ui.html to decide whether to re-run this one, and it can't
      // know the UI pulls in src/shared any other way. See
      // config/rolldown-plugin-inline-chat-ui.mjs.
      name: "record-build-inputs",
      buildEnd() {
        buildInputs = [...this.getModuleIds()]
          // Drop query suffixes (?used, ?direct) so paths compare as files.
          .map((id) => id.replace(/[?#].*$/, ""))
          .filter(
            (id) =>
              // Skips virtual modules (\0…) along with dependencies, which
              // package-lock.json covers instead.
              id.startsWith(rootDir) &&
              !id.includes("/node_modules/") &&
              existsSync(id),
          );
      },
      closeBundle() {
        writeFileSync(
          buildInputsPath,
          // The SHA is baked in by `define`, and a commit moves it without
          // touching any file, so mtimes alone can't spot that change.
          `${JSON.stringify(
            { buildSha: BUILD_SHA, inputs: [...new Set(buildInputs)].sort() },
            null,
            2,
          )}\n`,
          "utf-8",
        );
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
