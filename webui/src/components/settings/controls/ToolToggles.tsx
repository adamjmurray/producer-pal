// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  type McpStatus,
  type McpTool,
} from "#webui/hooks/connection/use-mcp-connection";
import { type GroupedTools, groupTools } from "./tool-toggles-helpers";

interface ToolTogglesProps {
  tools: McpTool[] | null;
  mcpStatus: McpStatus;
  enabledTools: Record<string, boolean>;
  setEnabledTools: (tools: Record<string, boolean>) => void;
}

/**
 * Checkboxes for enabling/disabling individual tools, organized by category
 * @param {ToolTogglesProps} props - Component props
 * @param {McpTool[] | null} props.tools - Available tools from MCP server
 * @param {McpStatus} props.mcpStatus - MCP connection status
 * @param {Record<string, boolean>} props.enabledTools - Tool enabled states
 * @param {(tools: Record<string, boolean>) => void} props.setEnabledTools - Setter for tool states
 * @returns {JSX.Element} - React component
 */
export function ToolToggles({
  tools,
  mcpStatus,
  enabledTools,
  setEnabledTools,
}: ToolTogglesProps) {
  if (!tools) {
    return (
      <div>
        <label className="block text-sm font-medium mb-3">
          Available Tools
        </label>
        <p className="text-sm text-gray-500">
          {mcpStatus === "error"
            ? "Tools cannot be loaded"
            : "Loading tools..."}
        </p>
      </div>
    );
  }

  const isAlwaysEnabled = (toolId: string) => toolId === "ppal-connect";

  const handleToggle = (toolId: string) => {
    if (isAlwaysEnabled(toolId)) return;
    setEnabledTools({
      ...enabledTools,
      [toolId]: !enabledTools[toolId],
    });
  };

  const enableAllTools = () => {
    const allEnabled: Record<string, boolean> = {};

    for (const tool of tools) {
      allEnabled[tool.id] = true;
    }

    setEnabledTools(allEnabled);
  };

  const disableAllTools = () => {
    const allDisabled: Record<string, boolean> = {};

    for (const tool of tools) {
      allDisabled[tool.id] = isAlwaysEnabled(tool.id);
    }

    setEnabledTools(allDisabled);
  };

  const groups = groupTools(tools);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <label className="block text-sm font-medium">Available Tools</label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={enableAllTools}
            className="px-3 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700"
          >
            Enable all
          </button>
          <button
            type="button"
            onClick={disableAllTools}
            className="px-3 py-1 text-xs bg-gray-600 text-white rounded hover:bg-gray-700"
          >
            Disable all
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-6 my-6">
        {groups.map((group) => (
          <ToolGroupSection
            key={group.label}
            group={group}
            enabledTools={enabledTools}
            isAlwaysEnabled={isAlwaysEnabled}
            onToggle={handleToggle}
          />
        ))}
      </div>
    </div>
  );
}

// --- Helper components ---

interface ToolGroupSectionProps {
  group: GroupedTools;
  enabledTools: Record<string, boolean>;
  isAlwaysEnabled: (toolId: string) => boolean;
  onToggle: (toolId: string) => void;
}

function ToolGroupSection({
  group,
  enabledTools,
  isAlwaysEnabled,
  onToggle,
}: ToolGroupSectionProps) {
  return (
    <div>
      <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">
        {group.label}
      </h4>
      <div className="space-y-1">
        {group.tools.map((tool) => (
          <div key={tool.id} className="flex items-center gap-1.5">
            <input
              type="checkbox"
              id={`tool-${tool.id}`}
              checked={
                isAlwaysEnabled(tool.id) || (enabledTools[tool.id] ?? true)
              }
              disabled={isAlwaysEnabled(tool.id)}
              onChange={() => onToggle(tool.id)}
            />
            <label htmlFor={`tool-${tool.id}`} className="text-sm">
              {tool.name}
            </label>
          </div>
        ))}
      </div>
    </div>
  );
}
