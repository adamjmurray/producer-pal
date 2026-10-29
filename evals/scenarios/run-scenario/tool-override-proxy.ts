// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * A local MCP server a scenario with `toolOverrides` talks to instead of the
 * real one. It lists the real tools unchanged and forwards every call, except
 * for a tool with an override, whose result comes from the override.
 *
 * A proxy rather than a client-side hook because the agent CLIs (`claude-code`,
 * `codex-code`) own their MCP connection: the only way to change what they see
 * is to be the server they connect to. Every provider uses it, so a scenario
 * sees the same results whichever runs it.
 */

import { type Client } from "@modelcontextprotocol/sdk/client/index.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { connectMcp } from "#evals/chat/mcp.ts";
import { CLIENT_TOOL_TIMEOUT_MS } from "#src/shared/config.ts";
import {
  startStatelessMcpServer,
  type StatelessMcpServer,
} from "#src/mcp-server/helpers/http/stateless-mcp.ts";

/** The content blocks of an MCP tool result: what the model is shown. */
export type McpContent = Array<{ type: string; text?: string }>;

/**
 * Replaces what a tool returns. `callReal` makes the real call, so an override
 * can return a canned result, or the real one with changes.
 */
export type ToolOverride = (
  args: Record<string, unknown>,
  callReal: () => Promise<McpContent>,
) => McpContent | Promise<McpContent>;

/** Overrides by full tool name (`ppal-connect`). */
export type ToolOverrides = Record<string, ToolOverride>;

/**
 * Start the proxy on an ephemeral port.
 *
 * @param upstreamUrl - The real MCP server
 * @param overrides - Tools to answer from an override
 * @returns The proxy's URL, and a close that also drops the upstream connection
 */
export async function startToolOverrideProxy(
  upstreamUrl: string,
  overrides: ToolOverrides,
): Promise<StatelessMcpServer> {
  const { client } = await connectMcp(upstreamUrl);

  try {
    const server = await startStatelessMcpServer(() =>
      buildProxy(client, overrides),
    );

    return {
      url: server.url,
      close: async () => {
        try {
          await server.close();
        } finally {
          await client.close();
        }
      },
    };
  } catch (error) {
    await client.close();
    throw error;
  }
}

/**
 * Build the proxy's MCP server: handlers on the low-level server, since the
 * high-level API wants Zod schemas and the real ones must pass through as-is.
 *
 * @param client - Connection to the real server
 * @param overrides - Tools to answer from an override
 * @returns The configured server
 */
function buildProxy(client: Client, overrides: ToolOverrides): McpServer {
  const mcp = new McpServer(
    client.getServerVersion() ?? { name: "tool-override-proxy", version: "1" },
    {
      capabilities: { tools: {} },
      ...(client.getInstructions() != null && {
        instructions: client.getInstructions(),
      }),
    },
  );

  mcp.server.setRequestHandler(ListToolsRequestSchema, (request) =>
    client.listTools(request.params),
  );

  mcp.server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name } = request.params;
    const args = request.params.arguments ?? {};
    const override = overrides[name];
    const callReal = (): ReturnType<Client["callTool"]> =>
      client.callTool(request.params, undefined, {
        timeout: CLIENT_TOOL_TIMEOUT_MS,
      });

    if (override == null) {
      return await callReal();
    }

    let isError: unknown;
    const content = await override(args, async () => {
      const real = await callReal();

      isError = real.isError;

      return real.content as McpContent;
    });

    return { content, ...(isError === true && { isError }) };
  });

  return mcp;
}
