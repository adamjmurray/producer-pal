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

  // Measured on Live 12.4.3: set() returns 1 whether or not the write lands, so
  // the number is not a success flag. Every case here is rejected by Live and
  // still comes back 1 — which is why the declaration in src/types/live-api.d.ts
  // says to read the property back instead of trusting the return.
  it("returns 1 from set even when Live rejects the write", async () => {
    const result = await ctx.client!.callTool({
      name: "ppal-live-api",
      arguments: {
        path: "live_set",
        operations: [
          { type: "getProperty", property: "tempo" },
          // read-only property
          { type: "set", property: "song_length", value: 999 },
          // a string into a numeric property
          { type: "set", property: "tempo", value: "not_a_number" },
          // property the object doesn't have
          { type: "set", property: "bogus_property_xyz", value: 1 },
          // past Live's maximum tempo
          { type: "set", property: "tempo", value: 9999 },
          { type: "getProperty", property: "tempo" },
        ],
      },
    });

    const parsed = parseToolResult<LiveApiResult>(result);
    const original = parsed.results[0]!.result;

    expect(parsed.results.slice(1, 5).map((r) => r.result)).toStrictEqual([
      1, 1, 1, 1,
    ]);

    // None of them landed, so nothing needs restoring.
    expect(parsed.results[5]!.result).toBe(original);
  });

  // The nonexistent-object contract, pinned so a Live upgrade that changes it
  // fails here rather than as wrong values deep inside a tool. See
  // dev/Coding-Standards.md, "What Live Returns When There Is No Object".
  it("returns the documented sentinels on a nonexistent object", async () => {
    const result = await ctx.client!.callTool({
      name: "ppal-live-api",
      arguments: {
        path: "live_set tracks 999",
        operations: [
          { type: "get", property: "name" },
          { type: "set", property: "name", value: "should not apply" },
          { type: "call", method: "stop_all_clips" },
          { type: "getstring", property: "name" },
          { type: "getcount", property: "devices" },
          { type: "info" },
          { type: "exists" },
          { type: "getProperty", property: "name" },
          { type: "getChildIds", property: "devices" },
          { type: "getColor" },
        ],
      },
    });

    const r = parseToolResult<LiveApiResult>(result).results.map(
      (entry) => entry.result,
    );

    // Live's own calls: a bare 1 means "no object, no answer".
    expect(r.slice(0, 4)).toStrictEqual([1, 1, 1, 1]);
    expect(r[4]).toBe(0);
    expect(r[5]).toBe("No object");

    // The wrapper turns all of that into ordinary empty values.
    expect(r[6]).toBe(false);
    expect(r[7]).toBeUndefined();
    expect(r[8]).toStrictEqual([]);
    expect(r[9]).toBeNull();
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

  it("counts children with getcount and reads a property as a string with getstring", async () => {
    const result = await ctx.client!.callTool({
      name: "ppal-live-api",
      arguments: {
        path: "live_set",
        operations: [
          { type: "getcount", property: "tracks" },
          { type: "getstring", property: "tempo" },
        ],
      },
    });

    const parsed = parseToolResult<LiveApiResult>(result);

    expect(parsed.results[0]!.result).toBeGreaterThan(0);
    // Max renders a float property with a trailing dot: "120."
    expect(parsed.results[1]!.result).toMatch(/^\d/);
  });

  it("retargets the object with set_path", async () => {
    const result = await ctx.client!.callTool({
      name: "ppal-live-api",
      arguments: {
        path: "live_set tracks 0",
        operations: [
          { type: "get_property", property: "id" },
          { type: "set_path", value: "live_set tracks 1" },
          { type: "get_property", property: "id" },
        ],
      },
    });

    const parsed = parseToolResult<LiveApiResult>(result);

    // set_path reads the field back rather than echoing the input.
    expect(parsed.results[1]!.result).toBe("live_set tracks 1");
    expect(parsed.results[2]!.result).not.toBe(parsed.results[0]!.result);
    expect(parsed.path).toBe("live_set tracks 1");
  });

  it('releases the object with set_path ""', async () => {
    // The whole point of the operation: clearing the path is the only way to
    // release the listeners Live installs along it, and "" is falsy, so this
    // only works because set_path requires a defined value, not a truthy one.
    const result = await ctx.client!.callTool({
      name: "ppal-live-api",
      arguments: {
        path: "live_set tracks 0",
        operations: [
          { type: "set_path", value: "" },
          { type: "get_property", property: "id" },
          { type: "exists" },
        ],
      },
    });

    const parsed = parseToolResult<LiveApiResult>(result);

    expect(parsed.results[0]!.result).toBe("");
    expect(parsed.results[1]!.result).toBe("0");
    expect(parsed.results[2]!.result).toBe(false);
    expect(parsed.path).toBe("");
  });

  it("assigns mode with set_mode, which Max coerces to 0 or 1", async () => {
    const result = await ctx.client!.callTool({
      name: "ppal-live-api",
      arguments: {
        path: "live_set",
        operations: [
          { type: "get_property", property: "mode" },
          { type: "set_mode", value: 1 },
          // 0 is falsy — same valueDefined requirement as set_path "".
          { type: "set_mode", value: 0 },
          // Max normalizes anything else, so the read-back is the truth.
          { type: "set_mode", value: 7 },
        ],
      },
    });

    const parsed = parseToolResult<LiveApiResult>(result);

    expect(parsed.results[0]!.result).toBe(0);
    expect(parsed.results[1]!.result).toBe(1);
    expect(parsed.results[2]!.result).toBe(0);
    expect(parsed.results[3]!.result).toBe(1);
  });

  it("distinguishes call from call_method", async () => {
    // Despite the names these are not aliases: call reaches the Live object,
    // call_method reaches the JavaScript wrapper.
    const liveMethod = await ctx.client!.callTool({
      name: "ppal-live-api",
      arguments: {
        path: "live_set",
        operations: [{ type: "call", method: "get_current_beats_song_time" }],
      },
    });

    expect(
      parseToolResult<LiveApiResult>(liveMethod).results[0]!.result,
    ).toMatch(/^\d+\./);

    const wrapperMethod = await ctx.client!.callTool({
      name: "ppal-live-api",
      arguments: {
        path: "live_set",
        operations: [
          { type: "call_method", method: "getProperty", args: ["tempo"] },
        ],
      },
    });

    expect(
      typeof parseToolResult<LiveApiResult>(wrapperMethod).results[0]!.result,
    ).toBe("number");

    const wrongTarget = await ctx.client!.callTool({
      name: "ppal-live-api",
      arguments: {
        path: "live_set",
        operations: [
          { type: "call_method", method: "get_current_beats_song_time" },
        ],
      },
    });

    expect(isToolError(wrongTarget)).toBe(true);
    expect(getToolErrorMessage(wrongTarget)).toContain(
      "not found on LiveAPI object",
    );
  });

  it("surfaces a tool error when a falsy-value operation omits its value", async () => {
    // set_path and set_mode take "" and 0, so they check for a defined value
    // rather than a truthy one. Omitting the value must still fail.
    for (const type of ["set_path", "set_mode"]) {
      const result = await ctx.client!.callTool({
        name: "ppal-live-api",
        arguments: {
          path: "live_set",
          operations: [{ type }],
        },
      });

      expect(isToolError(result)).toBe(true);
      expect(getToolErrorMessage(result)).toContain("requires value");
    }
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
