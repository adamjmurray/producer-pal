// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// Forwards a chat UI request to a model server on this computer and streams
// the answer back. Shared by the local model proxy and the local AI relay.

import {
  type IncomingHttpHeaders,
  type IncomingMessage,
  type OutgoingHttpHeaders,
  request as httpRequest,
} from "node:http";
import { request as httpsRequest } from "node:https";
import { type Request, type Response } from "express";
import { LOCAL_MODEL_PROXY_ERROR_HEADER } from "#src/shared/config.ts";

// What a model server needs. Never the browser's cookie, origin, host or
// referer. `content-length` is only framing, so the request body can be
// streamed through at any size (a long chat history passes 2 MB).
const FORWARDED_HEADERS = [
  "content-type",
  "accept",
  "authorization",
  "content-length",
];

const REDIRECTS = new Set([301, 302, 303, 307, 308]);

// Generous: a local server loads the model before it answers, which can take
// minutes for a big one. Only a server that never answers hits it.
const ANSWER_TIMEOUT_MS = 5 * 60 * 1000;

export interface ForwardOptions {
  /** Names the server in errors, e.g. "the local model server at http://localhost:1234". */
  serverName: string;
  /** How long the server may take to start answering. */
  answerTimeoutMs?: number;
}

/**
 * Forward a request to a model server and stream its answer back unbuffered.
 * Redirects aren't followed, since one could lead off this computer. A browser
 * that disconnects takes the upstream request with it, so the server stops
 * generating. Failures come back as OpenAI-style errors the chat can show: a
 * 502 or 504 before the answer starts, an SSE error event after.
 *
 * @param req - Express request; its body is piped through for POST
 * @param res - Express response
 * @param target - The model server URL to call
 * @param options - Error wording and timeout
 */
export function forwardToModelServer(
  req: Request,
  res: Response,
  target: URL,
  options: ForwardOptions,
): void {
  const { serverName, answerTimeoutMs = ANSWER_TIMEOUT_MS } = options;
  const send = target.protocol === "https:" ? httpsRequest : httpRequest;
  // `redirect` has no option here: node:http never follows one.
  const upstream = send(target, {
    method: req.method,
    headers: forwardedHeaders(req.headers),
    agent: false,
  });

  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    upstream.destroy();
    refuseProxyRequest(
      res,
      504,
      `${capitalize(serverName)} didn't start answering in time.`,
    );
  }, answerTimeoutMs);

  upstream.on("response", (upstreamRes) => {
    clearTimeout(timer);
    relay(upstreamRes, res, serverName);
  });

  upstream.on("error", () => {
    clearTimeout(timer);

    if (timedOut) {
      return;
    }

    if (res.headersSent) {
      endMidStream(res, serverName);

      return;
    }

    refuseProxyRequest(
      res,
      502,
      `Couldn't reach ${serverName}. Is it running?`,
    );
  });

  // The browser went away mid-request: stop the model server's work too.
  res.on("close", () => {
    clearTimeout(timer);

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

/**
 * Answer with the proxy's own error, marked so the chat UI can tell it from
 * the model server's. Only before the answer has started.
 *
 * @param res - Express response
 * @param status - HTTP status
 * @param message - What went wrong, for the person chatting
 */
export function refuseProxyRequest(
  res: Response,
  status: number,
  message: string,
): void {
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

function relay(
  upstreamRes: IncomingMessage,
  res: Response,
  serverName: string,
): void {
  const status = upstreamRes.statusCode ?? 502;

  if (REDIRECTS.has(status)) {
    upstreamRes.resume();
    refuseProxyRequest(
      res,
      502,
      `${capitalize(serverName)} sent a redirect, which Producer Pal ` +
        "doesn't follow. Check the URL in the connection settings.",
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

  upstreamRes.on("error", () => endMidStream(res, serverName));
  upstreamRes.pipe(res);
}

// The status is already sent. A streamed reply gets an error event the AI SDK
// shows in the chat; anything else can only be cut off.
function endMidStream(res: Response, serverName: string): void {
  // Both the request and the response can report the same drop.
  if (res.writableEnded) {
    return;
  }

  const contentType = String(res.getHeader("Content-Type") ?? "");

  if (!contentType.startsWith("text/event-stream")) {
    res.destroy();

    return;
  }

  const error = {
    message: `Lost the connection to ${serverName} in the middle of the reply.`,
  };

  // The blank line first ends any event the server left half-written.
  res.end(`\n\ndata: ${JSON.stringify({ error })}\n\n`);
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
