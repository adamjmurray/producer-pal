// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it } from "vitest";
import { setupExpressAppServer } from "../../tests/express-app-test-helpers.ts";
import {
  type PostTokenOptions,
  postTokenRequest,
  registerSharedTokenAuthTests,
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

  registerSharedTokenAuthTests({
    post: (overrides) => postGeminiToken(appState.baseUrl, overrides),
    keyHeaderName: "X-Gemini-Key",
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
