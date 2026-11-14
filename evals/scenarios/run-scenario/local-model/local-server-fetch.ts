// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

const LOOKUP_TIMEOUT_MS = 3000;

/**
 * Fetch JSON from a local model server with a short timeout. Never throws.
 *
 * @param path - Absolute path on the server, e.g. "/api/ps"
 * @param baseUrl - Local server base URL; only its origin is used
 * @param body - JSON body to POST; omit for a GET
 * @returns The parsed response, or undefined on any failure
 */
export async function fetchLocalServerJson(
  path: string,
  baseUrl: string,
  body?: unknown,
): Promise<unknown> {
  try {
    const response = await fetch(new URL(path, baseUrl), {
      signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
      ...(body !== undefined && {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    });

    return response.ok ? await response.json() : undefined;
  } catch {
    return undefined;
  }
}
