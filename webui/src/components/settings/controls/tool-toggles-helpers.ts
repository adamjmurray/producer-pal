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

const TOOL_GROUPS: ToolGroup[] = [
  {
    label: "Core",
    toolIds: ["ppal-connect", "ppal-context"],
  },
  {
    label: "Transport",
    toolIds: ["ppal-playback"],
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
    label: "Device",
    toolIds: ["ppal-create-device", "ppal-read-device", "ppal-update-device"],
  },
  {
    label: "Clip",
    toolIds: ["ppal-create-clip", "ppal-read-clip", "ppal-update-clip"],
  },
  {
    label: "Actions",
    toolIds: ["ppal-delete", "ppal-duplicate", "ppal-select"],
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
