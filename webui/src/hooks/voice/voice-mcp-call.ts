// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type Client } from "@modelcontextprotocol/sdk/client/index.js";
import { CLIENT_TOOL_TIMEOUT_MS } from "#src/shared/config";
import { extractMcpText } from "#webui/lib/utils/mcp-content";

/**
 * Call an MCP tool and return its result as a string, never throwing. Shared by
 * both voice tool bridges (OpenAI Realtime and Gemini Live): each provider wraps
 * tools differently, but the call + result-flattening + error-as-output policy
 * is identical. MCP errors (isError) and transport/network throws are returned
 * as a prefixed string rather than thrown — the realtime models recover from a
 * tool-output error far better than from a protocol-level failure (which can
 * wedge the session).
 *
 * @param mcpClient - Connected MCP client
 * @param name - Tool name to call
 * @param args - Tool arguments
 * @returns Flattened text output, or an "Error from/calling …" string
 */
export async function callMcpToolToString(
  mcpClient: Client,
  name: string,
  args: Record<string, unknown>,
): Promise<string> {
  try {
    // Backstop for a wedged connection, not the normal way a long call ends:
    // the device answers by its own deadline with whatever landed plus a
    // warning, and CLIENT_TOOL_TIMEOUT_MS sits above that cap so it wins the
    // race. On timeout the SDK rejects with an McpError, caught below and
    // returned to the model as a tool-error string it can recover from.
    const result = await mcpClient.callTool(
      { name, arguments: args },
      undefined,
      { timeout: CLIENT_TOOL_TIMEOUT_MS },
    );

    const content = result.content as Array<{ type: string; text?: string }>;
    const text = extractMcpText(content);

    if (result.isError) return `Error from ${name}: ${text}`;

    return text;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    return `Error calling ${name}: ${message}`;
  }
}
