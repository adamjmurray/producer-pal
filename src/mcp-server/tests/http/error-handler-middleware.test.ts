// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type NextFunction, type Request, type Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as console from "#src/mcp-server/node-for-max-logger.ts";
import { errorHandlerMiddleware } from "../../helpers/http/error-handler-middleware.ts";

vi.mock(import("#src/mcp-server/node-for-max-logger.ts"), () => ({
  log: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

interface FakeResponse {
  res: Response;
  status: ReturnType<typeof vi.fn>;
  json: ReturnType<typeof vi.fn>;
}

/**
 * A response that records what the handler answered.
 *
 * @param headersSent - Whether the response has already started
 * @returns The fake response and its spies
 */
function fakeResponse(headersSent = false): FakeResponse {
  const json = vi.fn();
  const status = vi.fn(() => ({ json }));
  const res = { headersSent, status, json } as unknown as Response;

  return { res, status, json };
}

const request = {} as Request;

/**
 * Run the middleware and report what it answered.
 *
 * @param error - Whatever was thrown or passed to next()
 * @param headersSent - Whether the response has already started
 * @returns The status, the JSON body, and the next() spy
 */
function handle(
  error: unknown,
  headersSent = false,
): { status: unknown; body: unknown; next: NextFunction } {
  const { res, status, json } = fakeResponse(headersSent);
  const next = vi.fn() as unknown as NextFunction;

  errorHandlerMiddleware(error, request, res, next);

  return {
    status: status.mock.calls[0]?.[0],
    body: json.mock.calls[0]?.[0],
    next,
  };
}

describe("errorHandlerMiddleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("echoes the message of an error that says the caller caused it", () => {
    const { status, body } = handle(
      Object.assign(new SyntaxError("Unexpected token b"), {
        status: 400,
        expose: true,
      }),
    );

    expect(status).toBe(400);
    expect(body).toStrictEqual({ error: "Unexpected token b" });
  });

  it("keeps the status the error asked for", () => {
    const { status, body } = handle(
      Object.assign(new Error("request entity too large"), {
        status: 413,
        expose: true,
      }),
    );

    expect(status).toBe(413);
    expect(body).toStrictEqual({ error: "request entity too large" });
  });

  // body-parser sets both; some versions of its dependencies set only one.
  it("reads the status off statusCode when there is no status", () => {
    const { status } = handle(
      Object.assign(new Error("nope"), { statusCode: 400, expose: true }),
    );

    expect(status).toBe(400);
  });

  // The whole point: never trade an HTML stack trace for a JSON one.
  it.each([
    ["no status at all", new Error("connect ECONNREFUSED /Users/x")],
    [
      "a 5xx that claims expose",
      Object.assign(new Error("secret"), { status: 500, expose: true }),
    ],
    ["a thrown string", "raw string with /Users/x in it"],
    ["null", null],
  ])("says nothing about a server fault with %s", (_label, error) => {
    const { status, body } = handle(error);

    expect(status).toBe(500);
    expect(body).toStrictEqual({ error: "Internal server error" });
  });

  // The router's 400 for an undecodable path carries a status but no expose.
  it.each([
    [
      "no expose flag",
      Object.assign(new URIError("Failed to decode param"), { status: 400 }),
    ],
    [
      "expose false",
      Object.assign(new Error("secret"), { status: 400, expose: false }),
    ],
  ])(
    "keeps a 4xx status but not the message when it has %s",
    (_label, error) => {
      const { status, body } = handle(error);

      expect(status).toBe(400);
      expect(body).toStrictEqual({ error: "Bad request" });
    },
  );

  it("logs a server fault so it is still visible in the Max console", () => {
    handle(new Error("boom"));

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("boom") as unknown as string,
    );
  });

  it.each([
    [
      "exposed",
      Object.assign(new Error("bad json"), { status: 400, expose: true }),
    ],
    [
      "not",
      Object.assign(new URIError("Failed to decode param"), { status: 400 }),
    ],
  ])("does not log a caller mistake, %s", (_label, error) => {
    handle(error);

    expect(console.error).not.toHaveBeenCalled();
  });

  // A status outside the HTTP range would make res.status() throw.
  it.each([
    ["a status below 400", 200],
    ["a status above 599", 4000],
  ])("ignores %s", (_label, status) => {
    const { status: answered } = handle(
      Object.assign(new Error("x"), { status, expose: true }),
    );

    expect(answered).toBe(500);
  });

  // The MCP transport streams its own response; there is nothing left to replace.
  it("hands back to Express once the response has started", () => {
    const error = new Error("too late");
    const { status, next } = handle(error, true);

    expect(status).toBeUndefined();
    expect(next).toHaveBeenCalledWith(error);
  });
});
