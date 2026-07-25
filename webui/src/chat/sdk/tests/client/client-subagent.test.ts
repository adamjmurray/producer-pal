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

// Shrink the worker's rate-limit backoff so the retry test doesn't wait seconds.
// A vi.fn so the shared-gate test can lengthen it for its own window.
vi.mock(import("#webui/lib/rate-limit"), async (importOriginal) => {
  const actual = await importOriginal();

  return { ...actual, calculateRetryDelay: vi.fn(() => 10) };
});

import { streamText } from "ai";
import { ChatSdkClient } from "#webui/chat/sdk/client";
import { SPAWN_SUBAGENT_TOOL_NAME } from "#webui/chat/sdk/spawn-subagent-tool";
import {
  getSubagentRateLimit,
  resetSubagentRateLimits,
} from "#webui/chat/sdk/subagent-rate-limit";
import {
  createConfig,
  mockStreamParts,
} from "#webui/chat/sdk/tests/client-test-helpers";
import { calculateRetryDelay } from "#webui/lib/rate-limit";

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
 * A stream that rejects the way a provider 429 does, for the worker retry path.
 * @param error - The error to throw on first iteration
 * @returns A streamText-shaped result whose fullStream throws
 */
function throwingStream(error: unknown): {
  fullStream: AsyncIterable<Record<string, unknown>>;
} {
  return {
    fullStream: {
      [Symbol.asyncIterator]: () => ({ next: () => Promise.reject(error) }),
    },
  };
}

/**
 * A stream that yields the given parts (same shape as mockStreamParts, but
 * returned rather than installed, so it can be queued with mockReturnValueOnce).
 * @param parts - Stream parts to emit
 * @returns A streamText-shaped result
 */
function partsStream(parts: Record<string, unknown>[]): {
  fullStream: AsyncIterable<Record<string, unknown>>;
} {
  async function* iterate(): AsyncIterable<Record<string, unknown>> {
    for (const p of parts) yield p;
  }

  return { fullStream: iterate() };
}

/**
 * Grab the spawn tool the orchestrator injected into its last streamText call.
 * @returns The spawn tool's execute function
 */
function spawnToolExecute(): (
  args: Record<string, unknown>,
  opts: { toolCallId: string; messages: []; abortSignal?: AbortSignal },
) => Promise<string> {
  const tool = lastStreamTools()[SPAWN_SUBAGENT_TOOL_NAME] as {
    execute: (
      args: Record<string, unknown>,
      opts: { toolCallId: string; messages: []; abortSignal?: AbortSignal },
    ) => Promise<string>;
  };

  return tool.execute;
}

/**
 * Poll until `condition` holds. Real timers (not fake ones) because the code
 * under test interleaves timer waits with many awaits, and advancing fake timers
 * doesn't reliably flush those. Waiting on an observable condition rather than a
 * fixed delay matters here: a fixed wait that proved too short would make the
 * shared-gate assertions fail as though the gate were per-worker.
 * @param condition - Checked after each tick
 * @param timeoutMs - Give up (and let the assertion report the real state) after this
 */
async function until(
  condition: () => boolean,
  timeoutMs = 2000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (!condition() && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

/**
 * Boot an orchestrator with spawn_subagent enabled and run one turn, so the
 * injected tool is captured in the streamText args.
 * @returns The client and the injected spawn tool's execute function
 */
async function orchestratorWithSpawnTool(): Promise<{
  client: ChatSdkClient;
  execute: ReturnType<typeof spawnToolExecute>;
}> {
  const client = new ChatSdkClient(
    "key",
    createConfig({ enabledTools: { [SPAWN_SUBAGENT_TOOL_NAME]: true } }),
  );

  await client.initialize();
  await runTurn(client);

  return { client, execute: spawnToolExecute() };
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
    const { execute } = await orchestratorWithSpawnTool();

    // The worker streams a final assistant message.
    mockStreamParts([
      { type: "text-delta", text: "Worker done." },
      { type: "finish", finishReason: "stop" },
    ]);

    const result = await execute(
      { task: "add a bassline" },
      { toolCallId: "t1", messages: [], abortSignal: undefined },
    );

    expect(result).toBe("Worker done.");
  });

  it("attaches the worker transcript to the tool result (UI-only)", async () => {
    const { client, execute } = await orchestratorWithSpawnTool();

    // Run the worker; it records its transcript keyed by tool-call id "tc-x".
    mockStreamParts([
      { type: "text-delta", text: "Worker done." },
      { type: "finish", finishReason: "stop" },
    ]);
    await execute(
      { task: "x" },
      { toolCallId: "tc-x", messages: [], abortSignal: undefined },
    );

    // A later orchestrator turn emits the matching tool-result part; the client
    // attaches the stashed transcript to that tool-result entry.
    mockStreamParts([
      {
        type: "tool-call",
        toolCallId: "tc-x",
        toolName: SPAWN_SUBAGENT_TOOL_NAME,
        input: { task: "x" },
      },
      {
        type: "tool-result",
        toolCallId: "tc-x",
        toolName: SPAWN_SUBAGENT_TOOL_NAME,
        input: { task: "x" },
        output: "Worker done.",
      },
      { type: "finish", finishReason: "stop" },
    ]);

    for await (const _ of client.sendMessage("carry on")) {
      /* consume */
    }

    const entry = client.chatHistory
      .flatMap((m) => m.toolResults ?? [])
      .find((tr) => tr.id === "tc-x");

    expect(entry?.subagentTranscript).toBeDefined();
    expect(entry?.subagentTranscript?.at(-1)?.content).toBe("Worker done.");
  });
});

