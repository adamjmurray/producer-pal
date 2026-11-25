// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { streamText } from "ai";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getAgentCliTransport } from "#evals/chat/agent-cli/agent-cli-registry.ts";
import { getDefaultModel } from "#evals/scenarios/eval-session.ts";
import { callAgentCliJudge } from "./agent-cli-judge.ts";
import { callJudge, resolveJudgeModel } from "./judge.ts";

vi.mock(import("ai"), async (importOriginal) => ({
  ...(await importOriginal()),
  streamText: vi.fn(),
}));
vi.mock(import("./agent-cli-judge.ts"), () => ({
  callAgentCliJudge: vi.fn(),
}));
vi.mock(import("#evals/chat/provider.ts"), () => ({
  createProviderModel: vi.fn(() => "model" as never),
}));
vi.mock(import("./judge-output.ts"), () => ({
  finishJudgeOutput: vi.fn(),
  printJudgeChunk: vi.fn(),
  printJudgeHeader: vi.fn(),
}));

describe("callJudge thinking", () => {
  beforeEach(() => {
    vi.mocked(callAgentCliJudge).mockReset();
    vi.mocked(callAgentCliJudge).mockResolvedValue("ok");
    vi.mocked(streamText).mockReset();
    vi.mocked(streamText).mockReturnValue({
      textStream: (async function* () {
        yield "ok";
      })(),
    } as never);
  });

  it("passes an agent CLI judge its own effort value", async () => {
    await callJudge("p", "s", "codex-code", "luna", "c", "ultra");

    expect(vi.mocked(callAgentCliJudge).mock.calls[0]?.[5]).toBe("max");
  });

  it("leaves an agent CLI judge on its default with no level", async () => {
    await callJudge("p", "s", "codex-code", "luna", "c");

    expect(vi.mocked(callAgentCliJudge).mock.calls[0]?.[5]).toBeUndefined();
  });

  it("sends an AI SDK judge provider options for the level", async () => {
    await callJudge("p", "s", "google", "gemini-3.8-flash", "c", "high");

    expect(
      vi.mocked(streamText).mock.calls[0]?.[0].providerOptions,
    ).toHaveProperty("google");
  });

  it("sends an AI SDK judge no provider options with no level", async () => {
    await callJudge("p", "s", "google", "gemini-3.8-flash", "c");

    expect(
      vi.mocked(streamText).mock.calls[0]?.[0].providerOptions,
    ).toBeUndefined();
  });
});

describe("resolveJudgeModel", () => {
  it("prefers the explicit model", () => {
    expect(resolveJudgeModel("google", "m")).toBe("m");
    expect(resolveJudgeModel("codex-code", "m")).toBe("m");
  });

  it("uses the provider default for AI SDK providers", () => {
    expect(resolveJudgeModel("google", undefined)).toBe(
      getDefaultModel("google"),
    );
  });

  it("uses the isolated judge model for agent CLIs", () => {
    expect(resolveJudgeModel("codex-code", undefined)).toBe(
      getAgentCliTransport("codex-code")?.judgeModel,
    );
  });
});
