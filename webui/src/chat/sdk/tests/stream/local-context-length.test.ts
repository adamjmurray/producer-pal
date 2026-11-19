// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as F from "./chat-completions-fixtures";
import {
  assistantTurns,
  collectSdkWarnings,
  restoreSdkWarnings,
  say,
  startChat,
  stubProviderFetch,
} from "./raw-stream-harness";

vi.mock(import("#webui/chat/sdk/mcp-tools"), async () => {
  const { fakeMcpTools } = await import("./fake-mcp-tools");

  return { createMcpTools: vi.fn(() => Promise.resolve(fakeMcpTools())) };
});

const chat = (
  lookupContextLength?: () => Promise<number | undefined>,
): ReturnType<typeof startChat> =>
  startChat({
    provider: "lmstudio",
    model: F.LOCAL_MODEL,
    lookupContextLength,
  });

beforeEach(() => {
  collectSdkWarnings();
});

afterEach(() => {
  vi.unstubAllGlobals();
  restoreSdkWarnings();
});

describe("local model context length on step usage", () => {
  it("stores it on each step, read again after every step", async () => {
    const lookup = vi
      .fn<() => Promise<number | undefined>>()
      .mockResolvedValueOnce(8192)
      .mockResolvedValue(16384);

    stubProviderFetch([F.CALL, F.ANSWER_AFTER_TOOL]);

    const turns = assistantTurns(await say(await chat(lookup), "Tracks?"));

    expect(turns.map((t) => t.usage?.contextLength)).toStrictEqual([
      8192, 16384,
    ]);
    expect(lookup).toHaveBeenCalledTimes(3);
  });

  it("leaves it out when the lookup can't read one", async () => {
    stubProviderFetch([F.ANSWER_AFTER_TOOL]);

    const [turn] = assistantTurns(
      await say(await chat(() => Promise.resolve(undefined)), "Hi"),
    );

    expect(turn?.usage).not.toHaveProperty("contextLength");
  });

  it("doesn't hold up the reply while the lookup hangs", async () => {
    stubProviderFetch([F.ANSWER_AFTER_TOOL]);

    const [turn] = assistantTurns(
      await say(await chat(() => new Promise(() => {})), "Hi"),
    );

    expect(turn?.usage).toBeDefined();
    expect(turn?.usage).not.toHaveProperty("contextLength");
  }, 1000);

  it("ignores a lookup that answers after a newer one", async () => {
    let answerFirst = (_length: number): void => {};
    const lookup = vi
      .fn<() => Promise<number | undefined>>()
      .mockReturnValueOnce(
        new Promise((resolve) => {
          answerFirst = resolve;
        }),
      )
      .mockImplementationOnce(() => {
        const second = Promise.resolve(16384);

        // Queued ahead of the client's own handler, so the first lands later.
        void second.then(() => answerFirst(8192));

        return second;
      })
      .mockResolvedValue(32768);

    stubProviderFetch([F.CALL, F.ANSWER_AFTER_TOOL]);

    const turns = assistantTurns(await say(await chat(lookup), "Tracks?"));

    expect(turns.map((t) => t.usage?.contextLength)).toStrictEqual([
      undefined,
      16384,
    ]);
  });

  it("leaves it out with no lookup (a cloud provider)", async () => {
    stubProviderFetch([F.ANSWER_AFTER_TOOL]);

    const [turn] = assistantTurns(await say(await chat(), "Hi"));

    expect(turn?.usage).not.toHaveProperty("contextLength");
  });
});
