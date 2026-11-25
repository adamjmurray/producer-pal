// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { afterEach, describe, expect, it, vi } from "vitest";
import { askDecider } from "../decider-client.ts";
import {
  fromOpenaiDecisionsResponse,
  toOpenaiDecisionsRequest,
} from "../providers/openai-decisions.ts";
import { stubKeys } from "./decider-test-helpers.ts";

const usage = { input_tokens: 285, output_tokens: 0, total_tokens: 285 };

const scoreAnswer = {
  type: "score" as const,
  name: "outcome",
  score: 1.9,
  confidence: 0.9,
  probabilities: [
    { value: 0, label: "0", probability: 0.1 },
    { value: 1, label: "1", probability: 0.9 },
  ],
};

describe("toOpenaiDecisionsRequest", () => {
  it("turns yes/no and score questions into predicates and levels", () => {
    const body = toOpenaiDecisionsRequest("gpt-6-luna", "state", {
      req1: { type: "noul", instructions: "Ok?" },
      sure: {
        type: "noul",
        instructions: "Sure?",
        criteria: { true: "it is", false: "it is not" },
      },
      outcome: { type: "score", instructions: "How?", criteria: ["bad", "ok"] },
    });

    expect(body).toStrictEqual({
      model: "gpt-6-luna",
      input: "state",
      questions: [
        { type: "predicate", name: "req1", instructions: "Ok?" },
        {
          type: "predicate",
          name: "sure",
          instructions: "Sure?\n\nYes means: it is\nNo means: it is not",
        },
        {
          type: "score",
          name: "outcome",
          instructions: "How?",
          levels: [
            { label: "0", description: "bad" },
            { label: "1", description: "ok" },
          ],
        },
      ],
    });
  });

  it("writes an object of strings as titled sections", () => {
    const state = { transcript: "a\nb", deterministicChecks: "none" };

    expect(toOpenaiDecisionsRequest("m", state, {}).input).toBe(
      "## transcript\n\na\nb\n\n## deterministicChecks\n\nnone",
    );
  });

  it.each([[{ n: 1 }], [["a"]], [null]])("writes %j as JSON", (state) => {
    expect(toOpenaiDecisionsRequest("m", state, {}).input).toBe(
      JSON.stringify(state),
    );
  });
});

describe("fromOpenaiDecisionsResponse", () => {
  it("maps answers by name and keeps the token usage", () => {
    const response = {
      model: "gpt-6-luna-2026",
      answers: [
        { type: "predicate" as const, name: "req1", probability: 0.92 },
        scoreAnswer,
        { type: "choice" as const, name: "unused" },
      ],
      usage,
    };

    expect(fromOpenaiDecisionsResponse(response, "asked")).toStrictEqual({
      model: "gpt-6-luna-2026",
      answers: {
        req1: { type: "noul", noul: 0.92 },
        outcome: {
          type: "score",
          score: 1.9,
          confidence: 0.9,
          legend: { "0": "0", "1": "1" },
          probabilities: { "0": 0.1, "1": 0.9 },
        },
      },
      usage: { input_tokens: 285, output_tokens: 0 },
    });
  });

  it("falls back to the model asked when the response names none", () => {
    expect(
      fromOpenaiDecisionsResponse({ answers: [], usage }, "asked").model,
    ).toBe("asked");
  });

  it("throws on a refusal, naming the question", () => {
    const answers = [{ type: "refusal" as const, name: "req2" }];

    expect(() => fromOpenaiDecisionsResponse({ answers, usage }, "m")).toThrow(
      'Decider refused question "req2"',
    );
  });
});

describe("askDecider on openai", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  const respond = (body: unknown, status = 200): ReturnType<typeof vi.fn> => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(body), { status }));

    vi.stubGlobal("fetch", fetchMock);

    return fetchMock;
  };

  it("posts a Decisions request and returns decider answers", async () => {
    stubKeys({ TYPESAFE_KEY: "t", OPENAI_KEY: "mine" });

    const fetchMock = respond({
      model: "gpt-6-luna",
      answers: [{ type: "predicate", name: "met", probability: 0.4 }],
      usage,
    });

    const res = await askDecider(
      "state",
      { met: { type: "noul", instructions: "Ok?" } },
      { provider: "openai" },
    );

    expect(res.answers).toStrictEqual({ met: { type: "noul", noul: 0.4 } });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];

    expect(url).toBe("https://api.openai.com/v1/decisions");
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer mine",
    );
    expect(JSON.parse(init.body as string)).toStrictEqual({
      model: "gpt-6-luna",
      input: "state",
      questions: [{ type: "predicate", name: "met", instructions: "Ok?" }],
    });
  });

  it("reports the message of an OpenAI error", async () => {
    stubKeys({ OPENAI_KEY: "k" });
    respond({ error: { message: "Invalid 'questions'" } }, 400);

    await expect(askDecider("s", {}, { provider: "openai" })).rejects.toThrow(
      "Decider API error 400: Invalid 'questions'",
    );
  });
});
