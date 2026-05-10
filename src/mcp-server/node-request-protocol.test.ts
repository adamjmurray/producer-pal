// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import Max from "max-api";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearNodeRoutes,
  handleNodeRequest,
  registerNodeRoute,
} from "./node-request-protocol.ts";

vi.mock(import("./node-for-max-logger.ts"), () => ({
  log: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

/**
 * Parse the response JSON sent via Max.outlet
 *
 * @returns Parsed response object
 */
function parseSentResponse(): {
  success: boolean;
  result?: unknown;
  error?: string;
} {
  const call = vi.mocked(Max.outlet).mock.calls[0];

  expect(call).toBeDefined();
  expect(call?.[0]).toBe("node_response");

  const json = call?.[2] as string;

  return JSON.parse(json) as {
    success: boolean;
    result?: unknown;
    error?: string;
  };
}

describe("node-request-protocol", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    clearNodeRoutes();
  });

  it("dispatches to a registered route and returns the result", async () => {
    registerNodeRoute("echo", (args) => ({ echoed: args }));

    const request = JSON.stringify({
      route: "echo",
      args: { hello: "world" },
    });

    await handleNodeRequest("req-1", request);

    expect(vi.mocked(Max.outlet)).toHaveBeenCalledWith(
      "node_response",
      "req-1",
      expect.any(String),
    );

    const response = parseSentResponse();

    expect(response.success).toBe(true);
    expect(response.result).toStrictEqual({ echoed: { hello: "world" } });
  });

  it("awaits async route handlers", async () => {
    registerNodeRoute("async.add", async (args) => {
      const { a, b } = args as { a: number; b: number };

      return await Promise.resolve(a + b);
    });

    const request = JSON.stringify({
      route: "async.add",
      args: { a: 2, b: 3 },
    });

    await handleNodeRequest("req-2", request);

    const response = parseSentResponse();

    expect(response.success).toBe(true);
    expect(response.result).toBe(5);
  });

  it("returns failure for unknown routes", async () => {
    const request = JSON.stringify({ route: "missing", args: {} });

    await handleNodeRequest("req-3", request);

    const response = parseSentResponse();

    expect(response.success).toBe(false);
    expect(response.error).toContain("Unknown route: missing");
  });

  it("returns failure when handler throws", async () => {
    registerNodeRoute("boom", () => {
      throw new Error("kaboom");
    });

    const request = JSON.stringify({ route: "boom", args: {} });

    await handleNodeRequest("req-4", request);

    const response = parseSentResponse();

    expect(response.success).toBe(false);
    expect(response.error).toBe("kaboom");
  });

  it("returns failure when handler rejects", async () => {
    registerNodeRoute("rejects", () => Promise.reject(new Error("nope")));

    const request = JSON.stringify({ route: "rejects", args: {} });

    await handleNodeRequest("req-5", request);

    const response = parseSentResponse();

    expect(response.success).toBe(false);
    expect(response.error).toBe("nope");
  });

  it("returns failure for invalid JSON", async () => {
    await handleNodeRequest("req-6", "not json {");

    const response = parseSentResponse();

    expect(response.success).toBe(false);
    expect(response.error).toContain("Failed to parse request");
  });

  it("throws when registering a duplicate route", () => {
    registerNodeRoute("dupe", () => 1);

    expect(() => registerNodeRoute("dupe", () => 2)).toThrow(
      /already registered/,
    );
  });

  it("logs error when Max.outlet fails", async () => {
    const consoleMock = await import("./node-for-max-logger.ts");

    registerNodeRoute("ok", () => 1);
    vi.mocked(Max.outlet).mockRejectedValueOnce(new Error("outlet failed"));

    const request = JSON.stringify({ route: "ok", args: {} });

    await handleNodeRequest("req-err", request);

    expect(consoleMock.error).toHaveBeenCalledWith(
      expect.stringContaining("Failed to send node_response"),
    );
    expect(consoleMock.error).toHaveBeenCalledWith(
      expect.stringContaining("req-err"),
    );
  });
});
