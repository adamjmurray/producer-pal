// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { STATUS_CODES } from "node:http";
import { type NextFunction, type Request, type Response } from "express";
import * as console from "../../node-for-max-logger.ts";

/** What Express attaches to an error it raises. */
interface HttpError {
  message?: unknown;
  status?: unknown;
  statusCode?: unknown;
  expose?: unknown;
}

/**
 * Last resort for anything that escaped every route: a malformed JSON body, an
 * oversized one, a bad percent-encoded path. Without it Express answers a JSON
 * API with an HTML page carrying a stack trace and the server's absolute paths
 * — on a server that is deliberately reachable from off the machine.
 *
 * Register it last, after every route.
 *
 * @param error - Whatever was thrown or passed to next()
 * @param _req - Express request
 * @param res - Express response
 * @param next - Next middleware in the chain
 * @returns Nothing
 */
export function errorHandlerMiddleware(
  error: unknown,
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  // The MCP transport streams its own response. Once it has started there is
  // nothing left to replace, so hand back to Express to close the connection.
  if (res.headersSent) {
    next(error);

    return;
  }

  const status = errorStatus(error);

  if (status < 500) {
    // expose says the message describes what the caller sent, so echoing it is
    // safe and useful. Today only body-parser sets it, and only on the body it
    // was handed. Nothing enforces that: http-errors marks every 4xx expose,
    // so a route that starts using it must not put a server path in a message.
    //
    // Without expose, answer the status and nothing more — the router's 400 for
    // an undecodable path sets no expose flag at all.
    const exposed = (error as HttpError | null)?.expose === true;

    res.status(status).json({
      error: exposed
        ? String((error as HttpError).message)
        : (STATUS_CODES[status] ?? "Request failed"),
    });

    return;
  }

  // A caller mistake is not worth logging; a genuine internal failure is. Never
  // echo it, or we've traded an HTML stack trace for a JSON one.
  console.error(`Unhandled request error: ${String(error)}`);
  res.status(500).json({ error: "Internal server error" });
}

/**
 * The status an error asks for.
 *
 * Read both spellings: not every error source sets `status`. Anything that
 * isn't a whole number in the HTTP error range is 500 — res.status() throws on
 * the rest, out of the one handler that has to never throw.
 *
 * @param error - Whatever was thrown or passed to next()
 * @returns The HTTP status, or 500 when the error names none
 */
function errorStatus(error: unknown): number {
  const { status, statusCode } = (error ?? {}) as HttpError;
  const claimed = typeof status === "number" ? status : statusCode;

  return typeof claimed === "number" &&
    Number.isInteger(claimed) &&
    claimed >= 400 &&
    claimed <= 599
    ? claimed
    : 500;
}
