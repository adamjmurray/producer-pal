// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { errorMessage } from "#src/shared/error-message";

/** A 2xx's JSON body (null when it isn't JSON), or why the POST failed. */
export type InstallPost<Body> =
  | { body: Partial<Body & { error: string }> | null; error: null }
  | { body: null; error: string };

/**
 * POST an install; a refusal or network failure comes back as `error`. The
 * caller checks that a 2xx body has what it needs.
 * @param url - The install endpoint
 * @param payload - The JSON body to send
 * @returns The response body, or the error to show
 */
export async function postInstallRequest<Body>(
  url: string,
  payload: object,
): Promise<InstallPost<Body>> {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    // An older server has no such route, so the 404 comes back as HTML.
    const body =
      await readJsonBody<Partial<Body & { error: string }>>(response);

    if (!response.ok) {
      return {
        body: null,
        error: body?.error ?? `Install failed (${response.status})`,
      };
    }

    return { body, error: null };
  } catch (err) {
    return { body: null, error: errorMessage(err) };
  }
}

/**
 * Parse a JSON response body, or null when the response isn't JSON.
 * @param response - The install response
 * @returns The parsed body, or null
 */
async function readJsonBody<T>(response: Response): Promise<T | null> {
  if (
    response.headers.get("Content-Type")?.includes("application/json") !== true
  ) {
    return null;
  }

  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}
