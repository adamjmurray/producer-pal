// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { LIVE_API_TOOL_ID } from "#src/shared/tool-groups";
import { type McpTool } from "#webui/hooks/connection/use-mcp-connection";
import { SPAWN_SUBAGENT_TOOL_NAME } from "#webui/lib/utils/enabled-tools";

// Description shown when the server hasn't returned ppal-live-api (i.e. it's
// currently disabled at the device level). Keep terse and aligned with the
// server-side toolDefLiveApi description so toggling on doesn't surprise the
// user with a different blurb.
const LIVE_API_TOOL: McpTool = {
  id: LIVE_API_TOOL_ID,
  name: "Live API",
  description:
    "Direct access to the Ableton Live Object Model. " +
    "Mirrors the Setup-tab toggle on the Max for Live device.",
};

const SPAWN_SUBAGENT_TOOL: McpTool = {
  id: SPAWN_SUBAGENT_TOOL_NAME,
  name: "Subagent",
  description:
    "Experimental: let the assistant delegate subtasks to nested subagents " +
    "that work in the same Live Set and report back. Off by default. Choose what " +
    "they run as (inherit, or a preset) with Subagent preset on the Presets tab.",
};

/**
 * The opt-in tools, in catalog order. Neither is reliably in the MCP /tools
 * response: Subagent never is (it runs in the browser, not on the server), and
 * Live API only while the device flag is on. The UI shows both regardless, so
 * the toolset the user sees doesn't change shape when a flag moves.
 */
const EXPERIMENTAL_TOOLS: readonly McpTool[] = [
  LIVE_API_TOOL,
  SPAWN_SUBAGENT_TOOL,
];

/** Display names of the opt-in tools, for the header indicator's tooltip. */
export const EXPERIMENTAL_TOOL_NAMES: readonly string[] =
  EXPERIMENTAL_TOOLS.map((tool) => tool.name);

/**
 * Every tool the user can switch on, whether or not it's switchable right now:
 * the server's catalog plus any missing experimental tool.
 *
 * This — not the MCP response — is what the Tools tab lists and what the header
 * indicator counts against, so the denominator holds still while the Live API
 * flag and the Subagent toggle move. Built from the server's list rather than a
 * fixed number so a narrowed catalog (the portal's `--tools`) still reads as
 * fully enabled.
 *
 * @param tools - Tools as returned by MCP listTools
 * @returns The list, with any absent experimental tool appended
 */
export function fullToolCatalog(tools: McpTool[]): McpTool[] {
  const missing = EXPERIMENTAL_TOOLS.filter(
    (experimental) => !tools.some((tool) => tool.id === experimental.id),
  );

  return missing.length > 0 ? [...tools, ...missing] : tools;
}
