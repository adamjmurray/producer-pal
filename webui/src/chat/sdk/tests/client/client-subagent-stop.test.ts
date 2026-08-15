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

// No briefing here: a real fetch would hit the network under happy-dom, and the
// briefing path is covered in tests/subagent/subagent-briefing.test.ts.
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

import { SPAWN_SUBAGENT_TOOL_NAME } from "#webui/lib/utils/enabled-tools";
import { fetchSubagentBriefing } from "#webui/chat/sdk/subagent/subagent-briefing";
import {
  abortError,
  failingAfterStream,
} from "#webui/chat/sdk/tests/client-test-helpers";
import {
  blockedAfterStream,
  findSpawnEntry,
  orchestratorWithSpawnTool,
  streamTextMock,
  until,
} from "#webui/chat/sdk/tests/client/subagent-test-helpers";

/**
 * The stream an orchestrator turn produces when Stop lands right after it
 * issued a spawn: the tool-call part, then nothing but the abort.
 * @param toolCallId - The spawn call left without a result
 * @param task - The task argument on that call
 * @returns A streamText-shaped result
 */
function abortedAfterSpawnCall(
  toolCallId: string,
  task: string,
): ReturnType<typeof failingAfterStream> {
  return failingAfterStream(
    [
      {
        type: "tool-call",
        toolCallId,
        toolName: SPAWN_SUBAGENT_TOOL_NAME,
        input: { task },
      },
    ],
    abortError(),
  );
}

describe("ChatSdkClient Stop mid-worker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

    // The Stop lands mid-stream, not before the spawn: a signal already
    // aborted when the tool runs stops the worker before it starts (nothing to
    // stash), which is a different path from the one under test here.
    await expect(
      execute(
        { task: "rename tracks" },
        { toolCallId: "tc-stop", messages: [], abortSignal: controller.signal },
      ),
    ).rejects.toThrow("aborted");
    controller.abort();

    // The orchestrator turn that issued the spawn is aborted too, so its stream
    // dies after the tool-call part with no matching result.
    streamTextMock.mockReturnValueOnce(
      abortedAfterSpawnCall("tc-stop", "rename tracks"),
    );

    await expect(async () => {
      for await (const _ of client.sendMessage("rename tracks")) {
        /* consume */
      }
    }).rejects.toThrow("aborted");

    const entry = findSpawnEntry(client, "tc-stop");

    expect(entry?.result).toContain("Canceled");
    expect(entry?.subagentTranscript?.at(-1)?.content).toBe(
      "Renamed the Bass track.",
    );
  });

  it("waits for a worker whose briefing is still in flight", async () => {
    // The briefing is a real round trip, and a spawn is only tracked once the
    // runner has the run. Resolving the config before handing it over left the
    // run invisible to teardown for that whole window: the turn ended, and the
    // worker then edited the Live Set against a signal nobody aborted, with its
    // transcript stranded.
    const { client, execute } = await orchestratorWithSpawnTool();
    const controller = new AbortController();
    let releaseBriefing = (): void => {};

    vi.mocked(fetchSubagentBriefing).mockReturnValueOnce(
      new Promise<string | null>((resolve) => {
        releaseBriefing = () => resolve(null);
      }),
    );

    // The orchestrator's own stream, queued first because the worker can't
    // reach streamText until its briefing lands.
    streamTextMock.mockReturnValueOnce(
      abortedAfterSpawnCall("tc-brief", "write hats"),
    );

    const workerRun = execute(
      { task: "write hats" },
      { toolCallId: "tc-brief", messages: [], abortSignal: controller.signal },
    ).catch(() => "rejected");

    const turn = (async () => {
      for await (const _ of client.sendMessage("write hats")) {
        /* consume */
      }
    })().catch(() => "aborted");

    // Teardown has begun (the synthetic "canceled" entry is written first),
    // with the worker still waiting on its briefing.
    await until(() => findSpawnEntry(client, "tc-brief") != null);

    streamTextMock.mockReturnValueOnce(
      failingAfterStream(
        [{ type: "text-delta", text: "Wrote the hats." }],
        abortError(),
      ),
    );
    releaseBriefing();

    expect(await turn).toBe("aborted");
    expect(await workerRun).toBe("rejected");
    expect(
      findSpawnEntry(client, "tc-brief")?.subagentTranscript?.at(-1)?.content,
    ).toBe("Wrote the hats.");
  });

  it("waits for a worker still unwinding before it gives up on the transcript", async () => {
    // With parallel spawns the orchestrator's stream can close while a sibling's
    // abort is still in flight: that worker stashes its transcript in its own
    // finally, which hasn't run yet. Attaching before it does silently discards
    // a log that may describe edits already made to the Live Set.
    const { client, execute } = await orchestratorWithSpawnTool();
    const controller = new AbortController();
    let release = (): void => {};
    const blocked = new Promise<void>((resolve) => {
      release = () => resolve();
    });

    streamTextMock.mockReturnValueOnce(
      blockedAfterStream(
        [{ type: "text-delta", text: "Wrote the hats." }],
        blocked,
        abortError(),
      ),
    );

    const workerRun = execute(
      { task: "write hats" },
      { toolCallId: "tc-slow", messages: [], abortSignal: controller.signal },
    ).catch(() => "rejected");

    // Let the worker take its queued stream before the orchestrator queues one.
    await until(() => streamTextMock.mock.calls.length > 1);
    controller.abort();

    streamTextMock.mockReturnValueOnce(
      abortedAfterSpawnCall("tc-slow", "write hats"),
    );

    const turn = (async () => {
      for await (const _ of client.sendMessage("write hats")) {
        /* consume */
      }
    })().catch(() => "aborted");

    // The synthetic "canceled" entry is written at the top of the stream's
    // teardown, so seeing it means teardown has begun with the worker still
    // blocked — exactly the window the attach used to run in.
    await until(() => findSpawnEntry(client, "tc-slow") != null);
    release();

    expect(await turn).toBe("aborted");
    expect(await workerRun).toBe("rejected");
    expect(
      findSpawnEntry(client, "tc-slow")?.subagentTranscript?.at(-1)?.content,
    ).toBe("Wrote the hats.");
  });
});
