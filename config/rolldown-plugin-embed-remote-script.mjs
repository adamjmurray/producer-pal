// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Inlines the Python remote script into the MCP server bundle, so the device
// can install it into Live's User Library with no repo to read from.
//
// It replaces src/mcp-server/rpc/remote-script/embedded-remote-script.ts, whose
// checked-in body reads the same files off disk for tests and the dev
// installer. version.py's version is rewritten to package.json's, so an
// installed script reports the release that installed it.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = join(rootDir, "remote-script/Producer_Pal");
const embeddedModule = join(
  rootDir,
  "src/mcp-server/rpc/remote-script/embedded-remote-script.ts",
);
const packageJson = join(rootDir, "package.json");

const SKIP_DIR = "__pycache__";
const SKIP_EXTENSION = ".pyc";
const VERSION_LINE = /^VERSION = ".*"$/m;

/**
 * Build the remote-script embedding plugin.
 *
 * @returns A rolldown plugin
 */
export function embedRemoteScript() {
  return {
    name: "embed-remote-script",
    buildStart() {
      if (!existsSync(embeddedModule)) {
        throw new Error(
          `embed-remote-script: ${embeddedModule} no longer exists. Update ` +
            "config/rolldown-plugin-embed-remote-script.mjs to match the rename.",
        );
      }

      for (const file of [...sourceFiles(sourceDir), packageJson]) {
        this.addWatchFile(file);
      }
    },
    load(id) {
      if (id !== embeddedModule) {
        return;
      }

      const files = readSource(sourceDir, "");

      files["version.py"] = withVersion(files["version.py"]);

      return `export const EMBEDDED_REMOTE_SCRIPT_FILES = ${JSON.stringify(files, null, 2)};\n`;
    },
  };
}

/**
 * Read the script's Python sources, keyed by path relative to its folder.
 *
 * @param dir - Folder to read
 * @param prefix - That folder's path relative to the script root
 * @returns Relative path to file contents, bytecode left out
 */
function readSource(dir, prefix) {
  const files = {};

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === SKIP_DIR || entry.name.endsWith(SKIP_EXTENSION)) {
      continue;
    }

    const relative = prefix === "" ? entry.name : `${prefix}/${entry.name}`;

    if (entry.isDirectory()) {
      Object.assign(files, readSource(join(dir, entry.name), relative));
    } else {
      files[relative] = readFileSync(join(dir, entry.name), "utf8");
    }
  }

  return files;
}

/**
 * Stamp version.py with package.json's version. Throws when the line it
 * rewrites is gone, rather than shipping a script that lies about its version.
 *
 * @param source - The checked-in version.py
 * @returns The same file with the version line rewritten
 */
function withVersion(source) {
  const { version } = JSON.parse(readFileSync(packageJson, "utf8"));
  const stamped = (source ?? "").replace(
    VERSION_LINE,
    `VERSION = "${version}"`,
  );

  if (!VERSION_LINE.test(stamped)) {
    throw new Error(
      'embed-remote-script: no `VERSION = "..."` line in ' +
        "remote-script/Producer_Pal/version.py to stamp.",
    );
  }

  return stamped;
}

/**
 * Every file the embedded map is built from, for rolldown's watch list.
 *
 * @param dir - Folder to walk
 * @returns Absolute paths
 */
function sourceFiles(dir) {
  const files = [];

  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);

    if (statSync(fullPath).isDirectory()) {
      files.push(...sourceFiles(fullPath));
    } else {
      files.push(fullPath);
    }
  }

  return files;
}
