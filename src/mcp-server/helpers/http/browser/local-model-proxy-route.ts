// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// Lets the chat UI use a model server on this computer that sends no CORS
// headers (DwarfStar's ds4-server, for one): the browser calls this route and
// the server makes the call.

import {
  type IncomingHttpHeaders,
  type IncomingMessage,
  type OutgoingHttpHeaders,
  request as httpRequest,
} from "node:http";
import { request as httpsRequest } from "node:https";
import { type Express, type Request, type Response } from "express";
import {
  LOCAL_MODEL_PROXY_ERROR_HEADER,
  LOCAL_MODEL_PROXY_PATH,
  LOCAL_MODEL_URL_HEADER,
  parseLocalModelUrl,
} from "#src/shared/config.ts";
import { isSameOriginRequest, isViteDevOrigin } from "./request-origin.ts";
import { isLocalPeerRequest } from "../test-switch-guard.ts";

// What a model server needs. Never the browser's cookie, origin, host or
// referer. `content-length` is only framing, so the request body can be
// streamed through at any size (a long chat history passes 2 MB).
const FORWARDED_HEADERS = [
  "content-type",
  "accept",
  "authorization",
  "content-length",
];

const MODEL_API_PATH =
  /\/(?:models|chat\/completions|completions|responses|messages)$/;

const REDIRECTS = new Set([301, 302, 303, 307, 308]);

/**
 * Register the local model proxy route. Mount it before the app's JSON body
 * parser: it streams the request body straight through, with no size limit.
 *
 * Only Producer Pal's own chat page on this computer may use it (see
 * {@link isFromOwnPage}), and only for a model API on `localhost`, `127.0.0.1`
 * or `[::1]`, never Producer Pal itself. Redirects aren't followed, since one
 * could lead off this computer. The upstream response is streamed
 * back as it arrives, so SSE isn't buffered. A browser that disconnects takes
 * the upstream request with it.
 *
 * @param app - Express application
 */
export function registerLocalModelProxyRoute(app: Express): void {
  app.all(LOCAL_MODEL_PROXY_PATH, (req: Request, res: Response): void => {
    // Readable by the page when it's served from another port (the dev server).
    res.setHeader(
      "Access-Control-Expose-Headers",
      LOCAL_MODEL_PROXY_ERROR_HEADER,
    );

    if (req.method !== "GET" && req.method !== "POST") {
      res.set("Allow", "GET, POST");
      refuse(res, 405, "The local model proxy only supports GET and POST.");

      return;
    }

    if (!isFromOwnPage(req)) {
      refuse(
        res,
        403,
        "The local model proxy only works from Producer Pal's own chat page " +
          "on the computer running Live.",
      );

      return;
    }

    const target = parseLocalModelUrl(req.get(LOCAL_MODEL_URL_HEADER) ?? "");

    if (target == null) {
      refuse(
        res,
        400,
        "The local model proxy only reaches servers on this computer " +
          "(localhost, 127.0.0.1 or [::1]) over http or https.",
      );

      return;
    }

    if (!MODEL_API_PATH.test(target.pathname)) {
      refuse(
        res,
        400,
        "The local model proxy only forwards to a model API: a URL ending in " +
          "/models, /chat/completions, /completions, /responses or /messages.",
      );

      return;
    }

    if (isOwnServer(target, req.socket.localPort)) {
      refuse(res, 400, "The local model proxy can't call Producer Pal itself.");

      return;
    }

    forward(req, res, target);
  });
}

/**
 * Whether the request is from Producer Pal's own chat page, or a non-browser
 * client, on this computer. The connection must be loopback with a loopback
 * Host and no proxy headers. A browser's Origin, if sent, must be this server's
 * own (same host and port as the request came in on), or in a dev build the
 * Vite dev server's. Any other page on this computer, even on localhost, is
 * refused.
 *
 * @param req - Express request
 * @returns true when the request may use the proxy
 */
function isFromOwnPage(req: Request): boolean {
  if (!isLocalPeerRequest(req)) {
    return false;
  }

  const origin = req.get("Origin");

  return (
    origin == null ||
    isSameOriginRequest(origin, req) ||
    isViteDevOrigin(origin)
  );
}

/**
 * Whether a target is this very server: its port (explicit, or the scheme's
 * default) is the one the request arrived on. Targets are loopback already.
 *
 * @param target - The parsed target URL
 * @param localPort - The port the request arrived on
 * @returns true when forwarding would call Producer Pal's own routes
 */
export function isOwnServer(
  target: URL,
  localPort: number | undefined,
): boolean {
  const port = target.port || (target.protocol === "https:" ? "443" : "80");

  return Number(port) === localPort;
}

function refuse(res: Response, status: number, message: string): void {
  res
    .status(status)
    .set(LOCAL_MODEL_PROXY_ERROR_HEADER, "true")
    // The AI SDK reads error.message from an OpenAI-style error body.
    .json({ error: { message } });
}

function forwardedHeaders(headers: IncomingHttpHeaders): OutgoingHttpHeaders {
  const out: OutgoingHttpHeaders = {};

  for (const name of FORWARDED_HEADERS) {
    const value = headers[name];

    if (value != null) {
      out[name] = value;
    }
  }

  return out;
}

function forward(req: Request, res: Response, target: URL): void {
  const send = target.protocol === "https:" ? httpsRequest : httpRequest;
  // `redirect` has no option here: node:http never follows one.
  const upstream = send(target, {
    method: req.method,
    headers: forwardedHeaders(req.headers),
    agent: false,
  });

  upstream.on("response", (upstreamRes) => {
    relay(upstreamRes, res, target);
  });

  upstream.on("error", () => {
    if (res.headersSent) {
      res.destroy();

      return;
    }

    refuse(
      res,
      502,
      `Couldn't reach the local model server at ${target.origin}. ` +
        "Is it running?",
    );
  });

  // The browser went away mid-request: stop the model server's work too.
  res.on("close", () => {
    if (!res.writableFinished) {
      upstream.destroy();
    }
  });

  if (req.method === "POST") {
    req.pipe(upstream);
  } else {
    upstream.end();
  }
}

function relay(upstreamRes: IncomingMessage, res: Response, target: URL): void {
  const status = upstreamRes.statusCode ?? 502;

  if (REDIRECTS.has(status)) {
    upstreamRes.resume();
    refuse(
      res,
      502,
      `The local model server at ${target.origin} sent a redirect, which ` +
        "the proxy doesn't follow. Check the URL in the connection settings.",
    );

    return;
  }

  res.status(status);

  const contentType = upstreamRes.headers["content-type"];

  if (contentType != null) {
    // setHeader, not set(): set() adds a charset to text types.
    res.setHeader("Content-Type", contentType);
  }

  // Tell any buffering proxy in front of this one to pass SSE straight on.
  res.set("Cache-Control", "no-store");
  res.set("X-Accel-Buffering", "no");
  res.flushHeaders();

  upstreamRes.on("error", () => res.destroy());
  upstreamRes.pipe(res);
}
