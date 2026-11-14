// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { type Client } from "@modelcontextprotocol/sdk/client/index.js";
import { describe, expect, it, vi } from "vitest";
import { StoppedTurnError } from "#evals/chat/agent-cli/agent-cli-step-budget.ts";
import { type TurnResult } from "#evals/chat/shared/types.ts";
import { type EvalSession } from "../eval-session.ts";
import {
  type EvalAssertion,
  type EvalScenario,
  type EvalTurnResult,
} from "../types.ts";
import {
  runCorrectnessAssertion,
  runMessageTurns,
  TurnTransportError,
} from "./message-turns.ts";

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

  it("keeps the calls of a turn the step budget stopped, then stops", async () => {
    const sendMessage = vi
      .fn<EvalSession["sendMessage"]>()
      .mockRejectedValueOnce(
        new StoppedTurnError("hit the step budget", {
          text: "",
          toolCalls: [{ name: "ppal-read-song", args: {} }],
        }),
      );
    const session = { sendMessage } as unknown as EvalSession;
    const turns: EvalTurnResult[] = [];
    const scenario = { messages: ["one", "two"] } as EvalScenario;

    await expect(
      runMessageTurns(scenario, session, turns, false),
    ).rejects.toThrow("hit the step budget");
    expect(turns.map((turn) => turn.toolCalls)).toStrictEqual([
      [{ name: "ppal-read-song", args: {} }],
    ]);
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });

  it("saves no turn for any other thrown error", async () => {
    const sendMessage = vi
      .fn<EvalSession["sendMessage"]>()
      .mockRejectedValueOnce(new Error("spawn failed"));
    const session = { sendMessage } as unknown as EvalSession;
    const turns: EvalTurnResult[] = [];
    const scenario = { messages: ["one"] } as EvalScenario;

    await expect(
      runMessageTurns(scenario, session, turns, false),
    ).rejects.toThrow("spawn failed");
    expect(turns).toHaveLength(0);
  });

  it("keeps each turn's reasoning text and finish reason", async () => {
    const { run, turns } = runWithReplies(
      {
        text: "",
        toolCalls: [],
        reasoningText: "thinking it over",
        finishReason: "stop",
      },
      { text: "done", toolCalls: [] },
    );

    await run;
    expect(turns[0]?.reasoningText).toBe("thinking it over");
    expect(turns[0]?.finishReason).toBe("stop");
    expect(turns[1]).not.toHaveProperty("reasoningText");
    expect(turns[1]).not.toHaveProperty("finishReason");
  });

  it.each([
    ["a bad key", "Incorrect API key provided (HTTP 401)"],
    ["a rejected request", "Bad request (HTTP 400)"],
    ["an unknown model", "model not found (HTTP 404)"],
    ["a server failure", "Bad gateway (HTTP 502)"],
    ["a dropped connection", "Cannot connect to API: socket hang up"],
  ])(
    "stops at a turn that ended in %s, as an infra error",
    async (_label, error) => {
      const { run, turns, sendMessage } = runWithReplies({
        text: "",
        toolCalls: [],
        error,
      });

      await expect(run).rejects.toThrow(TurnTransportError);
      await expect(run).rejects.toThrow(error);
      expect(turns).toHaveLength(1);
      expect(sendMessage).toHaveBeenCalledTimes(1);
    },
  );

  it("throws a refusal as the same kind of error", async () => {
    const { run } = runWithReplies({
      text: "",
      toolCalls: [],
      error: "rate limit exceeded",
    });

    await expect(run).rejects.toThrow(TurnTransportError);
  });

  it("does not treat a step-budget stop as a transport error", async () => {
    const { run, turns } = runWithReplies(
      {
        text: "",
        toolCalls: [],
        error: "codex CLI hit the step budget of 2 steps and was stopped.",
      },
      { text: "done", toolCalls: [] },
    );

    await run;
    expect(turns).toHaveLength(2);
  });
});
