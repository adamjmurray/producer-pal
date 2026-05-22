// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import Max from "max-api";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MAX_CHUNK_SIZE,
  MAX_CHUNKS,
  MAX_ERROR_DELIMITER,
} from "#src/shared/mcp-response-utils.ts";
import {
  clearNodeRoutes,
  handleNodeRequest,
  registerNodeRoute,
} from "./node-request-protocol.ts";

vi.mock(import("../node-for-max-logger.ts"), () => ({
  log: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

type ParsedNodeResponse = {
  success: boolean;
  result?: unknown;
  error?: string;
};

/**
 * Reassemble and parse the response JSON sent via the chunked Max.outlet call.
 *
 * @returns Parsed response object
 */
function parseSentResponse(): ParsedNodeResponse {
  const [name, , ...rest] = vi.mocked(Max.outlet).mock.calls[0] ?? [];

  expect(name).toBe("node_response");

  const delimiterIndex = rest.indexOf(MAX_ERROR_DELIMITER);

  expect(delimiterIndex).toBeGreaterThanOrEqual(0);

  const chunks = rest.slice(0, delimiterIndex) as string[];

  return JSON.parse(chunks.join("")) as ParsedNodeResponse;
}

describe("node-request-protocol", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    clearNodeRoutes();
    vi.useRealTimers();
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
      MAX_ERROR_DELIMITER,
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

  it("chunks oversized payloads across multiple outlet args", async () => {
    // Result that, once stringified, will exceed a single chunk
    const oversized = "x".repeat(MAX_CHUNK_SIZE * 2 + 50);

    registerNodeRoute("big", () => oversized);

    await handleNodeRequest(
      "req-big",
      JSON.stringify({ route: "big", args: {} }),
    );

    const call = vi.mocked(Max.outlet).mock.calls[0]!;

    expect(call[0]).toBe("node_response");
    expect(call[1]).toBe("req-big");

    const args = call.slice(2);
    const delimiterIndex = args.indexOf(MAX_ERROR_DELIMITER);

    expect(delimiterIndex).toBeGreaterThan(1);

    const response = parseSentResponse();

    expect(response.success).toBe(true);
    expect(response.result).toBe(oversized);
  });

  it("replaces too-large payloads with a single-chunk error response", async () => {
    // Construct a payload that exceeds MAX_CHUNKS * MAX_CHUNK_SIZE
    const overflow = "y".repeat(MAX_CHUNKS * MAX_CHUNK_SIZE + 1);

    registerNodeRoute("overflow", () => overflow);

    await handleNodeRequest(
      "req-overflow",
      JSON.stringify({ route: "overflow", args: {} }),
    );

    const response = parseSentResponse();

    expect(response.success).toBe(false);
    expect(response.error).toMatch(/Response too large/);
  });

  it("synthesizes a timeout failure when a handler hangs", async () => {
    vi.useFakeTimers();

    registerNodeRoute(
      "hang",
      () => new Promise(() => {}), // never resolves
    );

    const promise = handleNodeRequest(
      "req-hang",
      JSON.stringify({ route: "hang", args: {} }),
    );

    // Advance past the 15s handler timeout and let microtasks drain so the
    // rejection from Promise.race propagates into the catch + sendNodeResponse.
    await vi.advanceTimersByTimeAsync(15_000);
    await promise;

    const response = parseSentResponse();

    expect(response.success).toBe(false);
    expect(response.error).toMatch(/Route 'hang' timed out after 15000ms/);

    const consoleMock = await import("../node-for-max-logger.ts");

    expect(consoleMock.error).toHaveBeenCalledWith(
      expect.stringContaining("Route 'hang' timed out"),
    );
  });

  it("logs error when Max.outlet fails", async () => {
    const consoleMock = await import("../node-for-max-logger.ts");

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
