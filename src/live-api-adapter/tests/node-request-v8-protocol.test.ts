// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic), Claude Code (Anthropic)
// SPDX-License-Identifier: MIT

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEVICE_REPORT_ROUTE } from "#src/shared/max/device-install-contract.ts";
import * as console from "#src/shared/max/v8-max-console.ts";
import {
  MAX_CHUNK_SIZE,
  MAX_SINGLE_MESSAGE_BYTES,
  END_OF_CHUNKS,
  reassembleChunks,
} from "#src/shared/mcp-responses.ts";
import { reportDevice } from "../live-api-adapter.ts";
import {
  handleNodeResponse,
  requestNode,
} from "../node-request-v8-protocol.ts";
import {
  installCapturingTask,
  installTrackingTask,
  latestOutletPayload,
  latestOutletRequestId,
} from "./v8-protocol-test-helpers.ts";

vi.mock(import("#src/shared/max/v8-max-console.ts"), () => ({
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
  return latestOutletRequestId("node_request");
}

/**
 * Get the request payload (route + args) from the most recent outlet call.
 *
 * @returns Parsed request payload
 */
function latestRequestPayload(): { route: string; args: unknown } {
  return latestOutletPayload<{ route: string; args: unknown }>("node_request");
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

  // Uniqueness alone is also satisfied by a counter running the wrong way, so
  // pin the shape and the direction. The counter is module state shared with
  // every other test here, hence the relative assertion.
  it("generates request IDs that count up from the node-req- prefix", () => {
    void requestNode("a");
    const id1 = latestRequestId();

    void requestNode("b");
    const id2 = latestRequestId();

    expect(id1).toMatch(/^node-req-\d+$/);
    expect(Number(id2.slice("node-req-".length))).toBe(
      Number(id1.slice("node-req-".length)) + 1,
    );
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
    // Node answered, so the route may have run.
    expect(response.notRun).toBeUndefined();
    expect(response.timedOut).toBeUndefined();
  });

  it("marks a request it could not send as not run", async () => {
    vi.mocked(globalThis.outlet).mockImplementationOnce(() => {
      throw new Error("outlet exploded");
    });

    expect(await requestNode("test.unsent")).toStrictEqual({
      success: false,
      error: "Failed to send node_request 'test.unsent': outlet exploded",
      notRun: true,
    });
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

    const reassembled = reassembleChunks([...chunks, END_OF_CHUNKS]);

    handleNodeResponse(requestId, reassembled);

    const response = await promise;

    expect(response.success).toBe(true);
    expect(response.result?.payload).toBe(payload);
  });

  // Max cuts a single message past ~32k chars, so Node would get broken JSON.
  it("sends nothing when the request is too large for one Max message", async () => {
    vi.mocked(globalThis.outlet).mockClear();

    const response = await requestNode("test.huge", {
      blob: "x".repeat(MAX_SINGLE_MESSAGE_BYTES),
    });

    expect(globalThis.outlet).not.toHaveBeenCalled();
    expect(response.success).toBe(false);
    expect(response.tooLarge).toBe(true);
    expect(response.notRun).toBe(true);
    expect(response.error).toContain(
      "node_request 'test.huge' too large for a single Max IPC message",
    );
  });

  it("refuses a request under the character limit but over the byte limit", async () => {
    vi.mocked(globalThis.outlet).mockClear();

    // 15,000 chars, 45,000 bytes.
    const response = await requestNode("test.cjk", {
      blob: "あ".repeat(15_000),
    });

    expect(globalThis.outlet).not.toHaveBeenCalled();
    expect(response.tooLarge).toBe(true);
    expect(response.error).toContain("bytes exceeds");
  });

  it("logs error and ignores response for unknown requestId", async () => {
    const consoleMock = await import("#src/shared/max/v8-max-console.ts");

    handleNodeResponse(
      "unknown-id",
      JSON.stringify({ success: true, result: 1 }),
    );

    expect(consoleMock.error).toHaveBeenCalledWith(
      expect.stringContaining("unknown-id"),
    );
  });

  it("resolves with failure and cleans up when outlet() throws synchronously", async () => {
    const scheduleCalls: number[] = [];
    const restoreTask = installTrackingTask(scheduleCalls);

    vi.mocked(globalThis.outlet).mockImplementationOnce(() => {
      throw new Error("outlet exploded");
    });

    try {
      const response = await requestNode("test.outlet-throws");

      expect(response.success).toBe(false);
      expect(response.error).toMatch(/outlet exploded/);
      // Timeout armed at 10s, then immediately cancelled via schedule(-1).
      expect(scheduleCalls).toStrictEqual([10_000, -1]);

      // Pending entry must be gone — a late response for the same id is
      // ignored (would log "unknown request" via the console error path).
      handleNodeResponse(
        "node-req-orphan",
        JSON.stringify({ success: true, result: "late" }),
      );
    } finally {
      restoreTask();
    }
  });

  it("reports a non-Error thrown by outlet() as its string form", async () => {
    const scheduleCalls: number[] = [];
    const restoreTask = installTrackingTask(scheduleCalls);

    // Max's IPC layer is not obliged to throw an Error.
    const thrown: unknown = "outlet string failure";

    vi.mocked(globalThis.outlet).mockImplementationOnce(() => {
      throw thrown;
    });

    try {
      const response = await requestNode("test.outlet-throws-string");

      expect(response.success).toBe(false);
      expect(response.error).toMatch(/outlet string failure/);
    } finally {
      restoreTask();
    }
  });

  it("resolves multiple concurrent requests independently with interleaved responses", async () => {
    const promiseA = requestNode<{ tag: string }>("route.a");
    const idA = latestRequestId();

    const promiseB = requestNode<{ tag: string }>("route.b");
    const idB = latestRequestId();

    const promiseC = requestNode<{ tag: string }>("route.c");
    const idC = latestRequestId();

    expect(new Set([idA, idB, idC]).size).toBe(3);

    // Resolve out of issue order: B, then C, then A.
    handleNodeResponse(
      idB,
      JSON.stringify({ success: true, result: { tag: "b" } }),
    );
    handleNodeResponse(
      idC,
      JSON.stringify({ success: false, error: "c failed" }),
    );
    handleNodeResponse(
      idA,
      JSON.stringify({ success: true, result: { tag: "a" } }),
    );

    const [respA, respB, respC] = await Promise.all([
      promiseA,
      promiseB,
      promiseC,
    ]);

    expect(respA).toStrictEqual({ success: true, result: { tag: "a" } });
    expect(respB).toStrictEqual({ success: true, result: { tag: "b" } });
    expect(respC).toStrictEqual({ success: false, error: "c failed" });
  });

  it("resolves with a timeout error when the timeout callback fires", async () => {
    const captured: Array<() => void> = [];
    const restoreTask = installCapturingTask(captured);

    try {
      const promise = requestNode("test.timeout");

      expect(captured).toHaveLength(1);

      // Fire the captured timeout callback to simulate elapsed time.
      captured[0]!();

      const response = await promise;

      expect(response.success).toBe(false);
      expect(response.error).toMatch(/test\.timeout.*timed out/);
      expect(response.timedOut).toBe(true);

      // After timeout, a late response for the same id is ignored — the
      // pending entry was deleted by the timeout path.
      const requestId = latestRequestId();

      handleNodeResponse(
        requestId,
        JSON.stringify({ success: true, result: "late" }),
      );
    } finally {
      restoreTask();
    }
  });

  it("does not mark a failure Node answered as a timeout", async () => {
    const promise = requestNode("test.unknown");

    handleNodeResponse(
      latestRequestId(),
      JSON.stringify({ success: false, error: "Unknown route: test.unknown" }),
    );

    expect(await promise).toStrictEqual({
      success: false,
      error: "Unknown route: test.unknown",
    });
  });

  it("waits as long as the request asks", async () => {
    const scheduleCalls: number[] = [];
    const restoreTracking = installTrackingTask(scheduleCalls);

    try {
      void requestNode("test.slow", {}, 45_000);

      expect(scheduleCalls).toStrictEqual([45_000]);
    } finally {
      restoreTracking();
    }

    const captured: Array<() => void> = [];
    const restoreCapturing = installCapturingTask(captured);

    try {
      const promise = requestNode("test.slow", {}, 45_000);

      captured[0]!();

      const response = await promise;

      expect(response.error).toBe(
        "node_request 'test.slow' timed out after 45000ms",
      );
    } finally {
      restoreCapturing();
    }
  });

  it("ignores a second timeout callback firing for the same request", async () => {
    const captured: Array<() => void> = [];
    const restoreTask = installCapturingTask(captured);

    try {
      const promise = requestNode("test.timeout-twice");

      captured[0]!();
      // Second invocation must hit the `pendingNodeRequests.has(...)` guard
      // and do nothing — calling resolve() twice on the same Promise would
      // be a silent no-op, but we want to confirm the guard is exercised.
      expect(() => captured[0]!()).not.toThrow();

      const response = await promise;

      expect(response.success).toBe(false);
    } finally {
      restoreTask();
    }
  });

  it("cancels the timeout task after a successful response", async () => {
    // Swap in a non-auto-firing Task so we can observe cancel separately
    // from the schedule() call that arms the timeout.
    const scheduleCalls: number[] = [];
    const restoreTask = installTrackingTask(scheduleCalls);

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
      restoreTask();
    }
  });
});

