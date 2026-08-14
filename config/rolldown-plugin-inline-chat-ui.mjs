// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { execSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { BUILD_SHA } from "./build-sha.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..");

function getFilesRecursively(dir) {
  const files = [];

  for (const entry of readdirSync(dir)) {
    // A vitest run rewrites its cache under node_modules/.vite, which would
    // otherwise read as a chat UI change and cost a rebuild.
    if (entry === "node_modules") continue;

    const fullPath = join(dir, entry);

    if (statSync(fullPath).isDirectory()) {
      files.push(...getFilesRecursively(fullPath));
    } else {
      files.push(fullPath);
    }
  }

  return files;
}

/**
 * Path to the chat UI that the Vite build produces.
 * @returns Absolute path to chat-ui.html
 */
function chatUIPath() {
  return join(rootDir, "max-for-live-device/chat-ui.html");
}

/**
 * The files the last Vite build read, as recorded by its record-build-inputs
 * plugin. This is how src/shared gets into the staleness check: the chat UI
 * imports it, but nothing under webui/ changes when it does.
 * @returns Absolute paths, or null when there is no usable record
 */
function recordedBuildInputs() {
  let record;

  try {
    record = JSON.parse(
      readFileSync(join(rootDir, "max-for-live-device/chat-ui.inputs.json")),
    );
  } catch {
    return null;
  }

  // A commit moves the SHA baked into the UI without touching a single file.
  return record.buildSha === BUILD_SHA ? record.inputs : null;
}

/**
 * Decide whether chat-ui.html needs rebuilding, by comparing it against
 * everything the Vite build reads.
 * @param htmlPath - Path to the built chat-ui.html
 * @param sources - Source files the build depends on
 * @returns True when the build output is missing or older than a source
 */
function isChatUIStale(htmlPath, sources) {
  const builtAt = mtimeOf(htmlPath);

  if (builtAt == null) return true;

  // A source that has since been deleted is a change too, hence Infinity.
  return sources.some((file) => (mtimeOf(file) ?? Infinity) > builtAt);
}

/**
 * @param file - Path to check
 * @returns Its modification time, or null when it doesn't exist
 */
function mtimeOf(file) {
  return statSync(file, { throwIfNoEntry: false })?.mtimeMs ?? null;
}

/**
 * Rolldown plugin to inline chat-ui.html as a virtual module.
 * This allows the MCP server bundle to work in frozen .amxd builds
 * where external file access is not available.
 */
export function inlineChatUI() {
  return {
    name: "inline-chat-ui",
    buildStart() {
      const recorded = recordedBuildInputs();
      const sources = [
        // The whole tree, not just what the last build imported, so a new file
        // and a Tailwind class scan both count.
        ...getFilesRecursively(join(rootDir, "webui")),
        ...(recorded ?? []),
        join(__dirname, "vite.config.ts"),
        join(__dirname, "build-sha.mjs"),
        join(rootDir, "package.json"),
        join(rootDir, "package-lock.json"),
        join(rootDir, "LICENSE"),
      ];

      for (const file of sources) {
        this.addWatchFile(file);
      }

      // The Vite build costs ~600ms and dominates a watch rebuild, so only run
      // it when its output is actually out of date. This also keeps `npm run
      // build` from building the chat UI twice — the build script runs
      // ui:build before rolldown starts.
      if (recorded == null || isChatUIStale(chatUIPath(), sources)) {
        execSync("npm run ui:build", { stdio: "inherit" });
      }
    },
    resolveId(id) {
      if (id === "virtual:chat-ui-html") {
        return id; // Mark as virtual module
      }
    },
    load(id) {
      if (id === "virtual:chat-ui-html") {
        const htmlPath = chatUIPath();

        try {
          const htmlContent = readFileSync(htmlPath, "utf-8");
          // Escape backticks, backslashes, and dollar signs for template literal
          const escaped = htmlContent
            .replaceAll("\\", "\\\\")
            .replaceAll("`", "\\`")
            .replaceAll("$", "\\$");

          return `export default \`${escaped}\`;`;
        } catch (error) {
          throw new Error(
            `Failed to read chat-ui.html: ${error.message}\n` +
              `Run "npm run ui:build" first to generate the chat UI.`,
            { cause: error },
          );
        }
      }
    },
  };
}
