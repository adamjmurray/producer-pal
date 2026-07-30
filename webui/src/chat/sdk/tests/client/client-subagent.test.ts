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
  getSubagentBriefingUrl: vi.fn(
    () => "http://localhost:3000/subagent-briefing",
  ),
}));

// No briefing here: these cases are about the worker RUNNER (streaming, retry,
// transcripts), and a real fetch would hit the network under happy-dom. The
// briefing path itself is covered in tests/subagent/subagent-briefing.test.ts.
vi.mock(
  import("#webui/chat/sdk/subagent/subagent-briefing"),
  async (importOriginal) => {
    const actual = await importOriginal();

    return {
      ...actual,
      fetchSubagentBriefing: vi.fn().mockResolvedValue(null),
    };
  },
);

// Shrink the worker's rate-limit backoff so the retry test doesn't wait seconds.
// A vi.fn so the shared-gate test can lengthen it for its own window.
vi.mock(import("#webui/lib/rate-limit"), async (importOriginal) => {
  const actual = await importOriginal();

  return { ...actual, calculateRetryDelay: vi.fn(() => 10) };
});

import { streamText } from "ai";
import { ChatSdkClient } from "#webui/chat/sdk/client";
import {
  MAX_SPAWNS,
  SPAWN_SUBAGENT_TOOL_NAME,
  labelWorkerResult,
} from "#webui/chat/sdk/subagent/spawn-subagent-tool";
import {
  getSubagentRateLimit,
  resetSubagentRateLimits,
} from "#webui/chat/sdk/subagent/subagent-rate-limit";
import {
  createConfig,
  mockStreamParts,
} from "#webui/chat/sdk/tests/client-test-helpers";
import { type ChatMessage } from "#webui/chat/sdk/types";
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
 * @returns A streamText-shaped result whose stream throws
 */
