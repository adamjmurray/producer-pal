// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { jsonSchema, type ToolSet } from "ai";

/** The tool the fixtures call; it returns a fixed result. */
export const LIVE_SET_TOOL = "ppal-read-live-set";

/** A tool whose call fails, as an MCP `isError` result does. */
export const FAILING_TOOL = "ppal-update-clip";

/**
 * Stand-in for `createMcpTools`: a single tool that returns MCP-style content.
 * @returns Tools and a placeholder MCP client
 */
export function fakeMcpTools(): { tools: ToolSet; mcpClient: never } {
  return {
    tools: {
      [LIVE_SET_TOOL]: {
        description: "Read the Live Set.",
        inputSchema: jsonSchema({
          type: "object",
          properties: { include: { type: "string" } },
        }),
        execute: () => [{ type: "text", text: "tempo 120" }],
      },
      [FAILING_TOOL]: {
        description: "Update a clip.",
        inputSchema: jsonSchema({ type: "object" }),
        execute: () => {
          throw new Error("clip 7 not found");
        },
      },
    },
    mcpClient: {} as never,
  };
}
