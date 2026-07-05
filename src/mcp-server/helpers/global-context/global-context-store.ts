// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Reads and writes the machine-global, cross-project user context that lives
// at ~/.producer-pal/context.md. This is authored by the user (hand-edited, or
// via the webui / ppal-context) and is distinct from the Max device's
// per-project context. A thin wrapper over the shared config-markdown store,
// which owns dir resolution, atomic writes, and the Vitest-inert guard.

import {
  readConfigMarkdown,
  resolveConfigPath,
  writeConfigMarkdown,
} from "../markdown-store/config-markdown-store.ts";

// Re-exported so existing importers (reveal-config-dir, the node routes) keep
// resolving these from here rather than reaching into the shared store.
export {
  configDir,
  isConfigDirInert,
} from "../markdown-store/config-markdown-store.ts";

const CONTEXT_FILENAME = "context.md";

/**
 * Absolute path to the global context markdown file.
 *
 * @returns Absolute path to ~/.producer-pal/context.md (or the override dir)
 */
export function resolveContextPath(): string {
  return resolveConfigPath(CONTEXT_FILENAME);
}

/**
 * Read the global context verbatim. Missing/unreadable file yields "".
 *
 * @returns File contents verbatim, or "" when absent/unreadable
 */
export function readGlobalContext(): string {
  return readConfigMarkdown(CONTEXT_FILENAME);
}

/**
 * Overwrite the global context with the given content (atomic temp+rename).
 *
 * @param content - New global context markdown
 */
export function writeGlobalContext(content: string): void {
  writeConfigMarkdown(CONTEXT_FILENAME, content);
}
