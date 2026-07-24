// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock streamText from ai (both orchestrator and worker stream through it)
vi.mock(import("ai"), async (importOriginal) => {
  const actual = await importOriginal();

  return { ...actual, streamText: vi.fn(), generateText: vi.fn() };
});

// Mock MCP tools: a baseline server tool plus a disposable mcpClient so the
// worker's dispose() (called in runSubagent's finally) doesn't throw.
vi.mock(import("#webui/chat/sdk/mcp-tools"), () => ({
  createMcpTools: vi.fn().mockResolvedValue({
    tools: { "ppal-read-live-set": { description: "read", execute: vi.fn() } },
    mcpClient: { close: vi.fn().mockResolvedValue(undefined) },
  }),
}));

vi.mock(import("#webui/utils/mcp-url"), () => ({
  getMcpUrl: vi.fn(() => "http://localhost:3000/mcp"),
}));

import { streamText } from "ai";
import { ChatSdkClient } from "#webui/chat/sdk/client";
import { SPAWN_SUBAGENT_TOOL_NAME } from "#webui/chat/sdk/spawn-subagent-tool";
import {
  createConfig,
  mockStreamParts,
} from "#webui/chat/sdk/tests/client-test-helpers";

const streamTextMock = streamText as ReturnType<typeof vi.fn>;

/**
 * The `tools` object passed to the most recent streamText call.
 * @returns The tool map streamText last received (empty if none)
 */
function lastStreamTools(): Record<string, { execute?: unknown }> {
  const calls = streamTextMock.mock.calls;
  const call = calls.at(-1)?.[0] as
    { tools?: Record<string, { execute?: unknown }> } | undefined;

  return call?.tools ?? {};
}

/**
 * Run one orchestrator turn to completion with a trivial stop stream.
 * @param client - The client to drive
 * @param message - User message to send
 */
async function runTurn(client: ChatSdkClient, message = "hi"): Promise<void> {
  mockStreamParts([{ type: "finish", finishReason: "stop" }]);

  for await (const _ of client.sendMessage(message)) {
    /* consume */
  }
}

describe("ChatSdkClient subagent injection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("injects spawn_subagent for an orchestrator that enabled it", async () => {
    const client = new ChatSdkClient(
      "key",
      createConfig({ enabledTools: { [SPAWN_SUBAGENT_TOOL_NAME]: true } }),
    );

    await client.initialize();
    await runTurn(client);

    const tools = lastStreamTools();

    expect(tools[SPAWN_SUBAGENT_TOOL_NAME]).toBeDefined();
    expect(tools["ppal-read-live-set"]).toBeDefined();
  });

  it("omits spawn_subagent when it is not enabled", async () => {
    const client = new ChatSdkClient(
      "key",
      createConfig({ enabledTools: { "ppal-read-live-set": true } }),
    );

    await client.initialize();
    await runTurn(client);

    expect(lastStreamTools()[SPAWN_SUBAGENT_TOOL_NAME]).toBeUndefined();
  });

  it("omits spawn_subagent for a worker config (recursion guard)", async () => {
    // A worker's cloned config sets the flag false even though other tools are on.
    const client = new ChatSdkClient(
      "key",
      createConfig({ enabledTools: { [SPAWN_SUBAGENT_TOOL_NAME]: false } }),
    );

    await client.initialize();
    await runTurn(client);

    expect(lastStreamTools()[SPAWN_SUBAGENT_TOOL_NAME]).toBeUndefined();
  });
});

describe("ChatSdkClient step budget", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const steppedStream = (steps: number, finishReason: string) => {
    const parts: Record<string, unknown>[] = [];

    for (let i = 0; i < steps; i++) parts.push({ type: "finish-step" });

    parts.push({ type: "finish", finishReason });

    return parts;
  };

  it("does not flag the tool-step limit at 10 steps for an orchestrator", async () => {
    const client = new ChatSdkClient(
      "key",
      createConfig({ enabledTools: { [SPAWN_SUBAGENT_TOOL_NAME]: true } }),
    );

    await client.initialize();
    mockStreamParts(steppedStream(10, "tool-calls"));

    for await (const _ of client.sendMessage("hi")) {
      /* consume */
    }

    // Orchestrator budget is widened above 10, so 10 steps is not the limit.
    expect(client.toolLimitReached).toBe(false);
  });

  it("honors an explicit worker step budget from config", async () => {
    const client = new ChatSdkClient("key", createConfig({ maxSteps: 20 }));

    await client.initialize();
    mockStreamParts(steppedStream(20, "tool-calls"));

    for await (const _ of client.sendMessage("hi")) {
      /* consume */
    }

    expect(client.toolLimitReached).toBe(true);
  });
});

describe("ChatSdkClient runSubagent (delegation)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("runs a worker session and returns its compact final message", async () => {
    const client = new ChatSdkClient(
      "key",
      createConfig({ enabledTools: { [SPAWN_SUBAGENT_TOOL_NAME]: true } }),
    );

    await client.initialize();
    // One orchestrator turn so the injected tool is captured in streamText args.
    await runTurn(client);

    const spawnTool = lastStreamTools()[SPAWN_SUBAGENT_TOOL_NAME] as {
      execute: (
        args: Record<string, unknown>,
        opts: { toolCallId: string; messages: []; abortSignal?: AbortSignal },
      ) => Promise<string>;
    };

    // The worker streams a final assistant message.
    mockStreamParts([
      { type: "text-delta", text: "Worker done." },
      { type: "finish", finishReason: "stop" },
    ]);

    const result = await spawnTool.execute(
      { task: "add a bassline" },
      { toolCallId: "t1", messages: [], abortSignal: undefined },
    );

    expect(result).toBe("Worker done.");
  });
});
