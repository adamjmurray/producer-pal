// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { type NextFunction, type Request, type Response } from "express";
import { isIpLiteralHost, isLoopbackHost } from "#src/shared/config.ts";
import { isNetworkAccessAllowed } from "../network-access-state.ts";

// Names nobody can register publicly. The local network resolves them (mDNS,
// router DNS, search domains), so someone on it can point one at 127.0.0.1.
// Trusted only while other computers may connect.
const LOCAL_SUFFIXES = [".local", ".lan", ".home.arpa", ".internal"];

// Documented tunnel domains. They resolve to the tunnel company's servers, so a
// website can't point them at this computer. Tailscale's ts.net names only
// point at devices in the user's own tailnet.
const TUNNEL_DOMAINS = [
  "trycloudflare.com",
  "ngrok-free.dev",
  "ngrok-free.app",
  "ngrok.app",
  "ngrok.dev",
  "ngrok.io",
  "pinggy-free.link",
  "free.pinggy.net",
  "pinggy.link",
  "a.pinggy.io",
  "ts.net",
];

// A DNS name with an optional port. No empty labels, so a trailing dot fails.
const DNS_HOST = /^([a-z0-9_-]+(?:\.[a-z0-9_-]+)*)(?::\d+)?$/;

const REFUSED_MESSAGE =
  "only /mcp answers at this address, and never to a web page: a website " +
  "could point the address at this computer (DNS rebinding). For the chat UI " +
  "and REST API, use localhost, an IP address, a documented tunnel domain, " +
  'or (only while "Remote Control" is on) a local network ' +
  "name. Custom domains aren't supported for those yet.";

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
 * `Cf-*` (a page can set those without a preflight). The claude.ai, ChatGPT
 * and Mistral connectors send neither `Origin` nor `Sec-Fetch-Site` (measured
 * Nov 2026), so this test never blocks them.
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
 * literal, or a documented tunnel domain; plus a one-word name or a local-only
 * suffix, but only while "Remote Control" is on. The local
 * network decides how those resolve, so with it off, anyone on the Wi-Fi could
 * point `evil.local` at their own address and then at 127.0.0.1. Read per
 * request, because the setting can change while running.
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
    TUNNEL_DOMAINS.some(
      (domain) => name === domain || name.endsWith(`.${domain}`),
    ) ||
    (isNetworkAccessAllowed() && isLocalNetworkName(name))
  );
}

function isLocalNetworkName(name: string): boolean {
  return (
    !name.includes(".") ||
    LOCAL_SUFFIXES.some((suffix) => name.endsWith(suffix))
  );
}

// The discovery paths MCP clients probe (OAuth metadata, and the server card
// from the original probe). No route answers them: they only get Express's
// plain 404 instead of the guard's 403, which clients can read as "no auth".
// Exact and case-sensitive: clients send them lowercase, and a prefix would let
// any future route under `/.well-known/` through on an untrusted Host.
const DISCOVERY_PATHS = new Set([
  ...[
    "oauth-protected-resource",
    "oauth-authorization-server",
    "openid-configuration",
  ].flatMap((name) => [`/.well-known/${name}`, `/.well-known/${name}/mcp`]),
  "/.well-known/mcp/server-card/mcp",
]);

/**
 * Whether a path is the MCP endpoint or one of the discovery paths. `/mcp`
 * matches exactly what Express routes to it (case-insensitive, optional
 * trailing slash). Express doesn't decode or resolve `..` before routing, so
 * `/mcp/../config` and `/.well-known/oauth-protected-resource/../config` reach
 * no route.
 *
 * @param path - Request path, without the query
 * @returns true for `/mcp` and the discovery paths
 */
function isMcpEndpoint(path: string): boolean {
  const lower = path.toLowerCase();

  return lower === "/mcp" || lower === "/mcp/" || DISCOVERY_PATHS.has(path);
}
