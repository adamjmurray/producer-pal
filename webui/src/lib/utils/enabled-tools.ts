// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { SPAWN_SUBAGENT_TOOL_NAME } from "#webui/chat/sdk/subagent/spawn-subagent-tool";

/**
 * Whether a tool is effectively enabled by a toolset map. Absent means enabled
 * for ordinary tools (the map only records deviations from the default), but the
 * client-side Subagent tool is opt-in, so absent means disabled there. Mirrors
 * the Tools-tab checkbox and what the MCP layer filters on, so two maps that
 * agree here really do run the same tools.
 * @param enabledTools - Tool-enablement map (absent = default for that tool)
 * @param toolId - The tool to test
 * @returns True when the tool would be offered to the model
 */
export function isToolEnabled(
  enabledTools: Record<string, boolean>,
  toolId: string,
): boolean {
  return toolId === SPAWN_SUBAGENT_TOOL_NAME
    ? enabledTools[toolId] === true
    : enabledTools[toolId] !== false;
}

/**
 * Whether two toolset maps would offer a different set of tools. Compared by
 * effective enablement rather than key/value equality, so `{}` and
 * `{ "ppal-read-clip": true }` count as the same toolset — a saved conversation
 * shouldn't report a divergence for a map that merely spells out the defaults.
 * @param a - First tool-enablement map
 * @param b - Second tool-enablement map
 * @returns True when at least one tool is enabled in one map and not the other
 */
export function enabledToolsDiverge(
  a: Record<string, boolean>,
  b: Record<string, boolean>,
): boolean {
  const toolIds = new Set([...Object.keys(a), ...Object.keys(b)]);

  for (const toolId of toolIds) {
    if (isToolEnabled(a, toolId) !== isToolEnabled(b, toolId)) return true;
  }

  return false;
}

/**
 * Type guard for a plain object whose every value is a boolean — the shape of a
 * captured toolset map. Used where a map arrives from outside the app (imported
 * conversations, hand-editable localStorage presets).
 * @param value - A parsed value
 * @returns True when value is a Record<string, boolean>
 */
export function isEnabledToolsMap(
  value: unknown,
): value is Record<string, boolean> {
  if (typeof value !== "object" || value == null || Array.isArray(value)) {
    return false;
  }

  return Object.values(value).every((v) => typeof v === "boolean");
}
