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
import {
  type ChatClientConfig,
  type ChatMessage,
  type SubagentConfigOverride,
} from "#webui/chat/sdk/types";
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

  it("inherits model and system instruction", () => {
    const config = createConfig({
      systemInstruction: "custom prompt",
    });

    const worker = buildWorkerConfig(config);

    expect(worker.model).toBe(config.model);
    expect(worker.systemInstruction).toBe("custom prompt");
  });

  it("inherits smallModelMode so the worker sends its own per-request header", () => {
    const worker = buildWorkerConfig(createConfig({ smallModelMode: true }));

    expect(worker.smallModelMode).toBe(true);
  });

  describe("with a default-subagent preset override", () => {
    const override: SubagentConfigOverride = {
      model: { modelId: "cheap-worker", provider: "openai" } as never,
      smallModelMode: true,
      providerOptions: { openai: { reasoningEffort: "low" } },
      buildProviderOptions: () => {},
    };

    it("swaps in the override's model and inference", () => {
      const config = createConfig({
        model: { modelId: "orchestrator", provider: "anthropic" } as never,
        smallModelMode: false,
        subagentConfig: override,
      });

      const worker = buildWorkerConfig(config);

      expect(worker.model).toBe(override.model);
      expect(worker.smallModelMode).toBe(true);
      expect(worker.providerOptions).toStrictEqual({
        openai: { reasoningEffort: "low" },
      });
      expect(worker.buildProviderOptions).toBe(override.buildProviderOptions);
    });

    it("inherits tools when the preset saved no toolset, always the system instruction", () => {
      const config = createConfig({
        systemInstruction: "orchestrator prompt",
        enabledTools: {
          "ppal-read-live-set": true,
          [SPAWN_SUBAGENT_TOOL_NAME]: true,
        },
        subagentConfig: override, // no enabledTools on this override
      });

      const worker = buildWorkerConfig(config);

      // System instruction is never part of the override, so it always inherits.
      expect(worker.systemInstruction).toBe("orchestrator prompt");
      // No preset toolset → inherit the orchestrator's tools (minus the guard).
      expect(worker.enabledTools?.["ppal-read-live-set"]).toBe(true);
      expect(worker.enabledTools?.[SPAWN_SUBAGENT_TOOL_NAME]).toBe(false);
    });

    it("uses the preset's captured toolset as-is, still stripping spawn_subagent", () => {
      const config = createConfig({
        enabledTools: { "ppal-read-live-set": true, "ppal-delete": false },
        subagentConfig: {
          ...override,
          // A preset toolset that omits a tool the orchestrator had AND tries to
          // enable spawn_subagent — the guard must win regardless (no-nested-
          // spawn invariant preserved under presets).
          enabledTools: {
            "ppal-create-clip": true,
            [SPAWN_SUBAGENT_TOOL_NAME]: true,
          },
        },
      });

      const worker = buildWorkerConfig(config);

      // Worker tools are the preset's captured map, not a merge with the
      // orchestrator's. The orchestrator's explicit `ppal-delete: false` is NOT
      // carried over — it's absent here, which downstream (filterEnabledTools)
      // means enabled. So the preset map is used verbatim, sparse semantics and
      // all; it does not restrict the worker to only its listed tools.
      expect(worker.enabledTools?.["ppal-create-clip"]).toBe(true);
      expect(worker.enabledTools).not.toHaveProperty("ppal-delete");
      // The recursion guard overrides the preset's attempt to enable spawning.
      expect(worker.enabledTools?.[SPAWN_SUBAGENT_TOOL_NAME]).toBe(false);
    });

    it("drops the override from the worker config (workers never spawn)", () => {
      const worker = buildWorkerConfig(
        createConfig({ subagentConfig: override }),
      );

      expect(worker.subagentConfig).toBeUndefined();
    });
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

  it("runs concurrent spawns without corrupting the counter or transcripts", async () => {
    // The AI SDK invokes N execute() closures concurrently for parallel tool
    // calls; each must record its own transcript and advance the shared counter.
    const recordTranscript = vi.fn();
    const spawnState = { count: 0 };
    const tool = createSpawnSubagentTool({
      config: createConfig(),
      runWorker: vi.fn<RunWorker>().mockResolvedValue(workerHistory),
      spawnState,
      recordTranscript,
    });

    await Promise.all([
      tool.execute!({ task: "one" }, options()),
      tool.execute!(
        { task: "two" },
        { toolCallId: "tc2", messages: [], abortSignal: undefined },
      ),
    ]);

    expect(spawnState.count).toBe(2);
    expect(recordTranscript).toHaveBeenCalledTimes(2);
    expect(recordTranscript.mock.calls.map((c) => c[0]).sort()).toStrictEqual([
      "tc1",
      "tc2",
    ]);
  });

  it("throws once the per-conversation spawn cap is reached", async () => {
    const { tool, runWorker } = setup({ count: MAX_SPAWNS });

    await expect(
      tool.execute!({ task: "one more" }, options()),
    ).rejects.toThrow(`${MAX_SPAWNS}`);
    expect(runWorker).not.toHaveBeenCalled();
  });
});
