// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchGeminiToken } from "#webui/hooks/voice/gemini/gemini-voice-token";

const TOKEN_URL = "http://localhost:3350/gemini-voice-token";

afterEach(() => {
  vi.restoreAllMocks();
});

/**
 * Stub global fetch with a single JSON (or custom) response.
 * @param response - The Response to resolve with
 * @returns The fetch spy
 */
function stubFetch(response: Response) {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue(response);
}

describe("fetchGeminiToken", () => {
  it("sends the key header + model and returns the credential", async () => {
    const fetchSpy = stubFetch(
      new Response(JSON.stringify({ value: "gem-key", ephemeral: false }), {
        status: 200,
      }),
    );

    const cred = await fetchGeminiToken(TOKEN_URL, "gem-key", "gemini-live");

    expect(cred).toStrictEqual({ value: "gem-key", ephemeral: false });
    const init = fetchSpy.mock.calls[0]![1]!;

    expect((init.headers as Record<string, string>)["X-Gemini-Key"]).toBe(
      "gem-key",
    );
    expect(JSON.parse(init.body as string)).toStrictEqual({
      model: "gemini-live",
    });
  });

  it("honors the ephemeral flag from the server", async () => {
    stubFetch(
      new Response(
        JSON.stringify({ value: "auth_tokens/abc", ephemeral: true }),
        {
          status: 200,
        },
      ),
    );

    const cred = await fetchGeminiToken(TOKEN_URL, "k", "m");

    expect(cred).toStrictEqual({ value: "auth_tokens/abc", ephemeral: true });
  });

  it("throws with detail on a non-ok response", async () => {
    stubFetch(
      new Response(JSON.stringify({ error: "Chat UI is disabled" }), {
        status: 403,
        statusText: "Forbidden",
      }),
    );

    await expect(fetchGeminiToken(TOKEN_URL, "k", "m")).rejects.toThrow(
      /403.*Chat UI is disabled/,
    );
  });

  it("throws on a non-ok response whose body isn't JSON", async () => {
    stubFetch(new Response("nope", { status: 500, statusText: "Error" }));

    await expect(fetchGeminiToken(TOKEN_URL, "k", "m")).rejects.toThrow(/500/);
  });

  it("throws when the response is missing the value field", async () => {
    stubFetch(
      new Response(JSON.stringify({ ephemeral: false }), { status: 200 }),
    );

    await expect(fetchGeminiToken(TOKEN_URL, "k", "m")).rejects.toThrow(
      /missing 'value'/,
    );
  });
});
