// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { afterEach, describe, expect, it, vi } from "vitest";
import { askDecider, DeciderError } from "../decider-client.ts";
import { stubKeys } from "./decider-test-helpers.ts";

const okBody = {
  model: "decider-1.14.0",
  answers: { met: { type: "noul", noul: 0.07 } },
  usage: { input_tokens: 330, output_tokens: 33 },
};

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status });

describe("askDecider", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("posts state and questions with the bearer key", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(okBody));

    vi.stubGlobal("fetch", fetchMock);

    const questions = { met: { type: "noul" as const, instructions: "Ok?" } };
    const res = await askDecider("state", questions, { apiKey: "k" });

    expect(res.answers.met).toStrictEqual({ type: "noul", noul: 0.07 });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];

    expect(url).toBe("https://api.typesafe.ai/v1/systemone");
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer k",
    );
    expect(JSON.parse(init.body as string)).toStrictEqual({
      model: "jev-latest",
      state: "state",
      questions,
    });
  });

  it("reads the key from TYPESAFE_KEY", async () => {
    vi.stubEnv("TYPESAFE_KEY", "from-env");

    const fetchMock = vi.fn().mockResolvedValue(json(okBody));

    vi.stubGlobal("fetch", fetchMock);
    await askDecider("s", {});

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;

    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer from-env",
    );
  });

  it("throws naming every key variable when none is set", async () => {
    stubKeys();

    await expect(askDecider("s", {})).rejects.toThrow(
      /TYPESAFE_KEY, OPENROUTER_KEY, VERCEL_AI_GATEWAY_KEY/,
    );
  });

  it.each([
    ["typesafe", "TYPESAFE_KEY", "https://api.typesafe.ai/v1/systemone"],
    ["openrouter", "OPENROUTER_KEY", "https://openrouter.ai/api/v1/systemone"],
    [
      "vercel",
      "VERCEL_AI_GATEWAY_KEY",
      "https://ai-gateway.vercel.sh/typesafe/v1/systemone",
    ],
  ] as const)(
    "calls %s with its URL and key",
    async (provider, envVar, url) => {
      stubKeys({ TYPESAFE_KEY: "t", OPENROUTER_KEY: "o", [envVar]: "mine" });

      const fetchMock = vi.fn().mockResolvedValue(json(okBody));

      vi.stubGlobal("fetch", fetchMock);
      await askDecider("s", {}, { provider });

      const [calledUrl, init] = fetchMock.mock.calls[0] as [
        string,
        RequestInit,
      ];

      expect(calledUrl).toBe(url);
      expect((init.headers as Record<string, string>).Authorization).toBe(
        "Bearer mine",
      );
      expect(JSON.parse(init.body as string)).toStrictEqual({
        model: "jev-latest",
        state: "s",
        questions: {},
      });
    },
  );

  it("throws the 400 detail", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(json({ detail: "state too long" }, 400)),
    );

    await expect(askDecider("s", {}, { apiKey: "k" })).rejects.toThrow(
      "Decider API error 400: state too long",
    );
  });

  it("joins 422 problems", async () => {
    const detail = [{ loc: ["body", "questions"], msg: "field required" }];

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ detail }, 422)));

    const error = await askDecider("s", {}, { apiKey: "k" }).catch(
      (e: unknown) => e,
    );

    expect(error).toBeInstanceOf(DeciderError);
    expect((error as DeciderError).message).toContain(
      "body.questions field required",
    );
  });

  it("retries a 429 and then succeeds", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ detail: "slow down" }, 429))
      .mockResolvedValueOnce(json(okBody));

    vi.stubGlobal("fetch", fetchMock);

    await askDecider("s", {}, { apiKey: "k", retryDelayMs: 0 });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("gives up after repeated 5xx", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(new Response("boom", { status: 503 })),
      );

    vi.stubGlobal("fetch", fetchMock);

    await expect(
      askDecider("s", {}, { apiKey: "k", retryDelayMs: 0 }),
    ).rejects.toThrow("Decider API error 503: boom");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("does not retry a 400", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ detail: "bad" }, 400));

    vi.stubGlobal("fetch", fetchMock);

    await expect(askDecider("s", {}, { apiKey: "k" })).rejects.toThrow(
      DeciderError,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("joins a hosted 400 detail and an Ollama error alike", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(json({ error: "model 'x' not found" }, 404)),
    );

    await expect(
      askDecider("s", {}, { provider: "ollama", model: "x" }),
    ).rejects.toThrow("Decider API error 404: model 'x' not found");
  });

  it("falls back to the raw text for an error body it can't read", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(json({ error: { code: 1 } }, 400)),
    );

    await expect(askDecider("s", {}, { apiKey: "k" })).rejects.toThrow(
      'Decider API error 400: {"error":{"code":1}}',
    );
  });

  describe("with Ollama", () => {
    it("posts to the Ollama host with the model and no Authorization header", async () => {
      vi.stubEnv("OLLAMA_HOST", "box:9999");

      const fetchMock = vi.fn().mockResolvedValue(json(okBody));

      vi.stubGlobal("fetch", fetchMock);
      await askDecider("s", {}, { provider: "ollama", model: "autotrust-jev" });

      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];

      expect(url).toBe("http://box:9999/v1/systemone");
      expect(init.headers).toStrictEqual({
        "Content-Type": "application/json",
      });
      expect(JSON.parse(init.body as string)).toStrictEqual({
        model: "autotrust-jev",
        state: "s",
        questions: {},
      });
    });

    it("needs a model", async () => {
      await expect(askDecider("s", {}, { provider: "ollama" })).rejects.toThrow(
        "ollama needs a model",
      );
    });
  });
});
