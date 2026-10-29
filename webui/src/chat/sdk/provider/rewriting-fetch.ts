// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/** A fetch a provider can be handed in place of the global one. */
export type RewritingFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

/**
 * Build a fetch that rewrites the outgoing JSON body on its way out. A body
 * that isn't JSON, or that `transform` leaves alone, goes out byte-for-byte.
 * @param transform - Mutates the parsed body; returns true when it changed it
 * @returns The fetch to hand the provider
 */
export function rewritingFetch(
  transform: (body: unknown) => boolean | Promise<boolean>,
): RewritingFetch {
  return async (input, init) => {
    if (init?.body && typeof init.body === "string") {
      try {
        const body: unknown = JSON.parse(init.body);

        if (await transform(body)) {
          init = { ...init, body: JSON.stringify(body) };
        }
      } catch {
        // Not JSON — pass through unchanged
      }
    }

    return await fetch(input, init);
  };
}
