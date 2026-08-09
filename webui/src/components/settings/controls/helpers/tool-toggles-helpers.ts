// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { TOOL_GROUPS as SERVER_TOOL_GROUPS } from "#src/shared/tool-groups";
import { type McpTool } from "#webui/hooks/connection/use-mcp-connection";
import { SPAWN_SUBAGENT_TOOL_NAME } from "#webui/lib/utils/enabled-tools";

interface ToolGroup {
  label: string;
  toolIds: readonly string[];
}

export interface GroupedTools {
  label: string;
  tools: McpTool[];
}

// The server catalog's grouping, plus the one tool the server doesn't have: the
// client-side Subagent joins Advanced. A portal has no such tool to offer, which
// is why the shared table stops at the server's own catalog.
const TOOL_GROUPS: ToolGroup[] = SERVER_TOOL_GROUPS.map((group) =>
  group.alias === "advanced"
    ? {
        label: group.label,
        toolIds: [...group.toolIds, SPAWN_SUBAGENT_TOOL_NAME],
      }
    : { label: group.label, toolIds: group.toolIds },
);

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
