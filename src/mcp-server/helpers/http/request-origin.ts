// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type Request, type Response } from "express";

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

/**
 * Gate a browser write to a localhost-only endpoint. Same-origin and
 * non-browser (Origin-less) clients pass; a cross-origin browser gets a 403
 * with `message` and this returns true so the caller can bail. See
 * {@link isLocalOrigin} for why this is applied to config/content writes but
 * never to /mcp or /api/tools.
 *
 * @param req - Express request
 * @param res - Express response (a 403 is written when rejected)
 * @param message - Error body for the 403 (endpoint-specific wording)
 * @returns true if the request was rejected (403 written); false to proceed
 */
export function rejectCrossOriginWrite(
  req: Request,
  res: Response,
  message: string,
): boolean {
  const origin = req.get("Origin");

  if (origin && !isLocalOrigin(origin)) {
    res.status(403).json({ error: message });

    return true;
  }

  return false;
}

/**
 * Whether a browser Origin names the same server this request hit — a true
 * same-origin check by host (hostname + port). Scheme-insensitive on purpose so
 * a TLS-terminating tunnel (public https, internal http) still matches: the
 * browser's Origin host equals the forwarded `Host` header either way.
 *
 * @param origin - Origin header value
 * @param req - Express request (its `Host` header names the server's own host)
 * @returns true when the origin's host equals the request's Host header
 */
export function isSameOriginRequest(origin: string, req: Request): boolean {
  try {
    return new URL(origin).host === req.get("host");
  } catch {
    return false;
  }
}

/**
 * Gate a browser CONTENT write, allowing same-origin remote clients. Same-origin
 * (the webui served by THIS server, including over LAN/tunnel), localhost, and
 * non-browser (Origin-less) clients pass; only a genuinely foreign browser
 * origin gets a 403. Applied to the content endpoints (global context / custom
 * instructions, skills overrides, memory, custom skills) so a remote webui can
 * save its own content — consistent with /mcp and /api/tools, which are already
 * remotely writable. The stricter localhost-only {@link rejectCrossOriginWrite}
 * still guards /config and voice-token minting.
 *
 * @param req - Express request
 * @param res - Express response (a 403 is written when rejected)
 * @param message - Error body for the 403 (endpoint-specific wording)
 * @returns true if the request was rejected (403 written); false to proceed
 */
export function rejectForeignOriginWrite(
  req: Request,
  res: Response,
  message: string,
): boolean {
  const origin = req.get("Origin");

  if (!origin || isLocalOrigin(origin) || isSameOriginRequest(origin, req)) {
    return false;
  }

  res.status(403).json({ error: message });

  return true;
}
