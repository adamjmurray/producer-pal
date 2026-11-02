// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { beforeEach, describe, expect, it, vi } from "vitest";
import { runModelTurn } from "#evals/chat/shared/model-turn.ts";
import { createEvalSession } from "../eval-session.ts";

vi.mock(import("#evals/chat/provider.ts"), () => ({
  createProviderModel: vi.fn(() => ({}) as never),
}));
vi.mock(import("#evals/chat/mcp.ts"), () => ({
  createMcpTools: vi.fn(async () => ({
    tools: {},
    mcpClient: { close: vi.fn() },
    erroredToolCallIds: new Set<string>(),
  })) as never,
  connectMcp: vi.fn(),
}));
vi.mock(import("#evals/chat/shared/model-turn.ts"), () => ({
  runModelTurn: vi.fn(async () => ({
    turnResult: { text: "", toolCalls: [] },
    stepUsages: [],
    stepTimings: [],
    lastUsage: undefined,
    responseMessages: [],
  })) as never,
}));
vi.mock(import("../helpers/turn-logging.ts"), () => ({
  logTurnStart: vi.fn(),
}));

/**
 * Run one turn and return the providerOptions the model call got.
 *
 * @param thinking - Thinking level for the session, if any
 * @returns The providerOptions passed to the model turn
 */
async function providerOptionsFor(
  thinking?: string,
): Promise<Record<string, unknown> | undefined> {
  const session = await createEvalSession({
    provider: "openai",
    model: "gpt-6.1-sol",
    ...(thinking != null ? { thinking } : {}),
  });

  await session.sendMessage("hi", 1);

  return vi.mocked(runModelTurn).mock.calls.at(-1)?.[0].providerOptions as
    | Record<string, unknown>
    | undefined;
}

describe("createEvalSession thinking", () => {
  beforeEach(() => {
    vi.mocked(runModelTurn).mockClear();
  });

  it("sends the provider's reasoning options for the level", async () => {
    expect(await providerOptionsFor("high")).toStrictEqual({
      openai: { reasoningEffort: "high" },
    });
  });

  it("sends no provider options when no level was set", async () => {
    expect(await providerOptionsFor()).toBeUndefined();
  });
});

describe("createEvalSession output cap", () => {
  beforeEach(() => {
    vi.mocked(runModelTurn).mockClear();
  });

  it("passes the cap and provider to the model turn", async () => {
    const session = await createEvalSession({
      provider: "local",
      model: "m",
      outputTokens: 4096,
    });

    await session.sendMessage("hi", 1);

    expect(vi.mocked(runModelTurn).mock.calls.at(-1)?.[0]).toStrictEqual(
      expect.objectContaining({ maxOutputTokens: 4096, provider: "local" }),
    );
  });

  it("leaves the cap unset so the provider default applies", async () => {
    const session = await createEvalSession({ provider: "local", model: "m" });

    await session.sendMessage("hi", 1);

    expect(
      vi.mocked(runModelTurn).mock.calls.at(-1)?.[0].maxOutputTokens,
    ).toBeUndefined();
  });
});
