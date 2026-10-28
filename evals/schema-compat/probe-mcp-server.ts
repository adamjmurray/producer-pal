// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * A throwaway MCP server that publishes one schema-compat variant as a tool and
 * records the arguments a client sends it.
 *
 * The agent-CLI providers (Codex, Claude Code) own their own MCP connection, so
 * the AI SDK's `jsonSchema()` path the sibling probe uses can't reach them —
 * the only way to hand those CLIs a hand-written schema is to serve it over MCP.
 * `tools/list` returns `variant.schema` byte-for-byte, which is why the handlers
 * go on the low-level server underneath `McpServer` — `registerTool` takes a Zod
 * shape, and converting the corpus to Zod would change the thing being probed.
 * `tools/call` records the input and returns at once. Nothing here touches
 * Ableton.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { startStatelessMcpServer } from "#src/mcp-server/helpers/http/stateless-mcp.ts";
import { type Args, type Variant } from "./schema-compat-variants.ts";

/** A running probe server: where to point a client, and what it heard. */
export interface ProbeServer {
  /** The MCP endpoint to hand the CLI. */
  url: string;
  /** Arguments from every `tools/call`, in arrival order. */
  calls: Args[];
  /** Forget the recorded calls, so the next draw starts clean. */
  reset: () => void;
  close: () => Promise<void>;
}

/**
 * Start a probe MCP server publishing one variant's schema.
 *
 * Listens on an ephemeral port so it can't collide with a real Producer Pal
 * device on 3350, and runs stateless (a fresh Server per POST) the same way the
 * device's own endpoint does.
 *
 * @param variant - The schema variant to publish as the sole tool
 * @returns The running server's URL, its recorded calls, and a close function
 */
export async function startProbeMcpServer(
  variant: Variant,
): Promise<ProbeServer> {
  const calls: Args[] = [];
  const server = await startStatelessMcpServer(() =>
    buildServer(variant, calls),
  );

  return {
    ...server,
    calls,
    reset: () => {
      calls.length = 0;
    },
  };
}

/**
 * Build a low-level MCP server exposing the variant as its only tool.
 * @param variant - The variant to publish
 * @param calls - Mutable record of received tool-call arguments
 * @returns The configured server
 */
function buildServer(variant: Variant, calls: Args[]): McpServer {
  const mcp = new McpServer(
    { name: "schema-compat-probe", version: "1.0.0" },
    { capabilities: { tools: {} } },
  );

  mcp.server.setRequestHandler(ListToolsRequestSchema, () => ({
    tools: [
      {
        name: variant.toolName,
        description: `Probe tool for ${variant.id}. ${variant.tests}`,
        inputSchema: toolInputSchema(variant),
      },
    ],
  }));

  mcp.server.setRequestHandler(CallToolRequestSchema, (request) => {
    calls.push({ ...request.params.arguments });

    return { content: [{ type: "text" as const, text: "OK" }] };
  });

  return mcp;
}

/**
 * Republish a variant's schema as an MCP tool input schema.
 *
 * The client must see the corpus schema unaltered — that is the probe — so this
 * only widens the static type. The AI SDK's schema type also admits a promise
 * and a thunk, neither of which the corpus uses; `type` is restated because the
 * MCP tool shape wants the literal, and every variant already declares it.
 *
 * @param variant - The variant to publish
 * @returns The variant's schema, typed as an MCP tool input schema
 */
function toolInputSchema(
  variant: Variant,
): { type: "object" } & Record<string, unknown> {
  return { ...(variant.schema as Record<string, unknown>), type: "object" };
}