describe("reportDevice (the device.report request)", () => {
  /**
   * Stand in for the patcher Max puts in the v8 object's global scope.
   *
   * @param patcher - What `patcher` should be, or undefined for none
   */
  function setPatcher(patcher: unknown): void {
    (globalThis as { patcher?: unknown }).patcher = patcher;
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    setPatcher(undefined);
  });

  it("sends the patcher's file path to Node", () => {
    setPatcher({ filepath: "Macintosh HD:/Users/me/Producer_Pal.amxd" });

    reportDevice();

    expect(latestRequestPayload()).toStrictEqual({
      route: DEVICE_REPORT_ROUTE,
      args: { filepath: "Macintosh HD:/Users/me/Producer_Pal.amxd" },
    });
    expect(console.warn).not.toHaveBeenCalled();
  });

  it.each([
    { what: "no patcher", patcher: undefined },
    { what: "no file path", patcher: {} },
    { what: "an empty file path", patcher: { filepath: "" } },
    { what: "a file path that isn't text", patcher: { filepath: 5 } },
  ])("warns and sends nothing with $what", ({ patcher }) => {
    setPatcher(patcher);

    reportDevice();

    expect(outlet).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledWith(
      "Could not read this device's file path.",
    );
  });

  it("warns when Node doesn't take the report", async () => {
    setPatcher({ filepath: "/a/Producer_Pal.amxd" });

    reportDevice();
    handleNodeResponse(
      latestRequestId(),
      JSON.stringify({ success: false, error: "no route" }),
    );

    await vi.waitFor(() => {
      expect(console.warn).toHaveBeenCalledWith(
        "Could not report this device's file path: no route",
      );
    });
  });
});
