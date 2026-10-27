// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { type Client } from "@modelcontextprotocol/sdk/client/index.js";
import { describe, expect, it, vi } from "vitest";
import { type TurnResult } from "#evals/chat/shared/types.ts";
import { type EvalSession } from "../eval-session.ts";
import {
  type EvalAssertion,
  type EvalScenario,
  type EvalTurnResult,
} from "../types.ts";
import { runCorrectnessAssertion, runMessageTurns } from "./message-turns.ts";

describe("runCorrectnessAssertion", () => {
  it("scores an unknown assertion type as a failure, not a vacuous pass", async () => {
    const assertion = { type: "mystery" } as unknown as EvalAssertion;

    const result = await runCorrectnessAssertion(assertion, [], {} as Client);

    expect(result.maxScore).toBe(1);
    expect(result.earned).toBe(0);
    expect(result.earned === result.maxScore).toBe(false);
    expect(result.message).toContain("Unknown assertion type: mystery");
  });
});

describe("runMessageTurns", () => {
  function runWithReplies(...replies: TurnResult[]) {
    const sendMessage = vi.fn<EvalSession["sendMessage"]>();

    for (const reply of replies) {
      sendMessage.mockResolvedValueOnce(reply);
    }

    const session = { sendMessage } as unknown as EvalSession;
    const scenario = { messages: ["one", "two"] } as EvalScenario;
    const turns: EvalTurnResult[] = [];
    const run = runMessageTurns(scenario, session, turns, false);

    return { run, turns, sendMessage };
  }

  it("stops at a turn the provider refused, keeping the turn", async () => {
    const error = "Your credit balance is too low (HTTP 400)";
    const { run, turns, sendMessage } = runWithReplies({
      text: "",
      toolCalls: [],
      error,
    });

    await expect(run).rejects.toThrow(error);
    expect(turns).toHaveLength(1);
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });

  it("keeps going after a turn error that is not a refusal", async () => {
    const { run, turns } = runWithReplies(
      { text: "", toolCalls: [], error: "empty response" },
      { text: "done", toolCalls: [] },
    );

    await run;
    expect(turns.map((turn) => turn.assistantResponse)).toStrictEqual([
      "",
      "done",
    ]);
  });
});
