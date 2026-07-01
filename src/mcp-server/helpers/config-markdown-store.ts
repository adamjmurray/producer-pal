// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Generic read/write for a single machine-global markdown "slot" under
// ~/.producer-pal/ (e.g. context.md, system-prompt.md). These are authored by
// the user (hand-edited, or via the webui) and shared across every project and
// client. Filesystem access lives on the Node-for-Max side; the V8 tool code
// has no `fs`, so callers on that side must round-trip through a route.
//
// Each user-content feature (global context, custom system prompt) wraps these
// primitives with its own filename so the dir-resolution, atomic write, and
// Vitest-inert guard live in exactly one place.

import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

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
 * Absolute path to a named markdown slot inside the config directory.
 *
 * @param filename - Slot filename (e.g. "context.md")
 * @returns Absolute path to the file (or the override dir)
 */
export function resolveConfigPath(filename: string): string {
  return join(configDir(), filename);
}

/**
 * Read a config markdown slot verbatim. A missing file (the common,
 * empty-by-default case) or any read error yields an empty string, so callers
 * can treat "absent" and "empty" identically.
 *
 * Content is returned byte-faithful (not trimmed) so a GET/PUT round-trip from
 * the editor echoes exactly what was written — otherwise a trailing newline
 * would make the saved draft and the server echo diverge and spuriously fire
 * the editor's "changed externally" banner. Callers that want a clean blob for
 * display (e.g. the ppal-connect injection) trim at the point of use.
 *
 * @param filename - Slot filename (e.g. "context.md")
 * @returns File contents verbatim, or "" when absent/unreadable
 */
export function readConfigMarkdown(filename: string): string {
  if (isConfigDirInert()) return "";

  try {
    return readFileSync(resolveConfigPath(filename), "utf8");
  } catch {
    // Missing file, permissions, etc. — treat as "no content".
    return "";
  }
}

/**
 * Overwrite a config markdown slot with the given content, creating
 * ~/.producer-pal if needed. Writes to a temp file and renames it into place
 * so a crash mid-write can't leave a half-written file.
 *
 * @param filename - Slot filename (e.g. "context.md")
 * @param content - New markdown content
 */
export function writeConfigMarkdown(filename: string, content: string): void {
  if (isConfigDirInert()) return;

  const target = resolveConfigPath(filename);
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
