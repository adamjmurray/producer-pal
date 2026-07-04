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

import {
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join, relative, sep } from "node:path";

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
 * Read a config markdown slot verbatim. A missing file — the common,
 * empty-by-default case — yields an empty string so callers can treat "absent"
 * and "empty" identically. Any OTHER read error (permissions, I/O, a directory
 * in the file's place) throws instead of masking as empty: the slot may hold
 * real content we merely can't read right now, and returning "" would let the
 * editor's GET/PUT round-trip overwrite a recoverable file with nothing.
 *
 * Content is returned byte-faithful (not trimmed) so a GET/PUT round-trip from
 * the editor echoes exactly what was written — otherwise a trailing newline
 * would make the saved draft and the server echo diverge and spuriously fire
 * the editor's "changed externally" banner. Callers that want a clean blob for
 * display (e.g. the ppal-connect injection) trim at the point of use.
 *
 * @param filename - Slot filename (e.g. "context.md")
 * @returns File contents verbatim, or "" when the file is absent
 */
export function readConfigMarkdown(filename: string): string {
  if (isConfigDirInert()) return "";

  try {
    return readFileSync(resolveConfigPath(filename), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "";

    throw error;
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
 * List the `.md` filenames directly inside a subdirectory of the config dir
 * (e.g. "memory"), sorted. A missing subdir — the empty-by-default case —
 * yields []. Non-`.md` entries are ignored; nested directories are NOT descended
 * into (memory's basenames are slugs, so it must stay flat — skills, which needs
 * nesting, uses {@link listConfigMarkdownFilesRecursive}).
 *
 * @param subdir - Subdirectory under the config dir (e.g. "memory")
 * @returns Sorted list of `.md` basenames (e.g. ["a.md", "b.md"])
 */
export function listConfigMarkdownFiles(subdir: string): string[] {
  return safeReaddir(() =>
    readdirSync(join(configDir(), subdir))
      .filter((name) => name.endsWith(".md"))
      .sort(),
  );
}

/**
 * Recursively list the `.md` files under a subdirectory of the config dir, as
 * POSIX-separated paths relative to that subdirectory, sorted. Unlike
 * {@link listConfigMarkdownFiles} this DESCENDS into nested folders, so a skills
 * override can live at `skills/drums/backbeat.md` and be pulled in with
 * `@include "./drums/backbeat.md"`. Directories are skipped (only files are
 * returned); a missing subdir yields [].
 *
 * @param subdir - Subdirectory under the config dir (e.g. "skills")
 * @returns Sorted POSIX relative paths (e.g. ["core.md", "drums/backbeat.md"])
 */
export function listConfigMarkdownFilesRecursive(subdir: string): string[] {
  const base = join(configDir(), subdir);

  return safeReaddir(() =>
    readdirSync(base, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
      .map((entry) =>
        relative(base, join(entry.parentPath, entry.name)).split(sep).join("/"),
      )
      .sort(),
  );
}

/**
 * Delete a config markdown slot, if it exists. Used to reset an override back
 * to the built-in default (empty folder ⇒ latest built-ins, per ADR-0010). A
 * missing file is treated as already-reset, not an error.
 *
 * @param filename - Slot filename (e.g. "skills/core-standard.md")
 */
export function deleteConfigMarkdown(filename: string): void {
  if (isConfigDirInert()) return;

  try {
    unlinkSync(resolveConfigPath(filename));
  } catch {
    // Missing file, permissions, etc. — nothing to reset.
  }
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

/**
 * Run a readdir-based lister behind the config-dir guards shared by the flat and
 * recursive markdown listers: inert under Vitest, a missing directory (ENOENT)
 * yields [], and any other error propagates.
 *
 * @param read - Produces the listing (invoked only when the dir is live)
 * @returns The listing, or [] when inert or the directory is absent
 */
function safeReaddir(read: () => string[]): string[] {
  if (isConfigDirInert()) return [];

  try {
    return read();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];

    throw error;
  }
}
