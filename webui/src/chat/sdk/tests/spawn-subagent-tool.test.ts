// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi, type Mock } from "vitest";
import {
  MAX_SPAWNS,
  MAX_WORKER_STEPS,
  SPAWN_SUBAGENT_TOOL_NAME,
  buildWorkerConfig,
  createSpawnSubagentTool,
  extractWorkerResult,
} from "#webui/chat/sdk/spawn-subagent-tool";
import { type ChatClientConfig, type ChatMessage } from "#webui/chat/sdk/types";
import { createConfig } from "./client-test-helpers";

type RunWorker = (
  workerConfig: ChatClientConfig,
  task: string,
  abortSignal?: AbortSignal,
) => Promise<ChatMessage[]>;

const options = (abortSignal?: AbortSignal) => ({
  toolCallId: "tc1",
  messages: [],
  abortSignal,
});

describe("buildWorkerConfig", () => {
  it("disables spawn_subagent in the clone (recursion guard)", () => {
    const config = createConfig({
      enabledTools: {
        "ppal-read-live-set": true,
        [SPAWN_SUBAGENT_TOOL_NAME]: true,
      },
    });

    const worker = buildWorkerConfig(config);

    expect(worker.enabledTools?.[SPAWN_SUBAGENT_TOOL_NAME]).toBe(false);
    // Other tool enablement is inherited unchanged.
    expect(worker.enabledTools?.["ppal-read-live-set"]).toBe(true);
  });

  it("gives the worker its own step budget and a fresh history", () => {
    const config = createConfig({
      chatHistory: [{ role: "user", content: "orchestrator turn" }],
    });

    const worker = buildWorkerConfig(config);

    expect(worker.maxSteps).toBe(MAX_WORKER_STEPS);
    expect(worker.chatHistory).toStrictEqual([]);
  });

  it("inherits model, temperature, and system instruction", () => {
    const config = createConfig({
      temperature: 0.7,
      systemInstruction: "custom prompt",
    });

    const worker = buildWorkerConfig(config);

    expect(worker.model).toBe(config.model);
    expect(worker.temperature).toBe(0.7);
    expect(worker.systemInstruction).toBe("custom prompt");
  });
});

describe("extractWorkerResult", () => {
  it("returns the last non-empty assistant message", () => {
    const history: ChatMessage[] = [
      { role: "user", content: "do it" },
      { role: "assistant", content: "working..." },
      { role: "assistant", content: "  Done: added a bassline.  " },
    ];

    expect(extractWorkerResult(history)).toBe("Done: added a bassline.");
  });

  it("skips error and empty assistant messages", () => {
    const history: ChatMessage[] = [
      { role: "assistant", content: "the real result" },
      {
        role: "assistant",
        content: "",
        toolCalls: [{ id: "t", name: "x", args: {} }],
      },
      { role: "assistant", content: "boom", isError: true },
    ];

    expect(extractWorkerResult(history)).toBe("the real result");
  });

  it("falls back when the worker produced no final text", () => {
    const history: ChatMessage[] = [{ role: "user", content: "do it" }];

    expect(extractWorkerResult(history)).toBe(
      "The subagent finished without a final message.",
    );
  });
});

describe("createSpawnSubagentTool", () => {
  const workerHistory: ChatMessage[] = [
    { role: "user", content: "write a bassline" },
    { role: "assistant", content: "Added a bassline in the Bass track." },
  ];

  const setup = (overrides?: {
    config?: Partial<ChatClientConfig>;
    runWorker?: Mock<RunWorker>;
    count?: number;
  }) => {
    const runWorker: Mock<RunWorker> =
      overrides?.runWorker ??
      vi.fn<RunWorker>().mockResolvedValue(workerHistory);
    const spawnState = { count: overrides?.count ?? 0 };
    const tool = createSpawnSubagentTool({
      config: createConfig(overrides?.config),
      runWorker,
      spawnState,
    });

    return { tool, runWorker, spawnState };
  };

  it("runs a worker and returns its compact final message", async () => {
    const { tool, runWorker } = setup();

    const result = await tool.execute!({ task: "write a bassline" }, options());

    expect(result).toBe("Added a bassline in the Bass track.");
    // The worker config passed to runWorker has spawn disabled.
    const workerConfig = runWorker.mock.calls[0]?.[0] as ChatClientConfig;

    expect(workerConfig.enabledTools?.[SPAWN_SUBAGENT_TOOL_NAME]).toBe(false);
    expect(runWorker.mock.calls[0]?.[1]).toBe("write a bassline");
  });

  it("forwards the abort signal to the worker", async () => {
    const { tool, runWorker } = setup();
    const controller = new AbortController();

    await tool.execute!({ task: "x" }, options(controller.signal));

    expect(runWorker.mock.calls[0]?.[2]).toBe(controller.signal);
  });

  it("increments the shared spawn counter", async () => {
    const { tool, spawnState } = setup();

    await tool.execute!({ task: "x" }, options());

    expect(spawnState.count).toBe(1);
  });

  it("records the worker transcript keyed by tool-call id (UI side channel)", async () => {
    const recordTranscript = vi.fn();
    const tool = createSpawnSubagentTool({
      config: createConfig(),
      runWorker: vi.fn<RunWorker>().mockResolvedValue(workerHistory),
      spawnState: { count: 0 },
      recordTranscript,
    });

    await tool.execute!({ task: "x" }, options());

    expect(recordTranscript).toHaveBeenCalledWith("tc1", workerHistory);
  });

  it("throws for a missing or empty task", async () => {
    const { tool, runWorker } = setup();

    await expect(tool.execute!({}, options())).rejects.toThrow("non-empty");
    await expect(tool.execute!({ task: "   " }, options())).rejects.toThrow(
      "non-empty",
    );
    expect(runWorker).not.toHaveBeenCalled();
  });

  it("throws once the per-conversation spawn cap is reached", async () => {
    const { tool, runWorker } = setup({ count: MAX_SPAWNS });

    await expect(
      tool.execute!({ task: "one more" }, options()),
    ).rejects.toThrow(`${MAX_SPAWNS}`);
    expect(runWorker).not.toHaveBeenCalled();
  });
});
