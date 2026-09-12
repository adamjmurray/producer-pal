// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { setupExpressAppServer } from "../../tests/express-app-test-helpers.ts";
import {
  type PostTokenOptions,
  postTokenRequest,
  registerSharedTokenAuthTests,
} from "./voice-token-test-helpers.ts";

const REAL_FETCH = globalThis.fetch;

afterAll(() => {
  globalThis.fetch = REAL_FETCH;
});

/**
 * Match the OpenAI API host by exact hostname rather than URL prefix so
 * `https://api.openai.com.evil.example/...` cannot impersonate it (CodeQL
 * flags `startsWith("https://api.openai.com")` as incomplete URL sanitization).
 *
 * @param url - URL string to check
 * @returns true when the URL parses and its hostname equals api.openai.com
 */
function isOpenAIUrl(url: string): boolean {
  try {
    return new URL(url).hostname === "api.openai.com";
  } catch {
    return false;
  }
}

/**
 * Intercept ONLY OpenAI upstream calls; let everything else (including the
 * test client's request to the local Express server) pass through to the
 * real fetch.
 *
 * @param responder - Function that returns the mocked OpenAI response
 * @returns Object with `calls` array captured for assertion
 */
function mockOpenAIFetch(
  responder: (init: RequestInit | undefined) => Promise<Response>,
): { calls: { url: string; init: RequestInit | undefined }[] } {
  const calls: { url: string; init: RequestInit | undefined }[] = [];

  globalThis.fetch = async (input, init) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : (input as Request).url;

    if (isOpenAIUrl(url)) {
      calls.push({ url, init });

      return await responder(init);
    }

    return await REAL_FETCH(input, init);
  };

  return { calls };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Issue a POST to the local /voice-token endpoint with OpenAI defaults so each
 * test only needs to specify the bits it cares about.
 *
 * @param baseUrl - Base URL of the test Express server
 * @param opts - Key/body/origin overrides
 * @returns The fetch Response
 */
async function postVoiceToken(
  baseUrl: string,
  opts: Pick<PostTokenOptions, "key" | "body" | "origin"> = {},
): Promise<Response> {
  return await postTokenRequest(baseUrl, {
    path: "/voice-token",
    keyHeader: "X-OpenAI-Key",
    defaultKey: "sk-test",
    ...opts,
  });
}

/**
 * Stub a 200 upstream, post a token request, and return the JSON body the route
 * forwarded to OpenAI.
 *
 * @param baseUrl - Base URL of the test Express server
 * @param opts - Key/body/origin overrides for the local request
 * @returns The parsed request body OpenAI received
 */
async function sentUpstreamBody(
  baseUrl: string,
  opts: Pick<PostTokenOptions, "key" | "body" | "origin"> = {},
): Promise<unknown> {
  const { calls } = mockOpenAIFetch(async () =>
    jsonResponse(200, { value: "ek_x", expires_at: 0 }),
  );

  await postVoiceToken(baseUrl, opts);

  return JSON.parse(calls[0]!.init!.body as string);
}

/**
 * Read the `error` field out of a route error response.
 *
 * @param res - The response to read
 * @returns The error message
 */
async function errorText(res: Response): Promise<string> {
  return ((await res.json()) as { error: string }).error;
}

