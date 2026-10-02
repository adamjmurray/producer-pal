// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Read the Python remote script off disk as a path -> contents map. Used when
// running from the repo (the dev installer, tests); the device bundle carries
// the same map inlined instead. See embedded-remote-script.ts.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// Only Python sources ship; anything else in the folder is local junk.
// Dot-names (AppleDouble `._x.py`, editor locks `.#x.py`) are junk too.
const SKIP_DIR = "__pycache__";
const SOURCE_EXTENSION = ".py";

/**
 * Read a remote script folder into a map of forward-slash relative paths to
 * file contents.
 *
 * @param dir - The folder holding the script's Python sources
 * @returns Relative path to contents, .py files only
 */
export function readRemoteScriptSource(dir: string): Record<string, string> {
  const files: Record<string, string> = {};

  collectInto(files, dir, "");

  return files;
}

/**
 * Add one folder's files to the map, recursing into subfolders.
 *
 * @param files - The map being built
 * @param dir - Absolute folder to read
 * @param prefix - That folder's path relative to the script root
 */
function collectInto(
  files: Record<string, string>,
  dir: string,
  prefix: string,
): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) {
      continue;
    }

    const relative = prefix === "" ? entry.name : `${prefix}/${entry.name}`;

    if (entry.isDirectory()) {
      if (entry.name !== SKIP_DIR) {
        collectInto(files, join(dir, entry.name), relative);
      }
    } else if (entry.name.endsWith(SOURCE_EXTENSION)) {
      files[relative] = readFileSync(join(dir, entry.name), "utf8");
    }
  }
}
