// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// The deadline every ~/.producer-pal request runs under. The REST handlers are
// synchronous and always answer, so a hang needs the Node-for-Max loop blocked —
// synchronous fs on a stalled network home directory does it. A caller can't
// tell a hung request from a slow one, so without a deadline it waits forever,
// and the editors have live state riding on that: an in-flight save holds
// autosave off and makes every later refresh discard its result.

import { DOC_REQUEST_TIMEOUT_MS } from "#webui/lib/constants/transport";

/**
 * Run one request and fail it if the server doesn't answer in time. The deadline
 * covers the body read too, since a response whose stream stalls hangs the
 * caller exactly the way an unanswered request does.
 * @param url - The endpoint to request
 * @param init - Cache, method, headers, and body for the request
 * @param timedOut - Error message for a request that outran the deadline
 * @param handle - Checks the response and reads its body
 * @returns Whatever handle read
 */
export async function fetchWithDeadline<T>(
  url: string,
  init: RequestInit,
  timedOut: string,
  handle: (response: Response) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  // Nothing fires it once the page is gone, so a keepalive write dispatched from
  // the beforeunload/unmount flush still finishes on its own.
  const timer = setTimeout(
    controller.abort.bind(controller),
    DOC_REQUEST_TIMEOUT_MS,
  );

  try {
    return await handle(
      await fetch(url, { ...init, signal: controller.signal }),
    );
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error(timedOut, { cause: error });
    }

    throw error;
  } finally {
    clearTimeout(timer);
  }
}
