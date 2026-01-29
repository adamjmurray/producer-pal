/**
 * Shared test utilities for MCP e2e tests
 */
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { afterEach, beforeEach } from "vitest";
import {
  connectMcp,
  extractToolResultText,
  type McpConnection,
} from "#evals/chat/shared/mcp.ts";
import { openLiveSet } from "#evals/eval/open-live-set.ts";

export { extractToolResultText };

export const MCP_URL = process.env.MCP_URL ?? "http://localhost:3350/mcp";
export const LIVE_SET_PATH =
  "evals/live-sets/basic-midi-4-track Project/basic-midi-4-track.als";

/**
 * Parse the compact JS literal format used by Producer Pal to save tokens.
 * Uses eval since the format is valid JS but not valid JSON (unquoted keys).
 * Safe here since we're only parsing trusted MCP server responses in local tests.
 */
export function parseCompactJSLiteral<T>(text: string): T {
  // eslint-disable-next-line no-eval -- Parsing trusted MCP server response in local e2e test
  return eval(`(${text})`) as T;
}

/**
 * MCP test context containing the client connection.
 * Use with setupMcpTestContext() to initialize.
 */
export interface McpTestContext {
  connection: McpConnection | null;
  client: Client | null;
}

/**
 * Sets up beforeEach/afterEach hooks for MCP e2e tests.
 * Returns a context object that will be populated with the client after setup.
 *
 * Usage:
 *   const ctx = setupMcpTestContext();
 *   it("test", () => { ctx.client!.callTool(...); });
 */
export function setupMcpTestContext(): McpTestContext {
  const ctx: McpTestContext = { connection: null, client: null };

  beforeEach(async () => {
    await openLiveSet(LIVE_SET_PATH);
    ctx.connection = await connectMcp(MCP_URL);
    ctx.client = ctx.connection.client;
  });

  afterEach(async () => {
    await ctx.client?.close();
  });

  return ctx;
}
