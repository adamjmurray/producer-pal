// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Presentation config for the memory manager's four buckets: their display
// order, headings, and a one-line injection hint. The canonical type contract
// (validation, injection policy) lives Node-side in
// src/mcp-server/helpers/memory/memory.ts and in the ppal-context tool schema;
// this is UI copy only, so the webui doesn't reach across the server boundary.

/** The four memory buckets, in list/injection order (mirrors MEMORY_TYPES). */
export const MEMORY_TYPE_ORDER = [
  "user",
  "feedback",
  "project",
  "reference",
] as const;

/** A memory bucket name. */
export type MemoryTypeName = (typeof MEMORY_TYPE_ORDER)[number];

/** Display metadata for one memory bucket. */
export interface MemoryTypeMeta {
  /** Heading shown above the group and label in the type picker. */
  label: string;
  /** One-line hint: whether entries of this type are always injected or lazy. */
  injection: string;
}

/**
 * Per-type display metadata. `user`/`feedback` are injected eagerly on connect;
 * `project`/`reference` are loaded on demand (see the Node-side injection
 * policy in memory.ts) — surfaced here so the manager can nudge users to keep
 * the always-on tiers small.
 */
export const MEMORY_TYPE_META: Record<MemoryTypeName, MemoryTypeMeta> = {
  user: { label: "User", injection: "Always in context" },
  feedback: { label: "Feedback", injection: "Always in context" },
  project: { label: "Project", injection: "Loaded on demand" },
  reference: { label: "Reference", injection: "Loaded on demand" },
};
