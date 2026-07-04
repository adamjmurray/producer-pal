// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Presentation config for the memory manager's four buckets: their display
// order, headings, and a one-line purpose hint. Type is a GROUPING axis only —
// every memory contributes just its index line and loads its body on demand, so
// there is no per-type injection difference to surface here. The canonical type
// contract (validation) lives Node-side in
// src/mcp-server/helpers/memory/memory.ts and in the ppal-context tool schema;
// this is UI copy only, so the webui doesn't reach across the server boundary.

/** The four memory buckets, in list/index order (mirrors MEMORY_TYPES). */
export const MEMORY_TYPE_ORDER = [
  "user",
  "feedback",
  "goal",
  "reference",
] as const;

/** A memory bucket name. */
export type MemoryTypeName = (typeof MEMORY_TYPE_ORDER)[number];

/** Display metadata for one memory bucket. */
export interface MemoryTypeMeta {
  /** Heading shown above the group and label in the type picker. */
  label: string;
  /** One-line hint: what kind of fact this bucket holds. */
  hint: string;
}

/** Per-type display metadata (grouping label + a short purpose hint). */
export const MEMORY_TYPE_META: Record<MemoryTypeName, MemoryTypeMeta> = {
  user: { label: "User", hint: "Who they are" },
  feedback: { label: "Feedback", hint: "How to work with them" },
  goal: { label: "Goal", hint: "A cross-project goal" },
  reference: { label: "Reference", hint: "An external pointer" },
};
