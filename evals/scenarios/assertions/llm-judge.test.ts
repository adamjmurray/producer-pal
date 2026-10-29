// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { beforeEach, describe, expect, it, vi } from "vitest";
import { callJudge } from "../helpers/judge/judge.ts";
import {
  type EvalProvider,
  type EvalTurnResult,
  type LlmJudgeAssertion,
} from "../types.ts";
import { assertWithLlmJudge, type LlmJudgeDetails } from "./llm-judge.ts";

vi.mock(import("../helpers/judge/judge.ts"), async (importOriginal) => ({
  ...(await importOriginal()),
  callJudge: vi.fn(),
}));

const turns = [
  { userMessage: "hi", assistantResponse: "hello", toolCalls: [] },
] as unknown as EvalTurnResult[];
const assertion: LlmJudgeAssertion = { type: "llm_judge", prompt: "Be nice" };

/**
 * Run the assertion and return its details.
 *
 * @param turnList - Conversation turns
 * @param provider - Scenario default provider
 * @param override - Optional CLI override
 * @returns The recorded judge details
 */
async function run(
  turnList: EvalTurnResult[],
  provider: EvalProvider,
  override?: { provider: EvalProvider; model?: string },
): Promise<LlmJudgeDetails> {
  const result = await assertWithLlmJudge(
    assertion,
    turnList,
    provider,
    override,
  );

  return result.details as LlmJudgeDetails;
}

describe("assertWithLlmJudge", () => {
  beforeEach(() => {
    vi.mocked(callJudge).mockReset();
    vi.mocked(callJudge).mockResolvedValue('{"pass": true, "issues": []}');
  });

  it("records the scenario default provider and its default model", async () => {
    const details = await run(turns, "google");

    expect(details).toStrictEqual({
      pass: true,
      issues: [],
      provider: "google",
      model: expect.any(String),
    });
    expect(vi.mocked(callJudge).mock.calls[0]?.[3]).toBe(details.model);
  });

  it("records an agent CLI's isolated judge model, not the session default", async () => {
    const details = await run(turns, "google", { provider: "codex-code" });

    expect(details.provider).toBe("codex-code");
    expect(details.model).toBeTruthy();
    expect(vi.mocked(callJudge).mock.calls[0]?.[3]).toBe(details.model);
  });

  it("prefers the CLI override over the assertion and scenario", async () => {
    const result = await assertWithLlmJudge(
      { ...assertion, judgeProvider: "openai", judgeModel: "a" },
      turns,
      "google",
      { provider: "codex-code", model: "luna" },
    );

    expect(result.details).toStrictEqual({
      pass: true,
      issues: [],
      provider: "codex-code",
      model: "luna",
    });
  });

  it("uses the assertion's judge when there is no CLI override", async () => {
    const result = await assertWithLlmJudge(
      { ...assertion, judgeProvider: "openai", judgeModel: "gpt-x" },
      turns,
      "google",
    );

    expect(result.details).toStrictEqual({
      pass: true,
      issues: [],
      provider: "openai",
      model: "gpt-x",
    });
  });

  it("still records provider and model when the judge call fails", async () => {
    vi.mocked(callJudge).mockRejectedValue(new Error("boom"));

    const details = await run(turns, "google", {
      provider: "openai",
      model: "gpt-x",
    });

    expect(details).toStrictEqual({
      pass: false,
      issues: ["boom"],
      provider: "openai",
      model: "gpt-x",
    });
  });

  it("refuses the local provider but keeps the provider", async () => {
    const details = await run(turns, "local");

    expect(details.pass).toBe(false);
    expect(details.issues[0]).toContain("Local provider");
    expect(details.provider).toBe("local");
    expect(callJudge).not.toHaveBeenCalled();
  });

  it("records no judge when there are no turns", async () => {
    const details = await run([], "google");

    expect(details).toStrictEqual({ pass: false, issues: ["No turns found"] });
    expect(callJudge).not.toHaveBeenCalled();
  });
});
