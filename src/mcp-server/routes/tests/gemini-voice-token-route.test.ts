// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it } from "vitest";
import {
  mockMax,
  setupExpressAppServer,
} from "../../tests/express-app-test-helpers.ts";
import {
  type PostTokenOptions,
  postTokenRequest,
} from "./voice-token-test-helpers.ts";

const REAL_FETCH = globalThis.fetch;

/**
 * POST to /gemini-voice-token with Gemini defaults.
 *
 * @param baseUrl - Base URL of the test Express server
 * @param opts - Key/body/origin overrides
 * @returns The fetch Response
 */
async function postGeminiToken(
  baseUrl: string,
  opts: Pick<PostTokenOptions, "key" | "body" | "origin"> = {},
): Promise<Response> {
  return await postTokenRequest(baseUrl, {
    path: "/gemini-voice-token",
    keyHeader: "X-Gemini-Key",
    defaultKey: "gem-test",
    ...opts,
  });
}

describe("gemini-voice-token route", () => {
  const appState = setupExpressAppServer();

  beforeEach(() => {
    globalThis.fetch = REAL_FETCH;
  });

  it("returns 400 when X-Gemini-Key header is missing", async () => {
    const res = await postGeminiToken(appState.baseUrl, { key: null });

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };

    expect(json.error.toLowerCase()).toContain("x-gemini-key");
  });

  it("returns 403 when the chat UI is disabled", async () => {
    const setChatUIEnabled = mockMax.handlers.get("chatUIEnabled") as (
      input: unknown,
    ) => void;

    setChatUIEnabled(0);

    try {
      const res = await postGeminiToken(appState.baseUrl);

      expect(res.status).toBe(403);
      const json = (await res.json()) as { error: string };

      expect(json.error).toBe("Chat UI is disabled");
    } finally {
      setChatUIEnabled(1);
    }
  });

  it("blocks cross-origin requests with 403", async () => {
    const res = await postGeminiToken(appState.baseUrl, {
      origin: "https://evil.example.com",
    });

    expect(res.status).toBe(403);
  });

  it("returns the key as a non-ephemeral credential (localhost passthrough)", async () => {
    const res = await postGeminiToken(appState.baseUrl, {
      key: "gem-secret-key",
      body: { model: "gemini-3.1-flash-live-preview" },
    });

    expect(res.status).toBe(200);
    const json = (await res.json()) as Record<string, unknown>;

    expect(json).toStrictEqual({ value: "gem-secret-key", ephemeral: false });
  });
});
