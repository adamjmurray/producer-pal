// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Memory identity contract: the `MemoryType` union plus the constants used to
 * validate, order, label, and set the injection policy for the LLM-managed
 * memory collection (~/.producer-pal/memory/). Node-side (nothing V8-side
 * imports it — the `ppal-context` tool schema hardcodes the enum), so it lives
 * with the store/injector under `helpers/memory/`. The filesystem store itself
 * is `global-memory-store.ts`.
 */

/**
 * The four memory buckets, remapped from Claude Code's auto-memory to music:
 *  - `user`: who they are as a musician (default key/genre, gear).
 *  - `feedback`: how the assistant should work with them (behavioral).
 *  - `project`: cross-project creative goals (an album, a sound).
 *  - `reference`: external pointers (sample folders, links).
 */
export type MemoryType = "user" | "feedback" | "project" | "reference";

/** Every memory type, in index/enum order (also the injection tier order). */
export const MEMORY_TYPES: readonly MemoryType[] = [
  "user",
  "feedback",
  "project",
  "reference",
];

/** Human headings for each type, used in the derived `MEMORY.md` index. */
export const MEMORY_TYPE_LABELS: Record<MemoryType, string> = {
  user: "User",
  feedback: "Feedback",
  project: "Project",
  reference: "Reference",
};

// Injection policy is per-type (the design pivot that keeps memory and future
// skill collections coherent). `user`/`feedback` bodies are injected eagerly on
// connect — Producer Pal has no recall harness and weak external clients don't
// reliably do a two-step `read`. `project`/`reference` are lazy: only their
// index hook is injected, and the body is fetched on demand via
// `ppal-context read`.
const EAGER_MEMORY_TYPES: ReadonlySet<MemoryType> = new Set([
  "user",
  "feedback",
]);

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

/**
 * Whether a memory type's body is injected eagerly on connect (vs lazily loaded
 * on demand).
 *
 * @param type - The memory type
 * @returns True for `user`/`feedback` (eager), false for `project`/`reference`
 */
export function isEagerMemoryType(type: MemoryType): boolean {
  return EAGER_MEMORY_TYPES.has(type);
}
