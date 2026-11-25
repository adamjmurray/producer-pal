// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// GET JSON from the device server. Every read here bypasses the browser cache:
// the device's state changes under the page (AI writes, the Max UI), so a
// cached body would show something that is no longer true.

/** What a read needs to say when it fails. */
interface FetchJsonOptions {
  /** What failed, for the error text (e.g. "Config request"). */
  label: string;
  signal?: AbortSignal;
}

/**
 * GET JSON, throwing when the server refuses — for a read whose failure the
 * caller has to show.
 * @param url - The endpoint
 * @param options - Error label and optional abort signal
 * @returns The parsed body
 * @throws Error when the response isn't OK
 */
export async function fetchJson<T>(
  url: string,
  options: FetchJsonOptions,
): Promise<T> {
  const response = await fetch(url, {
    cache: "no-store",
    ...(options.signal && { signal: options.signal }),
  });

  if (!response.ok) {
    throw new Error(
      `${options.label} failed (${response.status} ${response.statusText})`,
    );
  }

  return (await response.json()) as T;
}

/**
 * GET JSON, answering null instead of throwing — for a read whose failure (or
 * abort on unmount) just leaves the caller on the default it already shows.
 * @param url - The endpoint
 * @param signal - Abort signal
 * @returns The parsed body, or null when nothing usable came back
 */
export async function fetchJsonOrNull<T>(
  url: string,
  signal?: AbortSignal,
): Promise<T | null> {
  try {
    return await fetchJson<T>(url, { label: "request", signal });
  } catch {
    return null;
  }
}

/**
 * The server's own reason for refusing a request, from its JSON body.
 * @param response - The failed response
 * @returns The body's `error` text, or null when the body has none
 */
export async function responseError(
  response: Response,
): Promise<string | null> {
  try {
    const body = (await response.json()) as { error?: unknown };

    return typeof body.error === "string" ? body.error : null;
  } catch {
    return null;
  }
}
