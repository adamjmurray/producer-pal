// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { expect, it } from "vitest";

/** Options for posting to a voice-token endpoint in tests. */
export interface PostTokenOptions {
  /** Endpoint path, e.g. "/voice-token" or "/gemini-voice-token". */
  path: string;
  /** API-key header name, e.g. "X-OpenAI-Key" or "X-Gemini-Key". */
  keyHeader: string;
  /** Default key value when `key` is omitted. */
  defaultKey: string;
  /** Key header value; `null` to omit the header entirely. */
  key?: string | null;
  /** Request body (object is stringified, string passed through). */
  body?: unknown;
  /** Optional Origin header for cross-origin testing. */
  origin?: string;
}

/**
 * Issue a POST to a voice-token endpoint with sane defaults. Shared by the
 * OpenAI and Gemini token-route tests (same request shape, different endpoint +
 * key header).
 *
 * @param baseUrl - Base URL of the test Express server
 * @param opts - Endpoint, header, and request overrides
 * @returns The fetch Response
 */
export async function postTokenRequest(
  baseUrl: string,
  opts: PostTokenOptions,
): Promise<Response> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (opts.key !== null) headers[opts.keyHeader] = opts.key ?? opts.defaultKey;
  if (opts.origin) headers.Origin = opts.origin;
  const body =
    typeof opts.body === "string" ? opts.body : JSON.stringify(opts.body ?? {});

  return await fetch(`${baseUrl}${opts.path}`, {
    method: "POST",
    headers,
    body,
  });
}

type AuthTestPoster = (
  overrides?: Pick<PostTokenOptions, "key" | "body" | "origin">,
) => Promise<Response>;

/**
 * Register the auth/preflight tests shared by the OpenAI and Gemini
 * voice-token routes: missing key header (400) and cross-origin Origin (403).
 * Call inside a `describe` block.
 *
 * @param opts - Shared-test configuration
 * @param opts.post - Bound poster for the route under test (e.g. postVoiceToken)
 * @param opts.keyHeaderName - Header name the 400 path expects in its error message
 */
export function registerSharedTokenAuthTests(opts: {
  post: AuthTestPoster;
  keyHeaderName: string;
}): void {
  it(`returns 400 when ${opts.keyHeaderName} header is missing`, async () => {
    const res = await opts.post({ key: null });

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };

    expect(json.error.toLowerCase()).toContain(
      opts.keyHeaderName.toLowerCase(),
    );
  });

  it("blocks cross-origin requests with 403", async () => {
    const res = await opts.post({
      origin: "https://evil.example.com",
    });

    expect(res.status).toBe(403);
  });
}
