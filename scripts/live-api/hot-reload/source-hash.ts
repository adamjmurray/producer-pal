// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { hashScriptFiles } from "#src/mcp-server/rpc/remote-script/bundle/remote-script-build.ts";

// Loaded once by Live and never hot-reloaded. Mirrors BOOTSTRAP in
// remote-script/Producer_Pal/hot_reload.py, which hashes the other files.
export const BOOTSTRAP_FILES: readonly string[] = [
  "__init__.py",
  "bridge.py",
  "errors.py",
  "hot_reload.py",
  "http_server.py",
];

/**
 * Hash the remote script's reloadable files the way hot_reload.py does, so the
 * hash Live reports after a reload can be checked against what was installed.
 * Covers every top-level .py file except the bootstrap ones and dot-files.
 *
 * @param dir - An installed (or repo) Producer_Pal folder
 * @returns The SHA-256 as lowercase hex
 */
export function hashRemoteScript(dir: string): string {
  const files: Record<string, Buffer> = {};

  for (const name of readdirSync(dir)) {
    if (
      name.endsWith(".py") &&
      !name.startsWith(".") &&
      !BOOTSTRAP_FILES.includes(name) &&
      statSync(join(dir, name)).isFile()
    ) {
      files[name] = readFileSync(join(dir, name));
    }
  }

  return hashScriptFiles(files);
}
