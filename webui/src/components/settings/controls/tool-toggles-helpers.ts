// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type McpTool } from "#webui/hooks/connection/use-mcp-connection";

interface ToolGroup {
  label: string;
  toolIds: string[];
}

export interface GroupedTools {
  label: string;
  tools: McpTool[];
}

export const LIVE_API_TOOL_ID = "ppal-live-api";

// Description shown when the server hasn't returned ppal-live-api (i.e. it's
// currently disabled at the device level). Keep terse and aligned with the
// server-side toolDefLiveApi description so toggling on doesn't surprise the
// user with a different blurb.
const LIVE_API_TOOL_FALLBACK: McpTool = {
  id: LIVE_API_TOOL_ID,
  name: "Live API",
  description:
    "Direct access to the Ableton Live Object Model. " +
    "Mirrors the Setup-tab toggle on the Max for Live device.",
};

/**
 * Inject the Live API tool placeholder into the tools list if the server
 * didn't return it. The Tools-tab Core group always shows a Live API checkbox
 * so the user can toggle it on/off from the chat UI, even when it's currently
 * disabled at the device level.
 * @param tools - Tools as returned by MCP listTools
 * @returns Tools list guaranteed to contain a Live API entry
 */
export function ensureLiveApiTool(tools: McpTool[]): McpTool[] {
  if (tools.some((t) => t.id === LIVE_API_TOOL_ID)) return tools;

  return [...tools, LIVE_API_TOOL_FALLBACK];
}

const TOOL_GROUPS: ToolGroup[] = [
  {
    label: "Core",
    toolIds: ["ppal-connect", "ppal-context"],
  },
  {
    label: "Session",
    toolIds: ["ppal-playback", "ppal-library", "ppal-select"],
  },
  {
    label: "Actions",
    toolIds: ["ppal-delete", "ppal-duplicate"],
  },
  {
    label: "Live Set",
    toolIds: ["ppal-read-live-set", "ppal-update-live-set"],
  },
  {
    label: "Track",
    toolIds: ["ppal-create-track", "ppal-read-track", "ppal-update-track"],
  },
  {
    label: "Scene",
    toolIds: ["ppal-create-scene", "ppal-read-scene", "ppal-update-scene"],
  },
  {
    label: "Clip",
    toolIds: ["ppal-create-clip", "ppal-read-clip", "ppal-update-clip"],
  },
  {
    label: "Device",
    toolIds: ["ppal-create-device", "ppal-read-device", "ppal-update-device"],
  },
  {
    label: "Advanced",
    toolIds: ["ppal-live-api"],
  },
];

/**
 * Groups tools by category based on TOOL_GROUPS definitions.
 * Tools not matching any group are placed in an "Other" group at the end.
 * @param tools - Available MCP tools
 * @returns Grouped tools with labels, omitting empty groups
 */
export function groupTools(tools: McpTool[]): GroupedTools[] {
  const toolMap = new Map(tools.map((t) => [t.id, t]));
  const usedIds = new Set<string>();

  const groups: GroupedTools[] = [];

  for (const group of TOOL_GROUPS) {
    const matched: McpTool[] = [];

    for (const id of group.toolIds) {
      const tool = toolMap.get(id);

      if (tool) {
        matched.push(tool);
        usedIds.add(id);
      }
    }

    if (matched.length > 0) {
      groups.push({ label: group.label, tools: matched });
    }
  }

  const ungrouped = tools.filter((t) => !usedIds.has(t.id));

  if (ungrouped.length > 0) {
    groups.push({ label: "Debugging", tools: ungrouped });
  }

  return groups;
}
