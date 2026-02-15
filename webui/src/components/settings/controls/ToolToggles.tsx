// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  McpStatus,
  McpTool,
} from "#webui/hooks/connection/use-mcp-connection";

interface ToolTogglesProps {
  tools: McpTool[] | null;
  mcpStatus: McpStatus;
  enabledTools: Record<string, boolean>;
  setEnabledTools: (tools: Record<string, boolean>) => void;
}

/**
 * Checkboxes for enabling/disabling individual tools
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

  const handleToggle = (toolId: string) => {
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
      allDisabled[tool.id] = false;
    }

    setEnabledTools(allDisabled);
  };

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

      <div className="grid grid-cols-2 gap-2">
        {tools.map((tool) => (
          <div key={tool.id} className="flex items-center gap-2">
            <input
              type="checkbox"
              id={`tool-${tool.id}`}
              checked={enabledTools[tool.id] ?? true}
              onChange={() => handleToggle(tool.id)}
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
