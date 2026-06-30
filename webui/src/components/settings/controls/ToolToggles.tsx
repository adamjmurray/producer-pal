// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type VNode } from "preact";
import { type Notation } from "#src/shared/notation";
import {
  type McpStatus,
  type McpTool,
} from "#webui/hooks/connection/use-mcp-connection";
import {
  ensureLiveApiTool,
  LIVE_API_TOOL_ID,
  type GroupedTools,
  groupTools,
} from "./helpers/tool-toggles-helpers";
import { NotationSelector } from "./NotationSelector";
import { Tooltip } from "./Tooltip";

interface ToolTogglesProps {
  tools: McpTool[] | null;
  mcpStatus: McpStatus;
  enabledTools: Record<string, boolean>;
  setEnabledTools: (tools: Record<string, boolean>) => void;
  // Server-mirrored Live API state. The MCP /tools response only includes
  // ppal-live-api when the server flag is on, but we want the checkbox always
  // visible in the Core group — so its checked state binds here, not to
  // enabledTools (which is the localStorage map for ordinary tools).
  liveApiEnabled: boolean;
  setLiveApiEnabled: (enabled: boolean) => void;
  // ENABLE_LIVE_API=true (dev/build:debug) forces the server flag on and
  // makes the device-side toggle a no-op. We disable the checkbox here so
  // the UI doesn't silently snap back after a click.
  liveApiForcedOn: boolean;
  // Global notation setting, rendered as a dropdown in the Advanced group cell
  // (under the Live API toggle). Mirrors server config.notation, same as the
  // liveApiEnabled toggle above.
  notation: Notation;
  setNotation: (notation: Notation) => void;
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
  liveApiEnabled,
  setLiveApiEnabled,
  liveApiForcedOn,
  notation,
  setNotation,
}: ToolTogglesProps) {
  if (!tools) {
    return (
      <div>
        <label className="block text-sm font-medium mb-3">
          Available Tools
        </label>
        <p className="text-sm text-zinc-500">
          {mcpStatus === "error"
            ? "Tools cannot be loaded"
            : "Loading tools..."}
        </p>
      </div>
    );
  }

  const isAlwaysEnabled = (toolId: string) => toolId === "ppal-connect";

  const isToolDisabled = (toolId: string) => {
    if (isAlwaysEnabled(toolId)) return true;
    if (toolId === LIVE_API_TOOL_ID && liveApiForcedOn) return true;

    return false;
  };

  const getDisabledReason = (toolId: string): string | undefined => {
    if (toolId === LIVE_API_TOOL_ID && liveApiForcedOn) {
      return "Forced on by ENABLE_LIVE_API build flag";
    }

    return undefined;
  };

  const handleToggle = (toolId: string) => {
    if (isToolDisabled(toolId)) return;

    if (toolId === LIVE_API_TOOL_ID) {
      setLiveApiEnabled(!liveApiEnabled);

      return;
    }

    setEnabledTools({
      ...enabledTools,
      [toolId]: !enabledTools[toolId],
    });
  };

  const isToolChecked = (toolId: string) => {
    if (isAlwaysEnabled(toolId)) return true;
    if (toolId === LIVE_API_TOOL_ID) return liveApiEnabled;

    return enabledTools[toolId] ?? true;
  };

  const enableDefaultTools = () => {
    const defaults: Record<string, boolean> = {};

    for (const tool of tools) {
      if (tool.id === LIVE_API_TOOL_ID) continue;
      defaults[tool.id] = true;
    }

    setEnabledTools(defaults);
    // Live API is opt-in — not part of the default toolset. Respect the
    // forced-on flag: don't fight ENABLE_LIVE_API.
    if (!liveApiForcedOn) setLiveApiEnabled(false);
  };

  const disableAllTools = () => {
    const allDisabled: Record<string, boolean> = {};

    for (const tool of tools) {
      if (tool.id === LIVE_API_TOOL_ID) continue;
      allDisabled[tool.id] = isAlwaysEnabled(tool.id);
    }

    setEnabledTools(allDisabled);
    // Respect the forced-on flag: "disable all" shouldn't fight the env var.
    if (!liveApiForcedOn) setLiveApiEnabled(false);
  };

  const groups = groupTools(ensureLiveApiTool(tools));
  // Rendered as the Advanced group's footer (bottom-aligned under the Live API
  // toggle); see ToolGroupSection.
  const notationFooter = (
    <NotationSelector notation={notation} setNotation={setNotation} />
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <label className="block text-sm font-medium">Available Tools</label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={enableDefaultTools}
            className="px-3 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700"
          >
            Enable default toolset
          </button>
          <button
            type="button"
            onClick={disableAllTools}
            className="px-3 py-1 text-xs bg-zinc-600 text-white rounded hover:bg-zinc-700"
          >
            Disable all
          </button>
          <Tooltip text="Remove tools to simplify the interface for less capable models, or to focus on specific tasks. Recommended to enable all tools, except with local models (Ollama and LM Studio)." />
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-6 my-6">
        {groups.map((group) => (
          <ToolGroupSection
            key={group.label}
            group={group}
            isToolChecked={isToolChecked}
            isToolDisabled={isToolDisabled}
            getDisabledReason={getDisabledReason}
            onToggle={handleToggle}
            footer={group.label === "Advanced" ? notationFooter : undefined}
          />
        ))}
      </div>
    </div>
  );
}

// --- Helper components ---

interface ToolGroupSectionProps {
  group: GroupedTools;
  isToolChecked: (toolId: string) => boolean;
  isToolDisabled: (toolId: string) => boolean;
  getDisabledReason: (toolId: string) => string | undefined;
  onToggle: (toolId: string) => void;
  // Optional control rendered at the bottom of the cell (the Notation dropdown
  // in the Advanced group). `mt-auto` + the cell's `h-full` bottom-aligns it
  // within the grid row.
  footer?: VNode;
}

function ToolGroupSection({
  group,
  isToolChecked,
  isToolDisabled,
  getDisabledReason,
  onToggle,
  footer,
}: ToolGroupSectionProps) {
  return (
    <div className="flex flex-col h-full">
      <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-1">
        {group.label}
      </h4>
      <div className="space-y-1">
        {group.tools.map((tool) => {
          const reason = getDisabledReason(tool.id);

          return (
            <div
              key={tool.id}
              className="flex items-center gap-1.5 whitespace-nowrap"
            >
              <input
                type="checkbox"
                id={`tool-${tool.id}`}
                checked={isToolChecked(tool.id)}
                disabled={isToolDisabled(tool.id)}
                title={reason}
                aria-describedby={reason ? `tool-${tool.id}-reason` : undefined}
                onChange={() => onToggle(tool.id)}
              />
              <label
                htmlFor={`tool-${tool.id}`}
                className="text-sm"
                title={reason}
              >
                {tool.name}
              </label>
              {reason && (
                <span id={`tool-${tool.id}-reason`} className="sr-only">
                  {reason}
                </span>
              )}
              {tool.description && <Tooltip text={tool.description} />}
            </div>
          );
        })}
      </div>
      {footer && <div className="mt-auto pt-3">{footer}</div>}
    </div>
  );
}
