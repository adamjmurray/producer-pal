// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  callToolMock,
  fakeMcpClient,
  listToolsMock,
  mcpClientHelpersMock,
  resetMcpClientMocks,
} from "#webui/hooks/voice/gemini/tests/mcp-bridge-test-helpers";

vi.mock(import("#webui/chat/helpers/mcp-client-helpers"), () =>
  mcpClientHelpersMock(),
);

import { createGeminiMcpTools } from "#webui/hooks/voice/gemini/gemini-mcp-tools";

afterEach(resetMcpClientMocks);

const MCP_URL = "http://localhost:3350/mcp";

describe("createGeminiMcpTools", () => {
  it("maps MCP tools to function declarations, keeping dashed names", async () => {
    listToolsMock.mockResolvedValueOnce({
      tools: [
        {
          name: "ppal-read-track",
          description: "Read a track",
          inputSchema: {
            $schema: "https://json-schema.org/draft/2020-12/schema",
            type: "object",
            properties: { trackIndex: { type: "number" } },
            required: ["trackIndex"],
          },
        },
        {
          name: "ppal-create-clip",
          description: "Create a clip",
          inputSchema: { properties: {} }, // missing type + required — defaulted
        },
      ],
    });

    const { functionDeclarations, mcpClient } =
      await createGeminiMcpTools(MCP_URL);

    expect(mcpClient).toBe(fakeMcpClient);
    // Gemini allows dashes in function names — no underscore mangling.
    expect(functionDeclarations.map((d) => d.name)).toStrictEqual([
      "ppal-read-track",
      "ppal-create-clip",
    ]);

    const schema0 = functionDeclarations[0]!.parametersJsonSchema as Record<
      string,
      unknown
    >;

    expect(schema0.type).toBe("object");
    expect(schema0.required).toStrictEqual(["trackIndex"]);
    // $schema meta-key is stripped so Gemini's validator doesn't choke on it.
    expect(schema0.$schema).toBeUndefined();

    const schema1 = functionDeclarations[1]!.parametersJsonSchema as Record<
      string,
      unknown
    >;

    expect(schema1.type).toBe("object");
    expect(schema1.required).toStrictEqual([]);
    expect(schema1.properties).toStrictEqual({});
  });

  it("defaults the schema when a tool has no inputSchema at all", async () => {
    listToolsMock.mockResolvedValueOnce({
      tools: [{ name: "ppal-bare", description: "" }],
    });

    const { functionDeclarations } = await createGeminiMcpTools(MCP_URL);
    const schema = functionDeclarations[0]!.parametersJsonSchema as Record<
      string,
      unknown
    >;

    expect(schema).toStrictEqual({
      type: "object",
      properties: {},
      required: [],
    });
  });

  it("filters tools using the enabledTools map", async () => {
    listToolsMock.mockResolvedValueOnce({
      tools: [
        { name: "ppal-a", description: "", inputSchema: { properties: {} } },
        { name: "ppal-b", description: "", inputSchema: { properties: {} } },
        { name: "ppal-c", description: "", inputSchema: { properties: {} } },
      ],
    });

    const { functionDeclarations } = await createGeminiMcpTools(MCP_URL, {
      "ppal-a": true,
      "ppal-b": false,
      "ppal-c": true,
    });

    expect(functionDeclarations.map((d) => d.name)).toStrictEqual([
      "ppal-a",
      "ppal-c",
    ]);
  });

  it("executeTool forwards args and returns flattened text content", async () => {
    listToolsMock.mockResolvedValueOnce({
      tools: [{ name: "ppal-read-live-set", description: "", inputSchema: {} }],
    });
    callToolMock.mockResolvedValueOnce({
      isError: false,
      content: [
        { type: "text", text: "Track 1: Drums" },
        { type: "text", text: "Track 2: Bass" },
      ],
    });

    const { executeTool } = await createGeminiMcpTools(MCP_URL);
    const out = await executeTool("ppal-read-live-set", { foo: "bar" });

    expect(callToolMock).toHaveBeenCalledWith(
      { name: "ppal-read-live-set", arguments: { foo: "bar" } },
      undefined,
      { timeout: 30_000 },
    );
    expect(out).toBe("Track 1: Drums\nTrack 2: Bass");
  });

  it("executeTool returns a prefixed error string on MCP isError (no throw)", async () => {
    listToolsMock.mockResolvedValueOnce({
      tools: [{ name: "ppal-broken", description: "", inputSchema: {} }],
    });
    callToolMock.mockResolvedValueOnce({
      isError: true,
      content: [{ type: "text", text: "trackIndex out of range" }],
    });

    const { executeTool } = await createGeminiMcpTools(MCP_URL);
    const out = await executeTool("ppal-broken", {});

    expect(out).toContain("Error from ppal-broken");
    expect(out).toContain("trackIndex out of range");
  });

  it("executeTool returns error text on a transport-level throw", async () => {
    listToolsMock.mockResolvedValueOnce({
      tools: [{ name: "ppal-y", description: "", inputSchema: {} }],
    });
    callToolMock.mockRejectedValueOnce(new Error("ECONNREFUSED"));

    const { executeTool } = await createGeminiMcpTools(MCP_URL);
    const out = await executeTool("ppal-y", {});

    expect(out).toContain("Error calling ppal-y");
    expect(out).toContain("ECONNREFUSED");
  });
});