describe("ChatSdkClient subagent rate-limit handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    streamTextMock.mockReset();
    resetSubagentRateLimits();
    // Restore the file-wide short backoff; the shared-gate test lengthens it.
    vi.mocked(calculateRetryDelay).mockReturnValue(10);
  });

  it("retries a rate-limited worker instead of failing the spawn", async () => {
    // Workers stream below useChat's executeWithRetry, so without the retry
    // inside runSubagent a single 429 killed the whole delegated subtask.
    const { execute } = await orchestratorWithSpawnTool();

    streamTextMock
      .mockReturnValueOnce(
        throwingStream(
          Object.assign(new Error("Too Many Requests"), { statusCode: 429 }),
        ),
      )
      .mockReturnValueOnce(
        partsStream([
          { type: "text-delta", text: "Worker done." },
          { type: "finish", finishReason: "stop" },
        ]),
      );

    const result = await execute(
      { task: "add a bassline" },
      { toolCallId: "t1", messages: [], abortSignal: undefined },
    );

    expect(result).toBe("Worker done.");
    // Cleared on the way out, so the card never keeps a stale countdown.
    expect(getSubagentRateLimit("t1")).toBeNull();
  });

  it("shares one backoff window across parallel workers", async () => {
    // The gate lives on the orchestrator client, not per worker: a 429 in the
    // first parallel spawn must stop the second from issuing its own request
    // until the cooldown elapses. Moving the gate into runSubagent would break
    // this and nothing else in the suite.
    const { execute } = await orchestratorWithSpawnTool();
    const cooldownMs = 300;

    vi.mocked(calculateRetryDelay).mockReturnValue(cooldownMs);
    streamTextMock
      .mockReturnValueOnce(
        throwingStream(
          Object.assign(new Error("Too Many Requests"), { statusCode: 429 }),
        ),
      )
      .mockImplementation(() =>
        partsStream([
          { type: "text-delta", text: "Worker done." },
          { type: "finish", finishReason: "stop" },
        ]),
      );

    const first = execute(
      { task: "a" },
      { toolCallId: "a", messages: [], abortSignal: undefined },
    );

    // The first worker publishing a backoff IS the signal that it took the 429
    // and penalized the gate — wait for that rather than guessing a delay.
    await until(() => getSubagentRateLimit("a") != null);

    const callsBeforeSecond = streamTextMock.mock.calls.length;
    const second = execute(
      { task: "b" },
      { toolCallId: "b", messages: [], abortSignal: undefined },
    );

    // The second worker parks on the shared window instead of requesting, and
    // publishes attempt null (waiting on a sibling, not its own retry). Reaching
    // that state at all proves it consulted the same gate.
    await until(() => getSubagentRateLimit("b") != null);
    expect(getSubagentRateLimit("b")?.attempt).toBeNull();
    expect(streamTextMock.mock.calls).toHaveLength(callsBeforeSecond);

    await Promise.all([first, second]);
    expect(streamTextMock.mock.calls.length).toBeGreaterThan(callsBeforeSecond);
  });

  it("still surfaces a non-rate-limit worker failure to the orchestrator", async () => {
    const { execute } = await orchestratorWithSpawnTool();

    streamTextMock.mockReturnValueOnce(
      throwingStream(new Error("MCP connection refused")),
    );

    await expect(
      execute(
        { task: "x" },
        { toolCallId: "t2", messages: [], abortSignal: undefined },
      ),
    ).rejects.toThrow("MCP connection refused");
    expect(getSubagentRateLimit("t2")).toBeNull();
  });
});
