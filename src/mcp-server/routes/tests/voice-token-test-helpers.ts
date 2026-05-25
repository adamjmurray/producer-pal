// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

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
