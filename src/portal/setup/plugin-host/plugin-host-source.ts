// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { type PluginHostSource } from "./plugin-host-wrappers.ts";

/**
 * Where the wrapper source files live in the repo.
 *
 * @param rootDir - The repo root
 * @returns Absolute path of the folder
 */
export function pluginHostSourceDir(rootDir: string): string {
  return join(rootDir, "max-for-live-device", "plugin-host");
}

/**
 * Read the wrapper devices out of a folder. Repo checkouts only: a bundled
 * build has the files embedded instead.
 *
 * @param dir - The folder holding the .amxd files
 * @returns Their bytes as base64, by file name; no other files
 */
export function readPluginHostSource(dir: string): PluginHostSource {
  const source: PluginHostSource = {};

  for (const name of readdirSync(dir)) {
    if (name.endsWith(".amxd") && !name.startsWith(".")) {
      source[name] = readFileSync(join(dir, name)).toString("base64");
    }
  }

  return source;
}
