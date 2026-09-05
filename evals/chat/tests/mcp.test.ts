// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";

// vi.hoisted so the spies exist before the hoisted mock factories run.
const { callTool, listTools } = vi.hoisted(() => ({
  callTool: vi.fn(),
  listTools: vi.fn(),
}));

// `as never` on each stand-in: Vitest checks a factory against the real module,
// and these cover only the handful of members the bridge touches.
vi.mock(import("@modelcontextprotocol/sdk/client/index.js"), () => ({
  Client: class {
    connect = vi.fn();
    listTools = listTools;
    callTool = callTool;
  } as never,
}));

vi.mock(import("@modelcontextprotocol/sdk/client/streamableHttp.js"), () => ({
  StreamableHTTPClientTransport: class {} as never,
}));

import { createMcpTools } from "../mcp.ts";

describe("createMcpTools — errored tool-call ids", () => {
  beforeEach(() => {
    listTools.mockResolvedValue({
      tools: [
        {
          name: "ppal-create-clip",
          description: "Create a clip",
          inputSchema: { type: "object", properties: {} },
        },
      ],
    });
  });

  /**
   * Run the generated tool's execute with one tool-call id.
   *
   * @param toolCallId - The AI SDK tool-call id to pass through
   * @returns The execute return value and the errored-id set
   */
  async function runExecute(
    toolCallId: string,
  ): Promise<{ output: unknown; erroredToolCallIds: Set<string> }> {
    const { tools, erroredToolCallIds } = await createMcpTools(
      "http://localhost:3350/mcp",
    );
    // Narrowed to the two arguments this execute reads; the SDK's full
    // ToolExecutionOptions carries several more the bridge ignores.
    const execute = tools["ppal-create-clip"]?.execute as
      | ((
          args: Record<string, unknown>,
          options: { toolCallId: string },
        ) => Promise<unknown>)
      | undefined;

    if (execute == null) throw new Error("tool has no execute");

    const output = await execute({}, { toolCallId });

    return { output, erroredToolCallIds };
  }

  it("records the id when the MCP result reports isError", async () => {
    callTool.mockResolvedValue({
      content: [{ type: "text", text: "Error: no such track" }],
      isError: true,
    });

    const { erroredToolCallIds } = await runExecute("call_a");

    expect([...erroredToolCallIds]).toStrictEqual(["call_a"]);
  });

  it("records nothing for a successful result", async () => {
    callTool.mockResolvedValue({
      content: [{ type: "text", text: "{id: '1'}" }],
    });

    const { erroredToolCallIds } = await runExecute("call_a");

    expect([...erroredToolCallIds]).toStrictEqual([]);
  });

  it("returns the MCP content untouched, error or not", async () => {
    // This value is serialized into the model's context — folding the flag into
    // it would change what every eval run sees, and shift the scores.
    const content = [{ type: "text", text: "Error: no such track" }];

    callTool.mockResolvedValue({ content, isError: true });

    const { output } = await runExecute("call_a");

    expect(output).toStrictEqual(content);
  });
});
