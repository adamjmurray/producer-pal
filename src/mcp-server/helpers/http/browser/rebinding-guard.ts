// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { type NextFunction, type Request, type Response } from "express";
import { isIpLiteralHost, isLoopbackHost } from "#src/shared/config.ts";

// Names nobody can register publicly, so no outside DNS can rebind them.
const LOCAL_SUFFIXES = [".local", ".lan", ".home.arpa", ".internal"];

// Documented tunnel domains. They resolve to the tunnel company's servers, so a
// website can't point them at this computer.
const TUNNEL_DOMAINS = [
  "trycloudflare.com",
  "ngrok-free.dev",
  "ngrok-free.app",
  "ngrok.app",
  "ngrok.dev",
  "ngrok.io",
  "pinggy-free.link",
  "free.pinggy.net",
];

// A DNS name with an optional port. No empty labels, so a trailing dot fails.
const DNS_HOST = /^([a-z0-9_-]+(?:\.[a-z0-9_-]+)*)(?::\d+)?$/;

const REFUSED_MESSAGE =
  "only /mcp answers at this address, and never to a web page: a website " +
  "could point the address at this computer (DNS rebinding). For the chat UI " +
  "and REST API, use localhost, an IP address, a local network name, or a " +
  "documented tunnel domain. Custom domains aren't supported for those yet.";

/**
 * Guard against DNS rebinding: a website pointing its own name at this
 * computer, which makes its page same-origin, so CORS never applies.
 *
 * On a Host that can't be rebound, everything passes. On any other Host, only
 * the MCP endpoint answers (connectors on custom tunnel domains need it), and
 * not to a browser. Every other path gets a 403 whatever its headers: over
 * plain http a browser sends neither `Origin` nor `Sec-Fetch-Site` on a
 * same-origin GET, so headers can't prove a GET isn't a page's.
 *
 * A browser is a request with `Origin` or `Sec-Fetch-Site`. Never decide on
 * `Sec-Fetch-Mode` (Node's fetch and Mistral send it) or on `X-Forwarded-*` /
 * `Cf-*` (a page can set those without a preflight).
 *
 * @param req - Express request
 * @param res - Express response (a 403 is written when refused)
 * @param next - Next middleware in the chain
 */
export function rebindingGuard(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const host = req.get("host");
  const fromBrowser =
    req.get("Origin") != null || req.get("Sec-Fetch-Site") != null;

  if (
    (host != null && isRebindSafeHost(host)) ||
    (!fromBrowser && isMcpEndpoint(req.path))
  ) {
    next();

    return;
  }

  res.status(403).json({ error: REFUSED_MESSAGE });
}

/**
 * Whether a `host[:port]` can't be rebound by a website: localhost, an IP
 * literal, a one-word name, a local-only suffix, or a documented tunnel domain.
 * `localhost.evil.com` and `127.0.0.1.evil.com` don't count.
 *
 * @param host - Host header value, with an optional port
 * @returns true when every route may answer on this host
 */
export function isRebindSafeHost(host: string): boolean {
  if (isLoopbackHost(host) || isIpLiteralHost(host)) {
    return true;
  }

  const name = DNS_HOST.exec(host.toLowerCase())?.[1];

  if (name == null) {
    return false;
  }

  return (
    !name.includes(".") ||
    LOCAL_SUFFIXES.some((suffix) => name.endsWith(suffix)) ||
    TUNNEL_DOMAINS.some(
      (domain) => name === domain || name.endsWith(`.${domain}`),
    )
  );
}

/**
 * Whether a path is the MCP endpoint or MCP discovery. Matches exactly what
 * Express routes to `/mcp` (case-insensitive, optional trailing slash). Express
 * doesn't decode or resolve `..` before routing, so `/mcp/../config` and
 * `/.well-known/../config` reach no route.
 *
 * @param path - Request path, without the query
 * @returns true for `/mcp` and anything under `/.well-known/`
 */
function isMcpEndpoint(path: string): boolean {
  const lower = path.toLowerCase();

  return (
    lower === "/mcp" || lower === "/mcp/" || path.startsWith("/.well-known/")
  );
}
