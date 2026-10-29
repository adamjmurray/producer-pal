// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { afterEach, describe, expect, it, vi } from "vitest";
import { askJev, JevError, resolveJevRoute } from "../jev-client.ts";

const okBody = {
  model: "jev-1.14.0",
  answers: { met: { type: "noul", noul: 0.07 } },
  usage: { input_tokens: 330, output_tokens: 33 },
};

const KEY_VARS = ["TYPESAFE_KEY", "OPENROUTER_KEY", "VERCEL_AI_GATEWAY_KEY"];

/**
 * Set the three route keys; unlisted ones are blanked.
 *
 * @param keys - Values by env var name
 */
function stubKeys(keys: Record<string, string> = {}): void {
  for (const name of KEY_VARS) {
    vi.stubEnv(name, keys[name] ?? "");
  }
}

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

  it("throws naming every key variable when none is set", async () => {
    stubKeys();

    await expect(askJev("s", {})).rejects.toThrow(
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
  ] as const)("calls %s with its URL and key", async (route, envVar, url) => {
    stubKeys({ TYPESAFE_KEY: "t", OPENROUTER_KEY: "o", [envVar]: "mine" });

    const fetchMock = vi.fn().mockResolvedValue(json(okBody));

    vi.stubGlobal("fetch", fetchMock);
    await askJev("s", {}, { route });

    const [calledUrl, init] = fetchMock.mock.calls[0] as [string, RequestInit];

    expect(calledUrl).toBe(url);
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer mine",
    );
    expect(JSON.parse(init.body as string)).toStrictEqual({
      model: "jev-latest",
      state: "s",
      questions: {},
    });
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

describe("resolveJevRoute", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("defaults to the first route with a key: typesafe, openrouter, vercel", () => {
    stubKeys({ OPENROUTER_KEY: "o", VERCEL_AI_GATEWAY_KEY: "v" });
    expect(resolveJevRoute().route).toBe("openrouter");

    stubKeys({ VERCEL_AI_GATEWAY_KEY: "v" });
    expect(resolveJevRoute().route).toBe("vercel");

    stubKeys({ TYPESAFE_KEY: "t", OPENROUTER_KEY: "o" });
    expect(resolveJevRoute().route).toBe("typesafe");
  });

  it("uses the requested route even when an earlier one has a key", () => {
    stubKeys({ TYPESAFE_KEY: "t", VERCEL_AI_GATEWAY_KEY: "v" });

    expect(resolveJevRoute("vercel")).toStrictEqual({
      route: "vercel",
      url: "https://ai-gateway.vercel.sh/typesafe/v1/systemone",
      apiKey: "v",
    });
  });

  it("names the missing variable for a requested route", () => {
    stubKeys({ TYPESAFE_KEY: "t" });

    expect(() => resolveJevRoute("openrouter")).toThrow(
      /OPENROUTER_KEY is not set.*--via=openrouter/,
    );
  });

  it("sends an explicit key to TypeSafe unless a route is given", () => {
    stubKeys();

    expect(resolveJevRoute(undefined, "k")).toStrictEqual({
      route: "typesafe",
      url: "https://api.typesafe.ai/v1/systemone",
      apiKey: "k",
    });
    expect(resolveJevRoute("vercel", "k").apiKey).toBe("k");
  });
});
