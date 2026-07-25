// Producer Pal
// Copyright (C) 2026 Adam Murray, Eike Haß
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type Request, type Response, type NextFunction } from "express";
import { isLocalOrigin } from "./request-origin.ts";

/**
 * CORS middleware for the MCP server.
 *
 * By default it reflects only localhost origins, so a browser page you serve
 * locally (a dev server, the MCP Inspector, your own tool on another port) can
 * call the API, while pages from the internet stay blocked. The Origin header is
 * browser-set and can't be forged by page JS, so an internet page always carries
 * its real domain and gets no header. Non-browser clients (curl, scripts, Max)
 * ignore CORS entirely and are unaffected either way.
 *
 * Set ENABLE_REMOTE_CORS to widen this to any origin ("*") — needed only for
 * browser dev tooling served from a non-localhost origin (a remote Inspector,
 * LAN). Specify it manually on the CLI before a build; it is never baked into an
 * npm script.
 *
 * @param req - Express request
 * @param res - Express response
 * @param next - Next middleware in the chain
 */
export function corsMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const origin = req.get("Origin");
  let allowOrigin: string | null = null;

  if (process.env.ENABLE_REMOTE_CORS === "true") {
    allowOrigin = "*";
  } else if (origin != null && isLocalOrigin(origin)) {
    allowOrigin = origin;
  }

  if (allowOrigin != null) {
    res.setHeader("Access-Control-Allow-Origin", allowOrigin);

    // Reflected origins vary per request, so caches must key on Origin.
    if (allowOrigin !== "*") {
      res.setHeader("Vary", "Origin");
    }

    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS, DELETE");
    res.setHeader("Access-Control-Allow-Headers", "*");

    // Answer the preflight for an allowed origin.
    if (req.method === "OPTIONS") {
      res.status(200).end();

      return;
    }
  }

  next();
}
