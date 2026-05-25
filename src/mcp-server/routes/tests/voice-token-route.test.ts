// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  mockMax,
  setupExpressAppServer,
} from "../../tests/express-app-test-helpers.ts";

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
 * Issue a POST to the local /voice-token endpoint with sane defaults so each
 * test only needs to specify the bits it cares about.
 *
 * @param baseUrl - Base URL of the test Express server
 * @param opts - Optional overrides
 * @param opts.key - OpenAI API key header value; `null` to omit the header
 * @param opts.body - Request body (object stringified, string passed through)
 * @param opts.origin - Optional Origin header for cross-origin testing
 * @returns The fetch Response
 */
async function postVoiceToken(
  baseUrl: string,
  opts: { key?: string | null; body?: unknown; origin?: string } = {},
): Promise<Response> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (opts.key !== null) headers["X-OpenAI-Key"] = opts.key ?? "sk-test";
  if (opts.origin) headers.Origin = opts.origin;
  const body =
    typeof opts.body === "string" ? opts.body : JSON.stringify(opts.body ?? {});

  return await fetch(`${baseUrl}/voice-token`, {
    method: "POST",
    headers,
    body,
  });
}

describe("voice-token route", () => {
  const appState = setupExpressAppServer();

  beforeEach(() => {
    globalThis.fetch = REAL_FETCH;
  });

  it("returns 400 when X-OpenAI-Key header is missing", async () => {
    const res = await postVoiceToken(appState.baseUrl, { key: null });

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };

    expect(json.error.toLowerCase()).toContain("x-openai-key");
  });

  it("returns 403 when the chat UI is disabled", async () => {
    const setChatUIEnabled = mockMax.handlers.get("chatUIEnabled") as (
      input: unknown,
    ) => void;

    setChatUIEnabled(0);

    try {
      const res = await postVoiceToken(appState.baseUrl);

      expect(res.status).toBe(403);
      const json = (await res.json()) as { error: string };

      expect(json.error).toBe("Chat UI is disabled");
    } finally {
      setChatUIEnabled(1);
    }
  });

  it("blocks cross-origin requests with 403", async () => {
    const res = await postVoiceToken(appState.baseUrl, {
      origin: "https://evil.example.com",
    });

    expect(res.status).toBe(403);
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
    expect((call.init?.headers as Record<string, string>).Authorization).toBe(
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
    const json = (await res.json()) as { error: string };

    expect(json.error).toContain("missing 'value'");
  });

  it("defaults to gpt-realtime-2 when no model is provided", async () => {
    const { calls } = mockOpenAIFetch(async () =>
      jsonResponse(200, { value: "ek_x", expires_at: 0 }),
    );

    await postVoiceToken(appState.baseUrl);
    const sentBody = JSON.parse(calls[0]!.init!.body as string);

    expect(sentBody).toMatchObject({ session: { model: "gpt-realtime-2" } });
  });

  it("falls back to default model when model field is non-string", async () => {
    const { calls } = mockOpenAIFetch(async () =>
      jsonResponse(200, { value: "ek_x", expires_at: 0 }),
    );

    await postVoiceToken(appState.baseUrl, { body: { model: 12345 } });
    const sentBody = JSON.parse(calls[0]!.init!.body as string);

    expect(sentBody).toMatchObject({ session: { model: "gpt-realtime-2" } });
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
    const json = (await res.json()) as { error: string };

    expect(json.error).toContain("network down");
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
    const json = (await res.json()) as { error: string };

    expect(json.error).toMatch(/timed out/i);
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
