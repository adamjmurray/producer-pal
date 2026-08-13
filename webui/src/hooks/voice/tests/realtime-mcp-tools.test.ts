// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { type McpToolDefinition } from "#webui/chat/helpers/mcp-client-helpers";
import {
  callToolMock,
  closeMock,
  createConnectedMcpClientMock,
  fakeMcpClient,
  listToolsMock,
  mcpClientHelpersMock,
  mockCallToolText,
  mockListBareTools,
  mockListTwoTools,
  resetMcpClientMocks,
} from "#webui/hooks/voice/gemini/tests/mcp-bridge-test-helpers";

// connectAndListTools stays real — it owns the close-on-catalog-failure path.
vi.mock(import("#webui/chat/helpers/mcp-client-helpers"), () =>
  mcpClientHelpersMock(),
);

import { createRealtimeMcpTools } from "#webui/hooks/voice/realtime-mcp-tools";

afterEach(resetMcpClientMocks);

const MCP_URL = "http://localhost:3350/mcp";

/**
 * Build a barebones MCP tool fixture suitable for listTools() mocking.
 *
 * @param name - Tool name
 * @returns Single-tool fixture array
 */
function singleToolFixture(name: string): McpToolDefinition[] {
  return [{ name, description: "", inputSchema: { properties: {} } }];
}

/**
 * Set up listTools mock with a single tool and build the Realtime adapter.
 *
 * @param name - The MCP tool name to expose
 * @returns The first wrapped SDK tool
 */
async function buildSingleTool(name: string): Promise<unknown> {
  listToolsMock.mockResolvedValueOnce({ tools: singleToolFixture(name) });
  const { tools } = await createRealtimeMcpTools(MCP_URL);

  return tools[0]!;
}

