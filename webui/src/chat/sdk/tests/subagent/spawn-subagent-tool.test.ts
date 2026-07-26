// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi, type Mock } from "vitest";
import {
  MAX_SPAWNS,
  MAX_WORKER_STEPS,
  type RunWorkerOptions,
  SPAWN_SUBAGENT_TOOL_NAME,
  buildWorkerConfig,
  createSpawnSubagentTool,
  extractWorkerResult,
  labelWorkerResult,
} from "#webui/chat/sdk/subagent/spawn-subagent-tool";
import {
  type ChatClientConfig,
  type ChatMessage,
  type SubagentConfigOverride,
} from "#webui/chat/sdk/types";
import { createConfig } from "#webui/chat/sdk/tests/client-test-helpers";

type RunWorker = (options: RunWorkerOptions) => Promise<ChatMessage[]>;

const options = (abortSignal?: AbortSignal) => ({
  toolCallId: "tc1",
  messages: [],
  abortSignal,
  context: undefined,
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

  it("seeds the worker with a session to continue when resuming", () => {
    const session: ChatMessage[] = [
      { role: "user", content: "write a bassline" },
      { role: "assistant", content: "Added it." },
    ];

    const config = createConfig();
    const worker = buildWorkerConfig(config, session);

    // The seeded array becomes the worker's live history, so it's passed
    // through as-is (the caller owns making it a safe copy).
    expect(worker.chatHistory).toBe(session);
    // A resumed worker still runs under the CURRENT model, not a pinned one.
    expect(worker.model).toBe(config.model);
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

  it("inherits notation, and leaves it absent when the orchestrator has none", () => {
    // Absent = the device's global notation, which is the shipped default.
    expect(buildWorkerConfig(createConfig()).notation).toBeUndefined();
    expect(
      buildWorkerConfig(createConfig({ notation: "stark" })).notation,
    ).toBe("stark");
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

    it("runs the worker in the preset's notation, not the orchestrator's", () => {
      // The per-worker notation unblock: a bar|beat orchestrator delegating to a
      // stark worker. It rides the same spread as model/inference.
      const worker = buildWorkerConfig(
        createConfig({
          notation: "barbeat",
          subagentConfig: { ...override, notation: "stark" },
        }),
      );

      expect(worker.notation).toBe("stark");
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
    nextIndex?: number;
    active?: number[];
    getSession?: (index: number) => ChatMessage[] | undefined;
  }) => {
    const runWorker: Mock<RunWorker> =
      overrides?.runWorker ??
      vi.fn<RunWorker>().mockResolvedValue(workerHistory);
    const spawnState = {
      count: overrides?.count ?? 0,
      nextIndex: overrides?.nextIndex ?? 0,
      active: new Set(overrides?.active ?? []),
    };
    const tool = createSpawnSubagentTool({
      config: createConfig(overrides?.config),
      runWorker,
      spawnState,
      getSession: overrides?.getSession,
    });

    return { tool, runWorker, spawnState };
  };

  /**
   * The options the runner was called with on its first (or only) invocation.
   * @param runWorker - The mocked runner
   * @returns That call's options
   */
  const firstCall = (runWorker: Mock<RunWorker>): RunWorkerOptions =>
    runWorker.mock.calls[0]?.[0] as RunWorkerOptions;

  it("runs a worker and returns its labeled final message", async () => {
    const { tool, runWorker } = setup();

    const result = await tool.execute!({ task: "write a bassline" }, options());

    // The label is how the model learns which worker to resume later.
    expect(result).toBe(
      labelWorkerResult(1, "Added a bassline in the Bass track."),
    );
    // The worker config passed to runWorker has spawn disabled.
    const call = firstCall(runWorker);

    expect(call.workerConfig.enabledTools?.[SPAWN_SUBAGENT_TOOL_NAME]).toBe(
      false,
    );
    expect(call.task).toBe("write a bassline");
    expect(call.workerConfig.chatHistory).toStrictEqual([]);
  });

  it("forwards the tool-call id and abort signal to the worker", async () => {
    const { tool, runWorker } = setup();
    const controller = new AbortController();

    await tool.execute!({ task: "x" }, options(controller.signal));

    // The id keys the card's live status, so it must reach the runner.
    expect(firstCall(runWorker).toolCallId).toBe("tc1");
    expect(firstCall(runWorker).abortSignal).toBe(controller.signal);
  });

  it("increments the shared spawn counter", async () => {
    const { tool, spawnState } = setup();

    await tool.execute!({ task: "x" }, options());

    expect(spawnState.count).toBe(1);
  });

  it("numbers each fresh worker from the allocator, never reusing one", async () => {
    // nextIndex is seeded from history on a restored conversation, so numbering
    // continues past workers already persisted there.
    const { tool, runWorker } = setup({ nextIndex: 2 });

    await tool.execute!({ task: "one" }, options());
    await tool.execute!({ task: "two" }, options());

    expect(runWorker.mock.calls.map((c) => c[0].subagentIndex)).toStrictEqual([
      3, 4,
    ]);
  });

  it("clears the in-flight marker so the same worker can be resumed again", async () => {
    const { tool, spawnState } = setup();

    await tool.execute!({ task: "x" }, options());

    expect(spawnState.active.size).toBe(0);
  });

  it("clears the in-flight marker when the worker fails", async () => {
    // Without the finally, a worker that threw (a Stop, say) would be locked out
    // of ever being resumed — exactly the case resuming exists to serve.
    const { tool, spawnState } = setup({
      runWorker: vi.fn<RunWorker>().mockRejectedValue(new Error("stopped")),
    });

    await expect(tool.execute!({ task: "x" }, options())).rejects.toThrow(
      "stopped",
    );
    expect(spawnState.active.size).toBe(0);
  });

  it("throws for a missing or empty task", async () => {
    const { tool, runWorker } = setup();

    await expect(tool.execute!({}, options())).rejects.toThrow("non-empty");
    await expect(tool.execute!({ task: "   " }, options())).rejects.toThrow(
      "non-empty",
    );
    expect(runWorker).not.toHaveBeenCalled();
  });

  it("runs concurrent spawns without corrupting the counter", async () => {
    // The AI SDK invokes N execute() closures concurrently for parallel tool
    // calls; each must reach the runner with its own tool-call id (the key its
    // transcript is stashed under) and advance the shared counter once.
    const { tool, runWorker, spawnState } = setup();

    await Promise.all([
      tool.execute!({ task: "one" }, options()),
      tool.execute!(
        { task: "two" },
        {
          toolCallId: "tc2",
          messages: [],
          abortSignal: undefined,
          context: undefined,
        },
      ),
    ]);

    expect(spawnState.count).toBe(2);
    expect(
      runWorker.mock.calls.map((c) => c[0].toolCallId).sort(),
    ).toStrictEqual(["tc1", "tc2"]);
    // Two workers, two distinct identities.
    expect(
      new Set(runWorker.mock.calls.map((c) => c[0].subagentIndex)).size,
    ).toBe(2);
  });

  it("throws once the per-conversation spawn cap is reached", async () => {
    const { tool, runWorker } = setup({ count: MAX_SPAWNS });

    await expect(
      tool.execute!({ task: "one more" }, options()),
    ).rejects.toThrow(`${MAX_SPAWNS}`);
    expect(runWorker).not.toHaveBeenCalled();
  });

  describe("resuming a worker", () => {
    const session: ChatMessage[] = [
      { role: "user", content: "write a bassline" },
      { role: "assistant", content: "Added a bassline." },
    ];

    it("seeds the worker with the named session and keeps its index", async () => {
      const getSession = vi.fn(() => session);
      const { tool, runWorker, spawnState } = setup({
        nextIndex: 3,
        getSession,
      });

      const result = await tool.execute!(
        { task: "make it swing", resumeFrom: 2 },
        options(),
      );

      expect(getSession).toHaveBeenCalledWith(2);

      const call = firstCall(runWorker);

      expect(call.workerConfig.chatHistory).toBe(session);
      expect(call.task).toBe("make it swing");
      // The worker keeps its identity, and the fresh-spawn allocator is
      // untouched so the next new worker still gets 4.
      expect(call.subagentIndex).toBe(2);
      expect(spawnState.nextIndex).toBe(3);
      expect(result).toBe(
        labelWorkerResult(2, workerHistory[1]?.content ?? ""),
      );
    });

    it("counts a resume against the spawn cap", async () => {
      // A resumed run costs a full worker session, so it can't be a free way
      // around the cap.
      const { tool, spawnState } = setup({ getSession: () => session });

      await tool.execute!({ task: "more", resumeFrom: 1 }, options());

      expect(spawnState.count).toBe(1);
    });

    it("accepts the numeric string an LLM may send", async () => {
      const { tool, runWorker } = setup({ getSession: () => session });

      await tool.execute!({ task: "more", resumeFrom: "2" }, options());

      expect(firstCall(runWorker).subagentIndex).toBe(2);
    });

    it("refuses a worker this conversation never had", async () => {
      const { tool, runWorker } = setup({ getSession: () => {} });

      await expect(
        tool.execute!({ task: "more", resumeFrom: 9 }, options()),
      ).rejects.toThrow("no subagent 9");
      expect(runWorker).not.toHaveBeenCalled();
    });

    it("refuses a resumeFrom that isn't a worker number", async () => {
      // Silently starting a fresh worker instead would redo the work and lose
      // the context the caller was reusing.
      const { tool, runWorker } = setup({ getSession: () => session });

      for (const bad of [0, -1, 1.5, "first"]) {
        await expect(
          tool.execute!({ task: "more", resumeFrom: bad }, options()),
        ).rejects.toThrow("resumeFrom must be");
      }

      expect(runWorker).not.toHaveBeenCalled();
    });

    it("treats null and empty resumeFrom as a fresh spawn", async () => {
      const { tool, runWorker } = setup({ getSession: () => session });

      await tool.execute!({ task: "fresh", resumeFrom: null }, options());
      await tool.execute!({ task: "fresh", resumeFrom: "" }, options());

      for (const call of runWorker.mock.calls) {
        expect(call[0].workerConfig.chatHistory).toStrictEqual([]);
      }
    });

    it("refuses a second concurrent resume of the same worker", async () => {
      // Both would seed from the same session and record divergent
      // continuations under one index, leaving a session that never happened.
      const { tool } = setup({
        active: [2],
        getSession: () => session,
      });

      await expect(
        tool.execute!({ task: "more", resumeFrom: 2 }, options()),
      ).rejects.toThrow("still running");
    });
  });
});

describe("labelWorkerResult", () => {
  it("prefixes the worker's number on its own line", () => {
    expect(labelWorkerResult(3, "Done.")).toBe("[subagent 3]\nDone.");
  });
});
