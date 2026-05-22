// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E tests for ppal-live-api tool.
 *
 * The tool exposes raw Live Object Model access and is opt-in via the
 * device Setup tab (gated by config.liveApiEnabled). In e2e builds
 * (npm run build:debug) ENABLE_LIVE_API=true forces it on, but POST
 * /config remains authoritative so the runtime gate can be exercised
 * in either direction.
 *
 * Run with: npm run e2e:mcp -- ppal-live-api
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  getToolErrorMessage,
  isToolError,
  parseToolResult,
  setConfig,
  setupMcpTestContext,
} from "../mcp-test-helpers";

interface LiveApiResult {
  path?: string;
  id: string;
  results: Array<{
    operation: {
      type: string;
      property?: string;
      method?: string;
      value?: unknown;
      args?: unknown[];
    };
    result: unknown;
  }>;
}

const ctx = setupMcpTestContext({ once: true });

describe("ppal-live-api", () => {
  // setupMcpTestContext's beforeEach resets config.tools to TOOL_NAMES
  // (which excludes ppal-live-api). Re-enable here so the tool is
  // registered on the next /mcp request. setConfig({ liveApiEnabled: true })
  // also adds ppal-live-api back into the tools whitelist.
  beforeEach(async () => {
    await setConfig({ liveApiEnabled: true });
  });

  it("returns object info for live_set", async () => {
    const result = await ctx.client!.callTool({
      name: "ppal-live-api",
      arguments: {
        path: "live_set",
        operations: [{ type: "info" }],
      },
    });

    const parsed = parseToolResult<LiveApiResult>(result);

    expect(typeof parsed.path).toBe("string");
    expect(parsed.path).toContain("live_set");
    expect(parsed.results).toHaveLength(1);

    const info = parsed.results[0]!.result;

    expect(typeof info).toBe("string");
    expect(info as string).toContain("tempo");
  });

  it("reads tempo via getProperty", async () => {
    // getProperty uses the live-api-extension that returns a scalar.
    // (get_property accesses JS fields on the LiveAPI object itself —
    // suitable for built-ins like info/id/path, not Live Object props.)
    const result = await ctx.client!.callTool({
      name: "ppal-live-api",
      arguments: {
        path: "live_set",
        operations: [{ type: "getProperty", property: "tempo" }],
      },
    });

    const parsed = parseToolResult<LiveApiResult>(result);

    expect(parsed.results).toHaveLength(1);
    expect(typeof parsed.results[0]!.result).toBe("number");
  });

  it("writes tempo via set_property and reverts to the original value", async () => {
    const readResult = await ctx.client!.callTool({
      name: "ppal-live-api",
      arguments: {
        path: "live_set",
        operations: [{ type: "getProperty", property: "tempo" }],
      },
    });
    const original = parseToolResult<LiveApiResult>(readResult).results[0]!
      .result as number;

    expect(typeof original).toBe("number");

    try {
      const writeResult = await ctx.client!.callTool({
        name: "ppal-live-api",
        arguments: {
          path: "live_set",
          operations: [
            { type: "set_property", property: "tempo", value: 120 },
            { type: "getProperty", property: "tempo" },
          ],
        },
      });
      const parsed = parseToolResult<LiveApiResult>(writeResult);

      expect(parsed.results).toHaveLength(2);
      expect(parsed.results[1]!.result).toBe(120);
    } finally {
      // Restore tempo even if assertions above threw.
      await ctx.client!.callTool({
        name: "ppal-live-api",
        arguments: {
          path: "live_set",
          operations: [
            { type: "set_property", property: "tempo", value: original },
          ],
        },
      });
    }
  });

  it("executes multiple operations in a single call", async () => {
    const result = await ctx.client!.callTool({
      name: "ppal-live-api",
      arguments: {
        path: "live_set",
        operations: [
          { type: "getProperty", property: "tempo" },
          { type: "info" },
        ],
      },
    });

    const parsed = parseToolResult<LiveApiResult>(result);

    expect(parsed.results).toHaveLength(2);
    expect(typeof parsed.results[0]!.result).toBe("number");
    expect(typeof parsed.results[1]!.result).toBe("string");
  });

  it("surfaces a tool error when get_property is missing the property param", async () => {
    const result = await ctx.client!.callTool({
      name: "ppal-live-api",
      arguments: {
        path: "live_set",
        operations: [{ type: "get_property" }],
      },
    });

    expect(isToolError(result)).toBe(true);
    expect(getToolErrorMessage(result)).toContain("requires property");
  });

  it("is gated by config.liveApiEnabled at the MCP layer", async () => {
    await setConfig({ liveApiEnabled: false });

    // When the tool is not registered with the MCP server, the SDK
    // surfaces a JSON-RPC error as a tool result with isError: true
    // (text: "MCP error -32602: Tool ppal-live-api not found").
    const disabledResult = await ctx.client!.callTool({
      name: "ppal-live-api",
      arguments: {
        path: "live_set",
        operations: [{ type: "info" }],
      },
    });

    expect(isToolError(disabledResult)).toBe(true);
    expect(getToolErrorMessage(disabledResult)).toContain("not found");

    await setConfig({ liveApiEnabled: true });

    const result = await ctx.client!.callTool({
      name: "ppal-live-api",
      arguments: {
        path: "live_set",
        operations: [{ type: "info" }],
      },
    });

    expect(isToolError(result)).toBe(false);

    const parsed = parseToolResult<LiveApiResult>(result);

    expect(parsed.results).toHaveLength(1);
  });
});