describe("voice-token route", () => {
  const appState = setupExpressAppServer();

  beforeEach(() => {
    globalThis.fetch = REAL_FETCH;
  });

  registerSharedTokenAuthTests({
    post: (overrides) => postVoiceToken(appState.baseUrl, overrides),
    keyHeaderName: "X-OpenAI-Key",
  });

  it("forwards to OpenAI server-to-server and returns only ephemeral token", async () => {
    const { calls } = mockOpenAIFetch(async () =>
      jsonResponse(200, { value: "ek_test_123", expires_at: 1234567890 }),
    );

    const res = await postVoiceToken(appState.baseUrl, {
      key: "sk-secret-do-not-leak",
      body: { model: "gpt-realtime-2" },
    });

    expect(res.status).toBe(200);
    const json = (await res.json()) as Record<string, unknown>;

    expect(json).toStrictEqual({
      value: "ek_test_123",
      expires_at: 1234567890,
    });

    expect(calls).toHaveLength(1);
    const call = calls[0]!;

    expect(call.url).toContain("/v1/realtime/client_secrets");
    expect((call.init!.headers as Record<string, string>).Authorization).toBe(
      "Bearer sk-secret-do-not-leak",
    );

    const upstreamBody = JSON.parse(call.init?.body as string) as {
      session: { model: string; type: string };
    };

    expect(upstreamBody.session.model).toBe("gpt-realtime-2");
    expect(upstreamBody.session.type).toBe("realtime");

    // Response must not echo the long-lived API key anywhere.
    expect(JSON.stringify(json)).not.toContain("sk-secret-do-not-leak");
  });

  it("returns 502 when an upstream 200 response is missing the value field", async () => {
    mockOpenAIFetch(async () => jsonResponse(200, { expires_at: 123 }));

    const res = await postVoiceToken(appState.baseUrl);

    expect(res.status).toBe(502);
    expect(await errorText(res)).toContain("missing 'value'");
  });

  it("defaults to gpt-realtime-2.1 when no model is provided", async () => {
    expect(await sentUpstreamBody(appState.baseUrl)).toStrictEqual({
      session: { type: "realtime", model: "gpt-realtime-2.1" },
    });
  });

  it("falls back to default model when model field is non-string", async () => {
    const sent = await sentUpstreamBody(appState.baseUrl, {
      body: { model: 12345 },
    });

    expect(sent).toStrictEqual({
      session: { type: "realtime", model: "gpt-realtime-2.1" },
    });
  });

  it("forwards upstream non-2xx with status and detail JSON", async () => {
    mockOpenAIFetch(async () =>
      jsonResponse(401, { error: { message: "Invalid API key" } }),
    );

    const res = await postVoiceToken(appState.baseUrl, { key: "sk-bad" });

    expect(res.status).toBe(401);
    const json = (await res.json()) as { error: string; detail: unknown };

    expect(json.error).toContain("OpenAI");
    expect(json.detail).toStrictEqual({
      error: { message: "Invalid API key" },
    });
  });

  it("forwards upstream non-2xx with text body when JSON parse fails", async () => {
    mockOpenAIFetch(
      async () =>
        new Response("upstream is on fire", {
          status: 503,
          headers: { "Content-Type": "text/plain" },
        }),
    );

    const res = await postVoiceToken(appState.baseUrl);

    expect(res.status).toBe(503);
    const json = (await res.json()) as { detail: unknown };

    expect(json.detail).toBe("upstream is on fire");
  });

  it("returns 502 when upstream fetch itself rejects", async () => {
    mockOpenAIFetch(async () => {
      throw new Error("network down");
    });

    const res = await postVoiceToken(appState.baseUrl);

    expect(res.status).toBe(502);
    expect(await errorText(res)).toContain("network down");
  });

  it("returns 504 when the upstream fetch times out", async () => {
    mockOpenAIFetch(async () => {
      // AbortSignal.timeout rejects with a DOMException named "TimeoutError".
      const err = new Error("The operation timed out.");

      err.name = "TimeoutError";
      throw err;
    });

    const res = await postVoiceToken(appState.baseUrl);

    expect(res.status).toBe(504);
    expect(await errorText(res)).toMatch(/timed out/i);
  });

  it("returns 500 with null detail when upstream response body is unreadable", async () => {
    mockOpenAIFetch(async () => {
      return {
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        text: () => Promise.reject(new Error("text fail")),
      } as unknown as Response;
    });

    const res = await postVoiceToken(appState.baseUrl);

    expect(res.status).toBe(500);
    const json = (await res.json()) as { detail: unknown };

    expect(json.detail).toBeNull();
  });
});
