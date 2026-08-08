// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { SPAWN_SUBAGENT_TOOL_NAME } from "#webui/chat/sdk/subagent/spawn-subagent-tool";
import { type McpTool } from "#webui/hooks/connection/use-mcp-connection";
import { LIVE_API_TOOL_ID } from "#webui/lib/utils/enabled-tools";

interface ToolGroup {
  label: string;
  toolIds: string[];
}

export interface GroupedTools {
  label: string;
  tools: McpTool[];
}

// The client-side Subagent toggle's enabledTools key. Shares the tool name so
// the Tools-tab checkbox and client.ts injection read/write the same flag.
export const SPAWN_SUBAGENT_TOOL_ID = SPAWN_SUBAGENT_TOOL_NAME;

// Subagent is client-side (never in the MCP /tools response) and opt-in (off by
// default), so it needs a placeholder like the Live API tool. Kept terse.
const SPAWN_SUBAGENT_TOOL: McpTool = {
  id: SPAWN_SUBAGENT_TOOL_ID,
  name: "Subagent",
  description:
    "Experimental: let the assistant delegate subtasks to nested subagents " +
    "that work in the same Live Set and report back. Off by default. Choose what " +
    "they run as (inherit, or a preset) with Subagent preset on the Presets tab.",
};

/**
 * Inject the Subagent pseudo-tool so the Tools tab shows a toggle for it. It is
 * never in the MCP /tools response (it runs in the browser, not on the server),
 * so this appends it unconditionally when absent.
 * @param tools - Tools as returned by MCP listTools
 * @returns Tools list guaranteed to contain the Subagent entry
 */
export function ensureSpawnSubagentTool(tools: McpTool[]): McpTool[] {
  if (tools.some((t) => t.id === SPAWN_SUBAGENT_TOOL_ID)) return tools;

  return [...tools, SPAWN_SUBAGENT_TOOL];
}

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
    toolIds: ["ppal-live-api", SPAWN_SUBAGENT_TOOL_ID],
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
