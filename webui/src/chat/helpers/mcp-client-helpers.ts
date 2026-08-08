// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Shared utilities for MCP client operations.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import {
  DISABLED_TOOLS_HEADER,
  SMALL_MODEL_MODE_HEADER,
} from "#src/shared/config";
import { NOTATION_HEADER, type Notation } from "#src/shared/notation";
import { disabledToolNames } from "#webui/lib/utils/enabled-tools";

const MCP_CLIENT_NAME = "producer-pal-chat-ui";
const MCP_CLIENT_VERSION = "1.0.0";

/** MCP tool definition from listTools() */
export interface McpToolDefinition {
  name: string;
  description?: string;
  inputSchema: unknown;
}

/**
 * Creates and connects an MCP client to the specified URL.
 *
 * When `smallModelMode` is provided, every request this client makes carries the
 * per-request small-model-mode header, so the server shrinks tool schemas and
 * serves the basic skills variant for THIS caller (the built-in chat, or a
 * subagent worker) independent of the global default. Omit it — as the voice
 * paths do — to send no header and let the server fall back to the global.
 *
 * `enabledTools` likewise rides along as a header, listing only what this caller
 * turned OFF: the server then neither registers those tools nor sends the skills
 * fragments that teach them. The settings connection (which needs the full
 * catalog to draw the toggles) passes neither argument and sends no headers.
 *
 * `notation` is the third such header, and the one with teeth beyond context: it
 * selects the notation this caller's skills teach AND the notation the server
 * parses/formats clip notes in, so a stark worker can run under a bar|beat
 * orchestrator. Omit it to stay on the device's global notation setting.
 *
 * @param mcpUrl - URL of the MCP server
 * @param smallModelMode - Per-request small-model mode; omit to use the global
 * @param enabledTools - Map of tool name to enabled state (absent = enabled);
 *   omit to leave the server's toolset untouched
 * @param notation - Per-request notation; omit to use the global setting
 * @returns Connected MCP client
 */
export async function createConnectedMcpClient(
  mcpUrl: string,
  smallModelMode?: boolean,
  enabledTools?: Record<string, boolean>,
  notation?: Notation,
): Promise<Client> {
  const headers = perRequestHeaders(smallModelMode, enabledTools, notation);

  const transport = new StreamableHTTPClientTransport(
    new URL(mcpUrl),
    Object.keys(headers).length === 0
      ? undefined
      : { requestInit: { headers } },
  );
  const client = new Client({
    name: MCP_CLIENT_NAME,
    version: MCP_CLIENT_VERSION,
  });

  await client.connect(transport);

  return client;
}

/**
 * The three per-request headers that describe one caller's profile: its
 * small-model mode, the tools it withholds, and its notation. Each is omitted
 * when the caller has no opinion, which is what makes the server fall back to
 * the device global.
 *
 * Exported because the MCP transport is no longer the only thing that sends
 * them — GET /subagent-briefing takes the same three, so a worker's briefing is
 * assembled for exactly the profile its tool calls will run under. One builder
 * keeps the two from drifting.
 *
 * @param smallModelMode - Per-request small-model mode; omit for the global
 * @param enabledTools - Map of tool name to enabled state (absent = enabled)
 * @param notation - Per-request notation; omit for the global setting
 * @returns The headers to send, possibly empty
 */
export function perRequestHeaders(
  smallModelMode?: boolean,
  enabledTools?: Record<string, boolean>,
  notation?: Notation,
): Record<string, string> {
  const headers: Record<string, string> = {};

  if (smallModelMode != null) {
    headers[SMALL_MODEL_MODE_HEADER] = String(smallModelMode);
  }

  const disabled = disabledToolNames(enabledTools);

  if (disabled !== "") {
    headers[DISABLED_TOOLS_HEADER] = disabled;
  }

  if (notation != null) {
    headers[NOTATION_HEADER] = notation;
  }

  return headers;
}

/**
 * Filters MCP tools based on enabled/disabled configuration.
 *
 * Kept even though {@link createConnectedMcpClient} now withholds the same tools
 * server-side: this is what decides the toolset when no header applies (the
 * voice paths), and it covers names the server's whitelist never had.
 *
 * @param tools - Array of MCP tool definitions
 * @param enabledTools - Map of tool names to enabled state (undefined = enabled)
 * @returns Filtered array of tools
 */
export function filterEnabledTools(
  tools: McpToolDefinition[],
  enabledTools?: Record<string, boolean>,
): McpToolDefinition[] {
  if (!enabledTools) return tools;

  return tools.filter((tool) => enabledTools[tool.name] !== false);
}
