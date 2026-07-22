// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Reads and writes the user's custom system prompt at
// ~/.producer-pal/system-prompt.md. Authored via the chat UI's Instructions
// editor (or hand-edited). Empty/absent means "use the built-in default"; any
// content fully replaces the webui chat's built-in system instruction.
//
// A saved prompt carries fork-time PROVENANCE in frontmatter (the Producer Pal
// version and a hash of the built-in it forked from) so the editor can flag
// "the default changed since you forked" drift — the same mechanism the skills
// overrides use (see override-provenance.ts). The content body is stored and
// read back verbatim (frontmatter is stripped on read), so the chat still
// composes with the exact bytes the user wrote and the editor's GET/PUT
// round-trip stays stable.

import { SYSTEM_INSTRUCTION } from "#src/shared/config.ts";
import {
  deleteConfigMarkdown,
  readConfigMarkdown,
  writeConfigMarkdown,
} from "./markdown-store/config-markdown-store.ts";
import { parseFrontmatter } from "./markdown-store/frontmatter.ts";
import {
  hashBuiltIn,
  isDrifted,
  PROVENANCE_FRONTMATTER_KEYS,
  readProvenance,
  stampProvenance,
} from "./override-provenance.ts";

const SYSTEM_PROMPT_FILENAME = "system-prompt.md";

// The built-in is a static import, so its hash never changes at runtime —
// compute it once (GET /system-prompt is polled every 5s).
const BUILT_IN_HASH = hashBuiltIn(SYSTEM_INSTRUCTION);

/** Full state of the custom system prompt for the editor. */
export interface SystemPromptState {
  /** The user's custom prompt body ("" when tracking the built-in default). */
  content: string;
  /** Whether the built-in default changed since this prompt was forked. */
  drifted: boolean;
  /** Producer Pal version the prompt was forked from (null when none). */
  forkedFromVersion: string | null;
}

/**
 * Read the custom system prompt body verbatim, frontmatter stripped. A
 * missing/unreadable file yields "", which callers treat as "use the built-in
 * default".
 *
 * @returns The custom prompt body, or "" when absent/unreadable
 */
export function readSystemPrompt(): string {
  return readSystemPromptState().content;
}

/**
 * Read the custom system prompt plus its fork-time drift state, for the editor.
 * A hand-authored file with no provenance frontmatter reads as content with no
 * drift.
 *
 * @returns The prompt body, drift flag, and fork-time version
 */
export function readSystemPromptState(): SystemPromptState {
  const { data, body } = parseFrontmatter(
    readConfigMarkdown(SYSTEM_PROMPT_FILENAME),
    PROVENANCE_FRONTMATTER_KEYS,
  );
  const provenance = body.trim() ? readProvenance(data) : null;

  return {
    content: body,
    drifted: isDrifted(provenance, BUILT_IN_HASH),
    forkedFromVersion: provenance?.producerPalVersion ?? null,
  };
}

/**
 * Overwrite the custom system prompt, stamping fork-time provenance in
 * frontmatter (atomic temp+rename). Blank content resets to the built-in
 * (deletes the file), matching the editor's "reset to default".
 *
 * @param content - New system prompt body (blank resets to the built-in)
 * @returns The prompt's new state
 */
export function writeSystemPrompt(content: string): SystemPromptState {
  if (!content.trim()) return deleteSystemPrompt();

  writeConfigMarkdown(
    SYSTEM_PROMPT_FILENAME,
    stampProvenance(content, BUILT_IN_HASH),
  );

  return readSystemPromptState();
}

/**
 * Reset the custom system prompt to the built-in default (delete its file).
 *
 * @returns The prompt's new state (content cleared)
 */
export function deleteSystemPrompt(): SystemPromptState {
  deleteConfigMarkdown(SYSTEM_PROMPT_FILENAME);

  return readSystemPromptState();
}
