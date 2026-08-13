// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { execSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function getFilesRecursively(dir) {
  const files = [];

  for (const entry of readdirSync(dir)) {
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
  return join(__dirname, "../max-for-live-device/chat-ui.html");
}

/**
 * Decide whether chat-ui.html needs rebuilding, by comparing it against
 * everything the Vite build reads.
 * @param htmlPath - Path to the built chat-ui.html
 * @param sources - Source files the build depends on
 * @returns True when the build output is missing or older than a source
 */
function isChatUIStale(htmlPath, sources) {
  if (!existsSync(htmlPath)) return true;

  const builtAt = statSync(htmlPath).mtimeMs;

  return sources.some((file) => statSync(file).mtimeMs > builtAt);
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
      // Watch all webui source files
      const webuiDir = join(__dirname, "../webui");
      const sources = [
        ...getFilesRecursively(webuiDir),
        join(__dirname, "vite.config.ts"),
        join(__dirname, "../package.json"),
      ];

      for (const file of sources) {
        this.addWatchFile(file);
      }

      // The Vite build costs ~600ms and dominates a watch rebuild, so only run
      // it when its output is actually out of date. This also keeps `npm run
      // build` from building the chat UI twice — the build script runs
      // ui:build before rolldown starts.
      if (isChatUIStale(chatUIPath(), sources)) {
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
