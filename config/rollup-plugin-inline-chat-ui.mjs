// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { execSync } from "child_process";
import { readdirSync, readFileSync, statSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

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
 * Rollup plugin to inline chat-ui.html as a virtual module.
 * This allows the MCP server bundle to work in frozen .amxd builds
 * where external file access is not available.
 */
export function inlineChatUI() {
  return {
    name: "inline-chat-ui",
    buildStart() {
      // Watch all webui source files
      const webuiDir = join(__dirname, "../webui");
      for (const file of getFilesRecursively(webuiDir)) {
        this.addWatchFile(file);
      }
      execSync("npm run ui:build", { stdio: "inherit" });
    },
    resolveId(id) {
      if (id === "virtual:chat-ui-html") {
        return id; // Mark as virtual module
      }
    },
    load(id) {
      if (id === "virtual:chat-ui-html") {
        const htmlPath = join(__dirname, "../max-for-live-device/chat-ui.html");
        try {
          const htmlContent = readFileSync(htmlPath, "utf-8");
          // Escape backticks, backslashes, and dollar signs for template literal
          const escaped = htmlContent
            .replace(/\\/g, "\\\\")
            .replace(/`/g, "\\`")
            .replace(/\$/g, "\\$");
          return `export default \`${escaped}\`;`;
        } catch (error) {
          throw new Error(
            `Failed to read chat-ui.html: ${error.message}\n` +
              `Run "npm run ui:build" first to generate the chat UI.`,
          );
        }
      }
    },
  };
}
