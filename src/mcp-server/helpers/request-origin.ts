// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Check whether an Origin header value points to localhost. Used to block
 * cross-origin browser requests from proxying writes or API keys through the
 * device while still allowing same-origin and non-browser (Origin-less) clients.
 *
 * @param origin - Origin header value
 * @returns true if origin hostname is localhost/127.0.0.1/[::1]
 */
export function isLocalOrigin(origin: string): boolean {
  try {
    const { hostname } = new URL(origin);

    return (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "[::1]"
    );
  } catch {
    return false;
  }
}
