// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type Client } from "@modelcontextprotocol/sdk/client/index.js";
import { extractMcpText } from "#webui/lib/utils/mcp-content";

// Backstop for a wedged connection, not the normal way a long call ends: the
// device enforces its own deadline (45s by default, 60s at most) and answers
// with whatever landed plus a warning. Keep this at the SDK's 60s default so
// that answer always wins the race — a cut-short tool stops ~4s before the
// device's timeout, so its partial result arrives even at the 60s setting.
// On timeout the SDK rejects with an McpError, which is caught below and
// returned to the model as a normal tool-error string so it can recover.
export const VOICE_TOOL_TIMEOUT_MS = 60_000;

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
    const result = await mcpClient.callTool(
      { name, arguments: args },
      undefined,
      {
        timeout: VOICE_TOOL_TIMEOUT_MS,
      },
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
