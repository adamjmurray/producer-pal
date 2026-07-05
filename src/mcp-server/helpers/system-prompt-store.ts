// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Reads and writes the user's custom system prompt at
// ~/.producer-pal/system-prompt.md. Authored via the chat UI's Instructions
// editor (or hand-edited). Empty/absent means "use the built-in default"; any
// content fully replaces the webui chat's built-in system instruction. A thin
// wrapper over the shared config-markdown store.

import {
  readConfigMarkdown,
  writeConfigMarkdown,
} from "./markdown-store/config-markdown-store.ts";

const SYSTEM_PROMPT_FILENAME = "system-prompt.md";

/**
 * Read the custom system prompt verbatim. Missing/unreadable file yields "",
 * which callers treat as "use the built-in default".
 *
 * @returns File contents verbatim, or "" when absent/unreadable
 */
export function readSystemPrompt(): string {
  return readConfigMarkdown(SYSTEM_PROMPT_FILENAME);
}

/**
 * Overwrite the custom system prompt with the given content (atomic
 * temp+rename). Writing "" is how the editor's Clear resets to the built-in.
 *
 * @param content - New system prompt markdown
 */
export function writeSystemPrompt(content: string): void {
  writeConfigMarkdown(SYSTEM_PROMPT_FILENAME, content);
}