describe("createRealtimeMcpTools", () => {
  it("maps MCP tools to Realtime tools with normalized schemas", async () => {
    mockListTwoTools();

    const { tools, mcpClient } = await createRealtimeMcpTools(MCP_URL);

    expect(mcpClient).toBe(fakeMcpClient);
    expect(tools).toHaveLength(2);
    // SDK exposes tool names with hyphens normalized to underscores for OpenAI.
    expect(tools.map((t) => t.name)).toStrictEqual([
      "ppal_read_track",
      "ppal_create_clip",
    ]);

    // The agents SDK exposes parameters on the tool; check the normalized shape.
    const t0 = tools[0] as unknown as { parameters: Record<string, unknown> };

    expect(t0.parameters.type).toBe("object");
    expect(t0.parameters.additionalProperties).toBe(true);
    expect(t0.parameters.required).toStrictEqual(["trackIndex"]);

    const t1 = tools[1] as unknown as { parameters: Record<string, unknown> };

    expect(t1.parameters.type).toBe("object");
    expect(t1.parameters.required).toStrictEqual([]);
  });

  it("filters tools using the enabledTools map", async () => {
    mockListBareTools("ppal-a", "ppal-b", "ppal-c");

    const { tools } = await createRealtimeMcpTools(
      "http://localhost:3350/mcp",
      { "ppal-a": true, "ppal-b": false, "ppal-c": true },
    );

    expect(tools.map((t) => t.name)).toStrictEqual(["ppal_a", "ppal_c"]);
  });

  it("sends the toolset to the server, but no small-model mode or notation", async () => {
    mockListBareTools("ppal-a");

    const enabledTools = { "ppal-a": true, "ppal-b": false };

    await createRealtimeMcpTools(MCP_URL, enabledTools);

    // The disabled-tools header is what stops the server from shipping skills
    // fragments for tools voice can't call. The two undefineds keep voice on the
    // device globals for small-model mode and notation.
    expect(createConnectedMcpClientMock).toHaveBeenCalledWith(
      MCP_URL,
      undefined,
      enabledTools,
      undefined,
    );
  });

  it("execute() forwards args to mcpClient.callTool and returns text content", async () => {
    mockListBareTools("ppal-read-live-set");
    mockCallToolText("Track 1: Drums", "Track 2: Bass");

    const { tools } = await createRealtimeMcpTools("http://localhost:3350/mcp");
    const out = await runTool(tools[0]!, { foo: "bar" });

    expect(callToolMock).toHaveBeenCalledWith(
      { name: "ppal-read-live-set", arguments: { foo: "bar" } },
      undefined,
      { timeout: 30_000 },
    );
    expect(out).toBe("Track 1: Drums\nTrack 2: Bass");
  });

  it("forwards an empty-object args call to mcpClient.callTool", async () => {
    callToolMock.mockResolvedValueOnce({
      isError: false,
      content: [{ type: "text", text: "ok" }],
    });
    const tool = await buildSingleTool("ppal-x");

    await runTool(tool, {});
    expect(callToolMock).toHaveBeenCalledWith(
      { name: "ppal-x", arguments: {} },
      undefined,
      { timeout: 30_000 },
    );
  });

  it("caps the tool call with a request timeout so a stuck Live op surfaces fast", async () => {
    callToolMock.mockResolvedValueOnce({
      isError: false,
      content: [{ type: "text", text: "ok" }],
    });
    const tool = await buildSingleTool("ppal-slow");

    await runTool(tool, {});
    expect(callToolMock).toHaveBeenLastCalledWith(
      expect.anything(),
      undefined,
      { timeout: 30_000 },
    );
  });

  it("execute() returns prefixed error text instead of throwing when MCP isError is true", async () => {
    callToolMock.mockResolvedValueOnce({
      isError: true,
      content: [{ type: "text", text: "trackIndex out of range" }],
    });
    const tool = await buildSingleTool("ppal-broken");
    const out = await runTool(tool, {});

    expect(typeof out).toBe("string");
    expect(out).toContain("Error from ppal-broken");
    expect(out).toContain("trackIndex out of range");
  });

  it("execute() returns error text on transport-level exception (does not throw)", async () => {
    callToolMock.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    const tool = await buildSingleTool("ppal-y");
    const out = await runTool(tool, {});

    expect(out).toContain("Error calling ppal-y");
    expect(out).toContain("ECONNREFUSED");
  });

  it("execute() coerces non-Error throwables to string", async () => {
    callToolMock.mockRejectedValueOnce("plain string crash");
    const tool = await buildSingleTool("ppal-z");
    const out = await runTool(tool, {});

    expect(out).toContain("plain string crash");
  });

  it("extractMcpText filters out non-text content items", async () => {
    callToolMock.mockResolvedValueOnce({
      isError: false,
      content: [
        { type: "text", text: "hello" },
        { type: "image", url: "data:..." },
        { type: "text", text: "world" },
      ],
    });
    const tool = await buildSingleTool("ppal-q");
    const out = await runTool(tool, {});

    expect(out).toBe("hello\nworld");
  });

  it("uses empty string for missing tool description", async () => {
    listToolsMock.mockResolvedValueOnce({
      tools: [{ name: "ppal-no-desc", inputSchema: { properties: {} } }],
    });
    const { tools } = await createRealtimeMcpTools(MCP_URL);

    expect(tools[0]).toMatchObject({ name: "ppal_no_desc", description: "" });
  });

  it("normalizes a missing inputSchema to an empty object schema", async () => {
    listToolsMock.mockResolvedValueOnce({
      tools: [{ name: "ppal-bare", description: "" }],
    });
    const { tools } = await createRealtimeMcpTools(MCP_URL);
    const t = tools[0] as unknown as { parameters: Record<string, unknown> };

    expect(t.parameters.type).toBe("object");
    expect(t.parameters.properties).toStrictEqual({});
    expect(t.parameters.required).toStrictEqual([]);
    expect(t.parameters.additionalProperties).toBe(true);
  });

  // The caller (use-voice-session) only stores mcpClient once this resolves, so a
  // throw past a successful connect leaves an open transport nothing can reach —
  // one more on every Talk retry.
  it("closes the connection when the catalog read fails", async () => {
    listToolsMock.mockRejectedValueOnce(new Error("catalog unavailable"));

    await expect(createRealtimeMcpTools(MCP_URL)).rejects.toThrow(
      "catalog unavailable",
    );
    expect(closeMock).toHaveBeenCalledOnce();
  });

  it("reports the original failure even when the close fails too", async () => {
    listToolsMock.mockRejectedValueOnce(new Error("catalog unavailable"));
    closeMock.mockRejectedValueOnce(new Error("socket already gone"));

    await expect(createRealtimeMcpTools(MCP_URL)).rejects.toThrow(
      "catalog unavailable",
    );
  });
});

/**
 * Invoke the SDK-wrapped tool with given args.
 *
 * `@openai/agents/realtime` `tool()` wraps our execute() with input
 * validation. The wrapped `invoke` takes args as a JSON STRING (matching the
 * shape the model emits over the wire), parses + validates, and only then
 * calls our adapter. Passing a raw object bypasses the validator and returns
 * a generic error string instead of round-tripping to our code.
 *
 * @param tool - The Realtime SDK tool returned from createRealtimeMcpTools
 * @param args - Arguments to pass to the tool's execute() — can be undefined
 * @returns The string output from the MCP round-trip
 */
async function runTool(tool: unknown, args: unknown): Promise<string> {
  const t = tool as {
    invoke: (ctx: unknown, argsJson: string) => Promise<string>;
  };
  const argsJson = args === undefined ? "" : JSON.stringify(args);

  return await t.invoke({}, argsJson);
}
