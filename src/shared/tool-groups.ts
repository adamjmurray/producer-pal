// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// The server's tool catalog, grouped. One table behind the chat UI's Tools tab
// and the portal's `--tools` / `--disable-tools` flags, so the two can't drift.
//
// Deliberately import-free, like config.ts: the web UI compiles this file under
// a tsconfig without allowImportingTsExtensions, so a `#src/...ts` import here
// breaks that build. That is why the names are literals instead of coming from
// the tool defs — `tool-groups-catalog.test.ts` asserts the table covers the real
// catalog exactly, so a new tool fails a test rather than silently going
// ungrouped.

/** The Direct Live API tool's id, in the toolset map and the MCP catalog. */
export const LIVE_API_TOOL_ID = "ppal-live-api";

/** The entry-point tool. Withholding it costs a client the whole Skills blob. */
export const CONNECT_TOOL_ID = "ppal-connect";

/** The `ppal-` prefix every server tool name carries. */
export const TOOL_NAME_PREFIX = "ppal-";

export interface ToolGroup {
  /** Slug the portal's `--tools` / `--disable-tools` flags accept. */
  alias: string;
  /** Heading shown in the chat UI's Tools tab. */
  label: string;
  toolIds: readonly string[];
}

/**
 * The catalog as a partition: every server tool appears in exactly one group.
 * Order is the Tools-tab reading order.
 */
export const TOOL_GROUPS: readonly ToolGroup[] = [
  {
    alias: "core",
    label: "Core",
    toolIds: [CONNECT_TOOL_ID, "ppal-context"],
  },
  {
    alias: "session",
    label: "Session",
    toolIds: ["ppal-playback", "ppal-library", "ppal-select"],
  },
  {
    alias: "actions",
    label: "Actions",
    toolIds: ["ppal-delete", "ppal-duplicate"],
  },
  {
    alias: "live-set",
    label: "Live Set",
    toolIds: ["ppal-read-live-set", "ppal-update-live-set"],
  },
  {
    alias: "track",
    label: "Track",
    toolIds: ["ppal-create-track", "ppal-read-track", "ppal-update-track"],
  },
  {
    alias: "scene",
    label: "Scene",
    toolIds: ["ppal-create-scene", "ppal-read-scene", "ppal-update-scene"],
  },
  {
    alias: "clip",
    label: "Clip",
    toolIds: ["ppal-create-clip", "ppal-read-clip", "ppal-update-clip"],
  },
  {
    alias: "device",
    label: "Device",
    toolIds: ["ppal-create-device", "ppal-read-device", "ppal-update-device"],
  },
  {
    alias: "advanced",
    label: "Advanced",
    toolIds: [LIVE_API_TOOL_ID],
  },
];

/** The `read-only` alias, kept as a constant because two places name it. */
export const READ_ONLY_ALIAS = "read-only";

/**
 * The tools that change nothing — exactly the defs declaring
 * `annotations.readOnlyHint: true`, which a test enforces. The line is Live's
 * undo history: `ppal-select` only moves the view and selection, which Live
 * doesn't record, so it counts as read-only; `ppal-playback` runs the transport
 * and `ppal-context` can rewrite stored memory, so neither is here.
 *
 * A cross-cutting alias rather than a group: it spans most of {@link
 * TOOL_GROUPS}, and it is where the token savings actually are. It withholds
 * every writer, which drops the `transforms-*`, `devices-write`,
 * `arrangement-write`, and notation `-write` skills fragments along with their
 * schemas.
 */
export const READ_ONLY_TOOLS: readonly string[] = [
  CONNECT_TOOL_ID,
  "ppal-library",
  "ppal-select",
  "ppal-read-live-set",
  "ppal-read-track",
  "ppal-read-scene",
  "ppal-read-clip",
  "ppal-read-device",
];

/**
 * Every tool the server can offer, INCLUDING the opt-in `ppal-live-api`.
 *
 * Complement `--tools` against this, never against `TOOL_NAMES`
 * (create-mcp-server.ts) — that constant deliberately omits `ppal-live-api`, so
 * complementing it would leave the tool off the disabled list and leak it into a
 * narrowed session on a device where the flag is on.
 */
export const ALL_TOOL_IDS: readonly string[] = TOOL_GROUPS.flatMap(
  (group) => group.toolIds,
);

/**
 * Resolve user-supplied tool text to tool names. Accepts group aliases
 * (`clip`, `read-only`), bare names (`read-clip`), and full names
 * (`ppal-read-clip`), separated by commas or whitespace, in any mix and case.
 *
 * Aliases win over bare names when both could match; no tool shares a name with
 * a group today, and a test holds that.
 *
 * An unrecognized item is reported and skipped rather than fatal: a portal
 * cached by npx can be older than the device, and it must still start when
 * handed a name it doesn't know — same policy as `--notation`.
 *
 * @param raw - The user's list, e.g. `"clip, read-only, playback"`
 * @param onUnknown - Called once per unrecognized item
 * @returns The resolved tool names, deduped, in catalog order
 */
export function resolveToolNames(
  raw: string,
  onUnknown: (item: string) => void,
): string[] {
  const resolved = new Set<string>();
  const catalog = new Set(ALL_TOOL_IDS);

  for (const item of raw.split(/[,\s]+/)) {
    const key = item.trim().toLowerCase();

    if (key === "") continue;

    const group = TOOL_GROUPS.find((g) => g.alias === key);

    if (group) {
      for (const id of group.toolIds) resolved.add(id);
      continue;
    }

    if (key === READ_ONLY_ALIAS) {
      for (const id of READ_ONLY_TOOLS) resolved.add(id);
      continue;
    }

    const name = toToolName(key);

    if (catalog.has(name)) {
      resolved.add(name);
    } else {
      onUnknown(item.trim());
    }
  }

  return ALL_TOOL_IDS.filter((id) => resolved.has(id));
}

/**
 * Normalize one user-typed item to a full tool name, adding the `ppal-` prefix
 * if it is missing. Does not check the catalog — callers that need to know
 * whether the tool exists check for themselves.
 * @param item - The item as the user spelled it
 * @returns The full tool name, lowercased
 */
export function toToolName(item: string): string {
  const key = item.trim().toLowerCase();

  return key.startsWith(TOOL_NAME_PREFIX) ? key : `${TOOL_NAME_PREFIX}${key}`;
}
