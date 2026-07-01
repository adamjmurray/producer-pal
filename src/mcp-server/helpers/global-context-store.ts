// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Reads and writes the machine-global, cross-project user context that lives
// under ~/.producer-pal/. This is authored by the user (hand-edited, or later
// via the webui / ppal-context) and is distinct from the Max device's
// per-project context. Filesystem access lives on the Node-for-Max side; the
// V8 tool code has no `fs`, so callers on that side must round-trip through
// here.

import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

const CONTEXT_FILENAME = "context.md";

// Detect Vitest so unit tests never read or clobber the developer's real
// ~/.producer-pal. A test opts back into real filesystem access by pointing
// PRODUCER_PAL_CONFIG_DIR at a temp dir. Mirrors file-logger.ts's guard.
const isRunningInVitest = process.env.VITEST === "true";

/**
 * Absolute path to the global context markdown file. Honors the
 * PRODUCER_PAL_CONFIG_DIR override (used by tests and advanced setups);
 * otherwise resolves under the user's home directory.
 *
 * @returns Absolute path to ~/.producer-pal/context.md (or the override dir)
 */
export function resolveContextPath(): string {
  const dir =
    process.env.PRODUCER_PAL_CONFIG_DIR ?? join(homedir(), ".producer-pal");

  return join(dir, CONTEXT_FILENAME);
}

/**
 * Read the global context. A missing file (the common, empty-by-default case)
 * or any read error yields an empty string, so callers can treat "no global
 * context" and "empty global context" identically.
 *
 * @returns Trimmed file contents, or "" when absent/unreadable
 */
export function readGlobalContext(): string {
  if (skipFileIo()) return "";

  try {
    return readFileSync(resolveContextPath(), "utf8").trim();
  } catch {
    // Missing file, permissions, etc. — treat as "no global context".
    return "";
  }
}

/**
 * Overwrite the global context with the given content, creating
 * ~/.producer-pal if needed. Writes to a temp file and renames it into place
 * so a crash mid-write can't leave a half-written context.md.
 *
 * @param content - New global context markdown
 */
export function writeGlobalContext(content: string): void {
  if (skipFileIo()) return;

  const target = resolveContextPath();
  const tmpPath = `${target}.tmp`;

  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(tmpPath, content, "utf8");
  renameSync(tmpPath, target);
}

/**
 * Whether to skip filesystem access. True only under Vitest without an
 * explicit dir override, so the module is inert-by-default in unit tests.
 *
 * @returns True when file IO should be skipped
 */
function skipFileIo(): boolean {
  return isRunningInVitest && process.env.PRODUCER_PAL_CONFIG_DIR == null;
}
