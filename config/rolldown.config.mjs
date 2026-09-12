// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "rolldown";
import { replacePlugin } from "rolldown/plugins";
import { BUILD_SHA } from "./build-sha.mjs";
import { copyFiles } from "./rolldown-plugin-copy.mjs";
import { inlineChatUI } from "./rolldown-plugin-inline-chat-ui.mjs";
import {
  stubBuildStats,
  stubCodeExec,
} from "./rolldown-plugin-stub-modules.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..");

const licensePath = join(rootDir, "LICENSE");
const licenseText = readFileSync(licensePath, "utf-8");

const thirdPartyLicensesFolder = join(rootDir, "licenses");

const envVarReplacements = {
  "process.env.BUILD_SHA": JSON.stringify(BUILD_SHA),
  "process.env.ENABLE_LIVE_API": JSON.stringify(process.env.ENABLE_LIVE_API),
  "process.env.ENABLE_CODE_EXEC": JSON.stringify(process.env.ENABLE_CODE_EXEC),
  "process.env.ENABLE_WARP_MARKERS": JSON.stringify(
    process.env.ENABLE_WARP_MARKERS,
  ),
  "process.env.ENABLE_REMOTE_CORS": JSON.stringify(
    process.env.ENABLE_REMOTE_CORS,
  ),
  "process.env.ENABLE_OBJECT_PROBE": JSON.stringify(
    process.env.ENABLE_OBJECT_PROBE,
  ),
};

// Substitute dev-only modules with do-nothing stubs unless the build asked for
// them. ENABLE_BUILD_STATS is deliberately absent from the replacements above:
// nothing in src/ reads it, because the flag picks a module rather than a value.
// See config/rolldown-plugin-stub-modules.mjs.
const stubPlugins = [
  ...(process.env.ENABLE_CODE_EXEC !== "true" ? [stubCodeExec()] : []),
  ...(process.env.ENABLE_BUILD_STATS !== "true" ? [stubBuildStats()] : []),
];

const resolveOptions = {
  alias: { "#src": join(rootDir, "src") },
  extensions: [".mjs", ".js", ".json", ".node", ".ts"],
};

// Bundles ship readable, not minified — a stack trace from the Max V8 runtime
// has to be traceable back to the source by eye. `comments: false` strips the
// source comments so the bundle doesn't carry them into a user's device.
const outputBase = {
  format: "es",
  comments: false,
  minify: false,
};

// Rolldown's re-export trailer, always the last statement in the chunk.
const EXPORT_TRAILER = /\nexport\s*\{[^{}]*\};?\s*$/;

const addLicenseHeader = (options = {}) => ({
  name: "add-license-header",
  renderChunk(code) {
    const shebang = options.shebang ? `${options.shebang}\n` : "";

    return `${shebang}/*\n${licenseText}${
      options.includeThirdPartyLicenses
        ? "\nThis file includes bundled dependencies.\nSee https://github.com/adamjmurray/producer-pal/tree/main/licenses for third-party licenses."
        : ""
    }\n*/\n\n${code}`;
  },
});

export default defineConfig([
  {
    input: join(rootDir, "src/live-api-adapter/live-api-adapter.ts"),
    output: {
      ...outputBase,
      file: join(rootDir, "max-for-live-device/live-api-adapter.js"),
    },
    platform: "node",
    resolve: resolveOptions,
    transform: { target: "es2023" },
    plugins: [
      ...stubPlugins,
      replacePlugin(envVarReplacements, { preventAssignment: true }),
      {
        // Max's V8 runs this as a plain script, not a module, so rolldown's
        // export trailer is a SyntaxError at device load. Match it anchored to
        // the END of the chunk: an unanchored /\nexport.*/ eats the FIRST line
        // starting with "export", which a bundled string can supply (a JS
        // example in a tool description), leaving the real trailer behind.
        // Nothing downstream parses the result, so a miss has to throw here.
        name: "strip-top-level-exports",
        renderChunk: (code) => {
          const stripped = code.replace(EXPORT_TRAILER, "\n");

          if (stripped === code) {
            throw new Error(
              "strip-top-level-exports: no `export { … };` trailer at the end " +
                "of live-api-adapter.js — check what rolldown emitted before " +
                "shipping it to Max.",
            );
          }

          return stripped;
        },
      },
      addLicenseHeader(),
    ],
  },
  {
    input: join(rootDir, "src/mcp-server/mcp-server.ts"),
    output: {
      ...outputBase,
      file: join(rootDir, "max-for-live-device/mcp-server.mjs"),
    },
    platform: "node",
    external: ["max-api"],
    resolve: resolveOptions,
    transform: { target: "es2023" },
    plugins: [
      ...stubPlugins,
      replacePlugin(envVarReplacements, { preventAssignment: true }),
      inlineChatUI(), // Inline chat-ui.html for frozen .amxd builds
      addLicenseHeader({ includeThirdPartyLicenses: true }),
    ],
  },
  {
    input: join(rootDir, "src/portal/producer-pal-portal.ts"),
    output: [
      {
        ...outputBase,
        file: join(rootDir, "claude-desktop-extension/producer-pal-portal.js"),
      },
      {
        ...outputBase,
        file: join(rootDir, "npm/producer-pal-portal.js"),
      },
    ],
    platform: "node",
    resolve: {
      alias: {
        "#src": join(rootDir, "src"),
        // The portal only talks to a local HTTP server, so the MCP SDK's OAuth
        // path is dead code. Stub it out to keep pkce-challenge unbundled.
        "pkce-challenge": join(
          rootDir,
          "src/portal/pkce-challenge-disabled.ts",
        ),
      },
    },
    transform: { target: "es2023" },
    plugins: [
      ...stubPlugins,
      addLicenseHeader({
        includeThirdPartyLicenses: true,
        shebang: "#!/usr/bin/env node",
      }),
      replacePlugin(envVarReplacements, { preventAssignment: true }),
      copyFiles([
        { src: licensePath, dest: "claude-desktop-extension" },
        {
          src: thirdPartyLicensesFolder,
          dest: "claude-desktop-extension",
        },
        { src: licensePath, dest: "npm" },
        {
          src: [
            join(thirdPartyLicensesFolder, "mcp-typescript-sdk-license"),
            join(thirdPartyLicensesFolder, "zod-license"),
            join(thirdPartyLicensesFolder, "README.md"),
          ],
          dest: "npm/licenses",
        },
        {
          src: join(rootDir, "assets/image/producer-pal-logo.svg"),
          dest: "npm",
        },
      ]),
    ],
  },
]);
