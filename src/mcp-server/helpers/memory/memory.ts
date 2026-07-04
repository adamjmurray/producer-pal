// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Memory identity contract: the `MemoryType` union plus the constants used to
 * validate, order, and label the LLM-managed memory collection
 * (~/.producer-pal/memory/). Node-side (nothing V8-side imports it — the
 * `ppal-context` tool schema hardcodes the enum), so it lives with the
 * store/injector under `helpers/memory/`. The filesystem store itself is
 * `global-memory-store.ts`.
 *
 * Type is a GROUPING axis only — it decides which `## Label` section an entry
 * lands under in the derived index. It does NOT control injection: every
 * memory contributes only its index line, and every body loads on demand via
 * `ppal-context read` (see `memory-inject.ts`). Pinning a body is the context
 * layer's job, not memory's.
 */

/**
 * The four memory buckets, remapped from Claude Code's auto-memory to music:
 *  - `user`: who they are as a musician (default key/genre, gear).
 *  - `feedback`: how the assistant should work with them (behavioral).
 *  - `goal`: cross-project creative goals (an album, a sound).
 *  - `reference`: external pointers (sample folders, links).
 */
export type MemoryType = "user" | "feedback" | "goal" | "reference";

/** Every memory type, in index/enum order. */
export const MEMORY_TYPES: readonly MemoryType[] = [
  "user",
  "feedback",
  "goal",
  "reference",
];

/** Human headings for each type, used in the derived `MEMORY.md` index. */
export const MEMORY_TYPE_LABELS: Record<MemoryType, string> = {
  user: "User",
  feedback: "Feedback",
  goal: "Goal",
  reference: "Reference",
};

/**
 * Type guard for a {@link MemoryType} (validates the `type` arriving from the
 * tool schema or a hand-edited memory file's frontmatter).
 *
 * @param value - The candidate value
 * @returns True when `value` is a supported memory type
 */
export function isMemoryType(value: unknown): value is MemoryType {
  return (
    typeof value === "string" &&
    (MEMORY_TYPES as readonly string[]).includes(value)
  );
}
