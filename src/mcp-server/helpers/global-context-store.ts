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
 * Absolute path to the machine-global config directory. Honors the
 * PRODUCER_PAL_CONFIG_DIR override (used by tests and advanced setups);
 * otherwise resolves to ~/.producer-pal.
 *
 * @returns Absolute path to the config directory
 */
export function configDir(): string {
  return (
    process.env.PRODUCER_PAL_CONFIG_DIR ?? join(homedir(), ".producer-pal")
  );
}

/**
 * Absolute path to the global context markdown file.
 *
 * @returns Absolute path to ~/.producer-pal/context.md (or the override dir)
 */
export function resolveContextPath(): string {
  return join(configDir(), CONTEXT_FILENAME);
}

/**
 * Read the global context. A missing file (the common, empty-by-default case)
 * or any read error yields an empty string, so callers can treat "no global
 * context" and "empty global context" identically.
 *
 * @returns Trimmed file contents, or "" when absent/unreadable
 */
export function readGlobalContext(): string {
  if (isConfigDirInert()) return "";

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
  if (isConfigDirInert()) return;

  const target = resolveContextPath();
  const tmpPath = `${target}.tmp`;

  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(tmpPath, content, "utf8");
  renameSync(tmpPath, target);
}

/**
 * Whether to skip real config-dir access (read, write, or reveal). True only
 * under Vitest without an explicit dir override, so the config layer is
 * inert-by-default in unit tests and never touches the developer's real
 * ~/.producer-pal.
 *
 * @returns True when config-dir side effects should be skipped
 */
export function isConfigDirInert(): boolean {
  return isRunningInVitest && process.env.PRODUCER_PAL_CONFIG_DIR == null;
}
