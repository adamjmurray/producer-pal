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
};

// When code execution is disabled, substitute the real code-exec modules with
// lightweight stubs that export the same interface but always return errors/no-ops.
// This eliminates the node:vm import and all execution logic from production bundles.
// IMPORTANT: If the stub files in src/tools/clip/code-exec/*-disabled.ts are renamed
// or moved, update the replacement paths below to match.
const codeExecAliases =
  process.env.ENABLE_CODE_EXEC !== "true"
    ? {
        "#src/live-api-adapter/code-exec-v8-protocol.ts": join(
          rootDir,
          "src/tools/clip/code-exec/code-exec-v8-protocol-disabled.ts",
        ),
        "./code-exec-v8-protocol.ts": join(
          rootDir,
          "src/tools/clip/code-exec/code-exec-v8-protocol-disabled.ts",
        ),
        "./code-executor.ts": join(
          rootDir,
          "src/tools/clip/code-exec/code-executor-disabled.ts",
        ),
        "./code-exec-protocol.ts": join(
          rootDir,
          "src/tools/clip/code-exec/code-exec-protocol-disabled.ts",
        ),
      }
    : {};

const resolveOptions = {
  alias: { ...codeExecAliases, "#src": join(rootDir, "src") },
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
      replacePlugin(envVarReplacements, { preventAssignment: true }),
      {
        name: "strip-top-level-exports",
        renderChunk: (code) => code.replace(/\nexport.*/, ""),
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
