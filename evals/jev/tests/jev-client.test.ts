// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { afterEach, describe, expect, it, vi } from "vitest";
import { askJev, JevError } from "../jev-client.ts";

const okBody = {
  model: "jev-1.14.0",
  answers: { met: { type: "noul", noul: 0.07 } },
  usage: { input_tokens: 330, output_tokens: 33 },
};

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status });

describe("askJev", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("posts state and questions with the bearer key", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(okBody));

    vi.stubGlobal("fetch", fetchMock);

    const questions = { met: { type: "noul" as const, instructions: "Ok?" } };
    const res = await askJev("state", questions, { apiKey: "k" });

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
    await askJev("s", {});

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;

    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer from-env",
    );
  });

  it("throws without a key", async () => {
    vi.stubEnv("TYPESAFE_KEY", "");

    await expect(askJev("s", {})).rejects.toThrow(/TYPESAFE_KEY/);
  });

  it("throws the 400 detail", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(json({ detail: "state too long" }, 400)),
    );

    await expect(askJev("s", {}, { apiKey: "k" })).rejects.toThrow(
      "Jev API error 400: state too long",
    );
  });

  it("joins 422 problems", async () => {
    const detail = [{ loc: ["body", "questions"], msg: "field required" }];

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ detail }, 422)));

    const error = await askJev("s", {}, { apiKey: "k" }).catch(
      (e: unknown) => e,
    );

    expect(error).toBeInstanceOf(JevError);
    expect((error as JevError).message).toContain(
      "body.questions field required",
    );
  });

  it("retries a 429 and then succeeds", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ detail: "slow down" }, 429))
      .mockResolvedValueOnce(json(okBody));

    vi.stubGlobal("fetch", fetchMock);

    await askJev("s", {}, { apiKey: "k", retryDelayMs: 0 });

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
      askJev("s", {}, { apiKey: "k", retryDelayMs: 0 }),
    ).rejects.toThrow("Jev API error 503: boom");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("does not retry a 400", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ detail: "bad" }, 400));

    vi.stubGlobal("fetch", fetchMock);

    await expect(askJev("s", {}, { apiKey: "k" })).rejects.toThrow(JevError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
