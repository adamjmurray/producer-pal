// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

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
 *
 * Per file, in name order: `<name>\0<sha256 of its bytes>\n`. Covers every
 * top-level .py file except the bootstrap ones and dot-files.
 *
 * @param dir - An installed (or repo) Producer_Pal folder
 * @returns The SHA-256 as lowercase hex
 */
export function hashRemoteScript(dir: string): string {
  const names = readdirSync(dir)
    .filter(
      (name) =>
        name.endsWith(".py") &&
        !name.startsWith(".") &&
        !BOOTSTRAP_FILES.includes(name) &&
        statSync(join(dir, name)).isFile(),
    )
    // Byte order, like Python's sort of the same names.
    .toSorted((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)));
  const digest = createHash("sha256");

  for (const name of names) {
    const contentHash = createHash("sha256")
      .update(readFileSync(join(dir, name)))
      .digest("hex");

    digest.update(`${name}\0${contentHash}\n`);
  }

  return digest.digest("hex");
}
