// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { type LanguageModel, type ModelMessage, streamText } from "ai";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { processCliStream } from "../stream.ts";
import { DEFAULT_MAX_TOKENS, runModelTurn } from "./model-turn.ts";

vi.mock(import("ai"), async (importOriginal) => ({
  ...(await importOriginal()),
  streamText: vi.fn(),
}));
vi.mock(import("../stream.ts"), () => ({ processCliStream: vi.fn() }));

const model = {} as LanguageModel;
const usage = {
  inputTokens: 5,
  outputTokens: 2,
  totalTokens: 7,
  inputTokenDetails: {},
  outputTokenDetails: {},
};
const reply: ModelMessage[] = [{ role: "assistant", content: "hi" }];

/** Make streamText report one step through the `onStepEnd` the turn passed. */
function stubStream(): void {
  vi.mocked(streamText).mockImplementation(((options: {
    onStepEnd?: (event: unknown) => void;
  }) => {
    options.onStepEnd?.({ usage, performance: undefined });

    return { responseMessages: Promise.resolve(reply) };
  }) as unknown as typeof streamText);
}

describe("runModelTurn", () => {
  beforeEach(() => {
    vi.mocked(streamText).mockReset();
    vi.mocked(processCliStream).mockReset();
    stubStream();
  });

  it("streams with the session's settings and returns the new messages", async () => {
    vi.mocked(processCliStream).mockResolvedValue({ text: "hi" } as never);

    const tools = { t: {} } as never;
    const turn = await runModelTurn({
      model,
      messages: [{ role: "user", content: "yo" }],
      tools,
      erroredToolCallIds: new Set(),
      instructions: "be brief",
    });

    expect(vi.mocked(streamText).mock.calls[0]?.[0]).toStrictEqual(
      expect.objectContaining({
        tools,
        instructions: "be brief",
        maxOutputTokens: DEFAULT_MAX_TOKENS,
      }),
    );
    expect(turn.responseMessages).toStrictEqual(reply);
    expect(turn.stepUsages).toHaveLength(1);
    expect(turn.stepTimings).toStrictEqual([{}]);
    expect(turn.lastUsage).toStrictEqual(turn.stepUsages[0]);
  });

  it("sends no tools when there are none, and keeps the previous usage", async () => {
    vi.mocked(streamText).mockReturnValue({
      responseMessages: Promise.resolve([]),
    } as never);
    vi.mocked(processCliStream).mockResolvedValue({ text: "" } as never);

    const prevUsage = { inputTokens: 1, outputTokens: 1, totalTokens: 2 };
    const turn = await runModelTurn({
      model,
      messages: [],
      tools: {},
      erroredToolCallIds: new Set(),
      prevUsage,
      maxOutputTokens: 100,
    });

    expect(vi.mocked(streamText).mock.calls[0]?.[0]).toStrictEqual(
      expect.objectContaining({ tools: undefined, maxOutputTokens: 100 }),
    );
    expect(turn.lastUsage).toBe(prevUsage);
  });

  it("returns no messages after a stream error", async () => {
    vi.mocked(processCliStream).mockResolvedValue({
      text: "",
      error: "boom",
    } as never);

    const turn = await runModelTurn({
      model,
      messages: [],
      tools: {},
      erroredToolCallIds: new Set(),
    });

    expect(turn.responseMessages).toStrictEqual([]);
    expect(turn.turnResult.error).toBe("boom");
  });
});
