// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  MAX_CHUNK_SIZE,
  MAX_ERROR_DELIMITER,
  reassembleChunks,
} from "#src/shared/mcp-response-utils.ts";
import {
  handleNodeResponse,
  requestNode,
} from "../node-request-v8-protocol.ts";

vi.mock(import("#src/shared/v8-max-console.ts"), () => ({
  log: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

/**
 * Get the requestId from the most recent outlet call.
 *
 * @returns The requestId from the latest node_request outlet call
 */
function latestRequestId(): string {
  const outletMock = vi.mocked(globalThis.outlet);
  const call = outletMock.mock.calls.at(-1);

  expect(call?.[0]).toBe(0);
  expect(call?.[1]).toBe("node_request");

  return call?.[2] as string;
}

/**
 * Get the request payload (route + args) from the most recent outlet call.
 *
 * @returns Parsed request payload
 */
function latestRequestPayload(): { route: string; args: unknown } {
  const outletMock = vi.mocked(globalThis.outlet);
  const call = outletMock.mock.calls.at(-1);
  const json = call?.[3] as string;

  return JSON.parse(json) as { route: string; args: unknown };
}

describe("node-request-v8-protocol", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends a node_request outlet message with route and args", () => {
    void requestNode("test.route", { foo: "bar" });

    const payload = latestRequestPayload();

    expect(payload.route).toBe("test.route");
    expect(payload.args).toStrictEqual({ foo: "bar" });
  });

  it("defaults args to an empty object", () => {
    void requestNode("test.no-args");

    const payload = latestRequestPayload();

    expect(payload.args).toStrictEqual({});
  });

  it("generates unique request IDs", () => {
    void requestNode("a");
    const id1 = latestRequestId();

    void requestNode("b");
    const id2 = latestRequestId();

    expect(id1).not.toBe(id2);
  });

  it("resolves the promise when handleNodeResponse is called", async () => {
    const promise = requestNode<{ value: number }>("test.success");
    const requestId = latestRequestId();

    handleNodeResponse(
      requestId,
      JSON.stringify({ success: true, result: { value: 42 } }),
    );

    const response = await promise;

    expect(response.success).toBe(true);
    expect(response.result).toStrictEqual({ value: 42 });
  });

  it("resolves with failure when response indicates failure", async () => {
    const promise = requestNode("test.failure");
    const requestId = latestRequestId();

    handleNodeResponse(
      requestId,
      JSON.stringify({ success: false, error: "route blew up" }),
    );

    const response = await promise;

    expect(response.success).toBe(false);
    expect(response.error).toBe("route blew up");
  });

  it("resolves with parse-failure for invalid response JSON", async () => {
    const promise = requestNode("test.bad-json");
    const requestId = latestRequestId();

    handleNodeResponse(requestId, "not json {");

    const response = await promise;

    expect(response.success).toBe(false);
    expect(response.error).toContain("Failed to parse node_response");
  });

  it("reassembles chunked responses produced by the Node sender", async () => {
    const promise = requestNode<{ payload: string }>("test.big");
    const requestId = latestRequestId();

    // Build a response larger than a single chunk to verify reassembly
    const payload = "z".repeat(MAX_CHUNK_SIZE * 2 + 5);
    const responseJson = JSON.stringify({
      success: true,
      result: { payload },
    });

    // Simulate Max IPC: receive chunks + delimiter + run them through the
    // reassembler before handleNodeResponse, the way the live-api-adapter
    // node_response() entry point does.
    const chunks: string[] = [];

    for (let i = 0; i < responseJson.length; i += MAX_CHUNK_SIZE) {
      chunks.push(responseJson.slice(i, i + MAX_CHUNK_SIZE));
    }

    expect(chunks.length).toBeGreaterThan(1);

    const reassembled = reassembleChunks([...chunks, MAX_ERROR_DELIMITER]);

    handleNodeResponse(requestId, reassembled);

    const response = await promise;

    expect(response.success).toBe(true);
    expect(response.result?.payload).toBe(payload);
  });

  it("logs error and ignores response for unknown requestId", async () => {
    const consoleMock = await import("#src/shared/v8-max-console.ts");

    handleNodeResponse(
      "unknown-id",
      JSON.stringify({ success: true, result: 1 }),
    );

    expect(consoleMock.error).toHaveBeenCalledWith(
      expect.stringContaining("unknown-id"),
    );
  });

  it("cancels the timeout task after a successful response", async () => {
    // Swap in a non-auto-firing Task so we can observe cancel separately
    // from the schedule() call that arms the timeout.
    type ScheduleSpy = (ms: number) => void;
    const scheduleCalls: number[] = [];

    class TrackingTask {
      schedule: ScheduleSpy;

      constructor(_callback: () => void) {
        this.schedule = (ms: number): void => {
          scheduleCalls.push(ms);
        };
      }
    }

    const g = globalThis as Record<string, unknown>;
    const originalTask = g.Task;

    g.Task = TrackingTask;

    try {
      const promise = requestNode("test.cancel");
      const requestId = latestRequestId();

      // First schedule() call arms the timeout with a positive ms value.
      expect(scheduleCalls).toStrictEqual([10_000]);

      handleNodeResponse(
        requestId,
        JSON.stringify({ success: true, result: "ok" }),
      );

      // cancel() is implemented as schedule(-1), so a successful response
      // must produce a second schedule call with a negative value.
      expect(scheduleCalls).toStrictEqual([10_000, -1]);

      const response = await promise;

      expect(response.success).toBe(true);
    } finally {
      g.Task = originalTask;
    }
  });
});
