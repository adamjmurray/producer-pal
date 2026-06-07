// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Check whether an Origin header value points to localhost. Used ONLY to gate
 * cross-origin browser writes to POST /config (device settings), while still
 * allowing same-origin and non-browser (Origin-less) clients.
 *
 * Intentionally NOT used to gate /mcp or /api/tools: the chat UI connects to
 * those same-origin from the page URL, which over LAN/tunnel is a non-localhost
 * origin, so a localhost gate there would break the documented unauthenticated
 * remote-access feature (see the POST /mcp handler in create-express-app.ts).
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