function throwingStream(error: unknown): {
  stream: AsyncIterable<Record<string, unknown>>;
} {
  return {
    stream: {
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
  stream: AsyncIterable<Record<string, unknown>>;
} {
  async function* iterate(): AsyncIterable<Record<string, unknown>> {
    for (const p of parts) yield p;
  }

  return { stream: iterate() };
}

/**
 * A stream that emits `parts` and then fails — how a provider stream ends when
 * the turn is aborted partway through.
 * @param parts - Stream parts to emit before failing
 * @param error - The error to throw after the last part
 * @returns A streamText-shaped result
 */
function failingAfterStream(
  parts: Record<string, unknown>[],
  error: unknown,
): { stream: AsyncIterable<Record<string, unknown>> } {
  async function* iterate(): AsyncIterable<Record<string, unknown>> {
    for (const p of parts) yield p;

    throw error;
  }

  return { stream: iterate() };
}

/**
 * The error an aborted fetch/stream rejects with.
 * @returns An AbortError
 */
function abortError(): Error {
  return Object.assign(new Error("The operation was aborted."), {
    name: "AbortError",
  });
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

/**
 * One persisted spawn turn, the way a restored conversation carries it: an
 * assistant message holding the spawn call and its result, with the worker's
 * index and recorded transcript attached. This is the only durable record of a
 * worker run, so it is what initialize() reseeds `nextIndex` from — numbering has
 * to resume above the persisted workers instead of colliding with them. The
 * per-turn spawn `count` is NOT seeded from it: sendMessage resets that to 0 at
 * the top of every turn.
 * @param index - The worker index recorded on the result
 * @param transcript - The worker's recorded messages
 * @returns The assistant message to seed chatHistory with
 */
function persistedSpawn(
  index: number,
  transcript: ChatMessage[] = [{ role: "assistant", content: "earlier work" }],
): ChatMessage {
  const id = `old-${index}`;
  const args = { task: "earlier" };

  return {
    role: "assistant",
    content: "",
    toolCalls: [{ id, name: SPAWN_SUBAGENT_TOOL_NAME, args }],
    toolResults: [
      {
        id,
        name: SPAWN_SUBAGENT_TOOL_NAME,
        args,
        result: "done",
        subagentIndex: index,
        subagentTranscript: transcript,
      },
    ],
  };
}

/**
 * Boot an orchestrator over a restored conversation and run one turn, so its
 * injected spawn tool (and the counters initialize() reseeded) are in play.
 * @param chatHistory - The persisted conversation to restore
 * @returns The injected spawn tool's execute function
 */
async function restoredOrchestrator(
  chatHistory: ChatMessage[],
): Promise<ReturnType<typeof spawnToolExecute>> {
  const client = new ChatSdkClient(
    "key",
    createConfig({
      enabledTools: { [SPAWN_SUBAGENT_TOOL_NAME]: true },
      chatHistory,
    }),
  );

  await client.initialize();
  await runTurn(client);

  return spawnToolExecute();
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

    expect(result).toBe(labelWorkerResult(1, "Worker done."));
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

  it("keeps a stopped worker's partial transcript on the canceled result", async () => {
    // Stop mid-worker: the spawn rejects, so no tool-result part ever streams and
    // reconcileDanglingToolCalls synthesizes a "canceled" one. The partial log —
    // which may describe edits already made to the Live Set — has to survive onto
    // that synthetic entry, or the worker's work vanishes from the conversation.
    const { client, execute } = await orchestratorWithSpawnTool();
    const controller = new AbortController();

    // The worker got one message out before the Stop killed its stream.
    streamTextMock.mockReturnValueOnce(
      failingAfterStream(
        [{ type: "text-delta", text: "Renamed the Bass track." }],
        abortError(),
      ),
    );

    controller.abort();
    await expect(
      execute(
        { task: "rename tracks" },
        { toolCallId: "tc-stop", messages: [], abortSignal: controller.signal },
      ),
    ).rejects.toThrow("aborted");

    // The orchestrator turn that issued the spawn is aborted too, so its stream
    // dies after the tool-call part with no matching result.
    streamTextMock.mockReturnValueOnce(
      failingAfterStream(
        [
          {
            type: "tool-call",
            toolCallId: "tc-stop",
            toolName: SPAWN_SUBAGENT_TOOL_NAME,
            input: { task: "rename tracks" },
          },
        ],
        abortError(),
      ),
    );

    await expect(async () => {
      for await (const _ of client.sendMessage("rename tracks")) {
        /* consume */
      }
    }).rejects.toThrow("aborted");

    const entry = client.chatHistory
      .flatMap((m) => m.toolResults ?? [])
      .find((tr) => tr.id === "tc-stop");

    expect(entry?.result).toContain("Canceled");
    expect(entry?.subagentTranscript?.at(-1)?.content).toBe(
      "Renamed the Bass track.",
    );
  });
});

describe("ChatSdkClient resuming a worker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * Run one worker through the spawn tool and land its result on the
   * orchestrator's history, the way a completed turn does.
   * @param client - The orchestrator client
   * @param execute - Its injected spawn tool
   * @param args - Spawn arguments (task, and resumeFrom when continuing)
   * @param toolCallId - The spawn tool-call id for this run
   * @param workerText - The worker's final message this run
   * @returns The labeled result the orchestrator model received
   */
  async function recordSpawn(
    client: ChatSdkClient,
    execute: ReturnType<typeof spawnToolExecute>,
    args: Record<string, unknown>,
    toolCallId: string,
    workerText: string,
  ): Promise<string> {
    mockStreamParts([
      { type: "text-delta", text: workerText },
      { type: "finish", finishReason: "stop" },
    ]);

    const result = await execute(args, {
      toolCallId,
      messages: [],
      abortSignal: undefined,
    });

    mockStreamParts([
      {
        type: "tool-call",
        toolCallId,
        toolName: SPAWN_SUBAGENT_TOOL_NAME,
        input: args,
      },
      {
        type: "tool-result",
        toolCallId,
        toolName: SPAWN_SUBAGENT_TOOL_NAME,
        input: args,
        output: result,
      },
      { type: "finish", finishReason: "stop" },
    ]);

    for await (const _ of client.sendMessage(String(args.task))) {
      /* consume */
    }

    return result;
  }

  /**
   * The `messages` the most recent streamText call was given.
   * @returns Model messages from the last request
   */
  function lastStreamMessages(): { role: string; content: unknown }[] {
    const call = streamTextMock.mock.calls.at(-1)?.[0] as
      { messages?: { role: string; content: unknown }[] } | undefined;

    return call?.messages ?? [];
  }

  it("seeds a resumed worker with its own earlier session", async () => {
    const { client, execute } = await orchestratorWithSpawnTool();

    await recordSpawn(
      client,
      execute,
      { task: "add a bassline" },
      "tc-1",
      "Added the bassline.",
    );

    // Resume it with a follow-up. The whole point: the worker still has its
    // context, so this turn lands on top of what it already did.
    const resumed = await recordSpawn(
      client,
      execute,
      { task: "now make it swing", resumeFrom: 1 },
      "tc-2",
      "Swung it.",
    );

    // The worker keeps its number, so the orchestrator can resume it again.
    expect(resumed).toBe(labelWorkerResult(1, "Swung it."));

    const entries = client.chatHistory.flatMap((m) => m.toolResults ?? []);
    const first = entries.find((tr) => tr.id === "tc-1");
    const second = entries.find((tr) => tr.id === "tc-2");

    expect(first?.subagentIndex).toBe(1);
    expect(second?.subagentIndex).toBe(1);
    // The resume stores only what it added — the seeded prefix already lives on
    // the first run's entry, so a repeatedly-resumed worker doesn't re-persist
    // its whole history (connect result included) every time.
    expect(second?.subagentTranscript?.map((m) => m.content)).toStrictEqual([
      "now make it swing",
      "Swung it.",
    ]);
    // And the two entries stitch back into one continuous session.
    expect(
      [
        ...(first?.subagentTranscript ?? []),
        ...(second?.subagentTranscript ?? []),
      ].map((m) => m.content),
    ).toStrictEqual([
      "add a bassline",
      "Added the bassline.",
      "now make it swing",
      "Swung it.",
    ]);
  });

  it("sends the resumed worker's prior turns to the provider", async () => {
    const { client, execute } = await orchestratorWithSpawnTool();

    await recordSpawn(
      client,
      execute,
      { task: "add a bassline" },
      "tc-1",
      "Added the bassline.",
    );

    // Capture the worker's own request, not the orchestrator turn that follows.
    mockStreamParts([
      { type: "text-delta", text: "Swung it." },
      { type: "finish", finishReason: "stop" },
    ]);
    await execute(
      { task: "now make it swing", resumeFrom: 1 },
      { toolCallId: "tc-2", messages: [], abortSignal: undefined },
    );

    expect(lastStreamMessages().map((m) => m.content)).toStrictEqual([
      "add a bassline",
      "Added the bassline.",
      "now make it swing",
    ]);
  });

  it("does not write through to the persisted transcript it seeded from", async () => {
    // The seeded array is the worker's live history; if it were the stored one,
    // the resumed run would append to (and the retry path could truncate) the
    // record of a run that already happened.
    const { client, execute } = await orchestratorWithSpawnTool();

    await recordSpawn(
      client,
      execute,
      { task: "add a bassline" },
      "tc-1",
      "Added the bassline.",
    );
    await recordSpawn(
      client,
      execute,
      { task: "more", resumeFrom: 1 },
      "tc-2",
      "Did more.",
    );

    const first = client.chatHistory
      .flatMap((m) => m.toolResults ?? [])
      .find((tr) => tr.id === "tc-1");

    expect(first?.subagentTranscript?.map((m) => m.content)).toStrictEqual([
      "add a bassline",
      "Added the bassline.",
    ]);
  });

  it("continues numbering past workers a restored conversation already has", async () => {
    // nextIndex is seeded from history in initialize(); without that a new
    // worker would take number 1 again and resumeFrom would address two
    // different sessions at once.
    const execute = await restoredOrchestrator([persistedSpawn(2)]);

    mockStreamParts([
      { type: "text-delta", text: "Fresh worker." },
      { type: "finish", finishReason: "stop" },
    ]);

    const result = await execute(
      { task: "something new" },
      { toolCallId: "tc-new", messages: [], abortSignal: undefined },
    );

    expect(result).toBe(labelWorkerResult(3, "Fresh worker."));
  });

  it("caps fan-out within one turn, then clears the budget for the next", async () => {
    // MAX_SPAWNS bounds ONE turn's fan-out, not a conversation's lifetime spend:
    // the user regains control between turns and can see what the last one cost,
    // so the cap's job is to stop a single runaway turn. A turn that spends the
    // whole budget must therefore refuse the next spawn AND leave the following
    // turn able to delegate again.
    const { client, execute } = await orchestratorWithSpawnTool();

    for (let i = 0; i < MAX_SPAWNS; i++) {
      mockStreamParts([
        { type: "text-delta", text: `Worker ${i + 1}.` },
        { type: "finish", finishReason: "stop" },
      ]);
      await execute(
        { task: `piece ${i + 1}` },
        { toolCallId: `tc-${i}`, messages: [], abortSignal: undefined },
      );
    }

    await expect(
      execute(
        { task: "one too many" },
        { toolCallId: "tc-over", messages: [], abortSignal: undefined },
      ),
    ).rejects.toThrow(`${MAX_SPAWNS} per turn`);

    // The next turn starts fresh. runTurn's sendMessage is what resets the
    // counter, and the tool it re-injects shares the same spawnState.
    await runTurn(client, "keep going");

    mockStreamParts([
      { type: "text-delta", text: "Next turn's worker." },
      { type: "finish", finishReason: "stop" },
    ]);

    await expect(
      spawnToolExecute()(
        { task: "the rest" },
        { toolCallId: "tc-next", messages: [], abortSignal: undefined },
      ),
    ).resolves.toContain("Next turn's worker.");
  });

  it("does not refresh the spawn budget when a turn is RESUMED after a 429", async () => {
    // A retry is the same turn, so it keeps spending that turn's budget. If
    // resumeStream reset the counter the way sendMessage does, a turn that
    // rate-limited would silently get a second full allowance of workers — the
    // per-turn cap would become per-attempt.
    const { client, execute } = await orchestratorWithSpawnTool();

    for (let i = 0; i < MAX_SPAWNS; i++) {
      mockStreamParts([
        { type: "text-delta", text: `Worker ${i + 1}.` },
        { type: "finish", finishReason: "stop" },
      ]);
      await execute(
        { task: `piece ${i + 1}` },
        { toolCallId: `tc-${i}`, messages: [], abortSignal: undefined },
      );
    }

    mockStreamParts([{ type: "finish", finishReason: "stop" }]);

    for await (const _ of client.resumeStream()) {
      /* consume */
    }

    await expect(
      spawnToolExecute()(
        { task: "one too many" },
        { toolCallId: "tc-over", messages: [], abortSignal: undefined },
      ),
    ).rejects.toThrow(`${MAX_SPAWNS} per turn`);
  });

  it("resumes a worker restored from a persisted conversation", async () => {
    const execute = await restoredOrchestrator([
      persistedSpawn(1, [
        { role: "user", content: "earlier task" },
        { role: "assistant", content: "earlier work" },
      ]),
    ]);

    mockStreamParts([
      { type: "text-delta", text: "Picked up where I left off." },
      { type: "finish", finishReason: "stop" },
    ]);

    const result = await execute(
      { task: "keep going", resumeFrom: 1 },
      { toolCallId: "tc-resume", messages: [], abortSignal: undefined },
    );

    expect(result).toBe(labelWorkerResult(1, "Picked up where I left off."));
    expect(lastStreamMessages().map((m) => m.content)).toStrictEqual([
      "earlier task",
      "earlier work",
      "keep going",
    ]);
  });

  it("refuses to resume a worker the conversation never had", async () => {
    const { execute } = await orchestratorWithSpawnTool();

    await expect(
      execute(
        { task: "keep going", resumeFrom: 4 },
        { toolCallId: "tc-x", messages: [], abortSignal: undefined },
      ),
    ).rejects.toThrow("no subagent 4");
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

    expect(result).toBe(labelWorkerResult(1, "Worker done."));
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
