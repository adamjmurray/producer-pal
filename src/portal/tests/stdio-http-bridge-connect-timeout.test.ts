// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// Add and update give their connect a time limit; tool calls keep the default.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StdioHttpBridge } from "../stdio-http-bridge.ts";
import {
  mockClient,
  mockTransport,
  type TestBridge,
} from "./stdio-http-bridge-test-helpers.ts";

/**
 * A stand-in for a module with only the exports the code under test reads.
 * Typed `never` so it fits any module's `vi.mock` factory. A function
 * declaration, so it exists when the hoisted factories run.
 * @param exports - The exports to supply
 * @returns The same object
 */
function partialModule(exports: object): never {
  return exports as never;
}

vi.mock(import("@modelcontextprotocol/sdk/client/index.js"), () =>
  partialModule({
    Client: vi.fn(function () {
      return mockClient;
    }),
  }),
);

vi.mock(import("@modelcontextprotocol/sdk/client/streamableHttp.js"), () =>
  partialModule({
    StreamableHTTPClientTransport: vi.fn(function () {
      return mockTransport;
    }),
  }),
);

/**
 * The next connect never answers until the client is closed.
 * @param closeFails - Whether every close rejects as well (the timer's and the
 *   failed connect's own)
 */
function hangUntilClosed(closeFails = false): void {
  let release: (error: Error) => void = () => {};

  mockClient.connect.mockImplementationOnce(
    () => new Promise<void>((_resolve, reject) => (release = reject)),
  );
  mockClient.close.mockImplementation(() => {
    release(new Error("Connection closed"));

    return closeFails
      ? Promise.reject(new Error("close failed"))
      : Promise.resolve();
  });
}

describe("StdioHttpBridge connect time limit", () => {
  let bridge: TestBridge;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mockClient.connect.mockReset();
    mockClient.close.mockReset();
    mockClient.connect.mockResolvedValue(undefined);
    mockClient.close.mockResolvedValue(undefined);
    bridge = new StdioHttpBridge(
      "http://localhost:3350/mcp",
    ) as unknown as TestBridge;
  });

  afterEach(() => {
    // Drop anything a failed test left queued
    mockClient.connect.mockReset();
    mockClient.close.mockReset();
    vi.useRealTimers();
  });

  it("leaves the SDK's default timeout alone when no limit is given", async () => {
    await bridge._ensureHttpConnection();

    expect(mockClient.connect).toHaveBeenCalledWith(mockTransport);
  });

  it("passes the limit to the client's initialize request", async () => {
    await bridge._ensureHttpConnection(5000);

    expect(mockClient.connect).toHaveBeenCalledWith(mockTransport, {
      timeout: 5000,
    });
    expect(bridge.isConnected).toBe(true);
  });

  it("closes a connect that is still stuck when the limit passes, then connects again cleanly", async () => {
    hangUntilClosed();

    const first = bridge._ensureHttpConnection(5000).catch((e: unknown) => e);

    await vi.advanceTimersByTimeAsync(5000);

    expect(String(await first)).toContain("Failed to connect");

    expect(bridge.isConnected).toBe(false);
    expect(bridge.httpClient).toBeNull();

    await bridge._ensureHttpConnection(5000);

    expect(bridge.isConnected).toBe(true);
    expect(mockClient.connect).toHaveBeenCalledTimes(2);
  });

  it("still fails, and can connect again, when every close of the stuck client fails", async () => {
    hangUntilClosed(true);

    const first = bridge._ensureHttpConnection(5000).catch((e: unknown) => e);

    await vi.advanceTimersByTimeAsync(5000);

    expect(String(await first)).toContain("Failed to connect");
    expect(bridge.httpClient).toBeNull();
    expect(mockClient.close).toHaveBeenCalledTimes(2);

    await bridge._ensureHttpConnection(5000);

    expect(bridge.isConnected).toBe(true);
  });

  it("stops a caller that joins a longer connect at its own limit, without cutting that connect short", async () => {
    let finish: () => void = () => {};

    mockClient.connect.mockImplementationOnce(
      () => new Promise<void>((resolve) => (finish = resolve)),
    );

    const first = bridge._ensureHttpConnection();
    const joiner = bridge._ensureHttpConnection(2000);
    const timedOut = joiner.catch((e: unknown) => e);

    await vi.advanceTimersByTimeAsync(2000);

    expect(String(await timedOut)).toContain("Timed out after 2000 ms");

    expect(bridge.isConnected).toBe(false);

    finish();
    await first;

    expect(bridge.isConnected).toBe(true);
    expect(mockClient.connect).toHaveBeenCalledTimes(1);
  });

  it("lets a joiner share the connect when it finishes in time", async () => {
    let finish: () => void = () => {};

    mockClient.connect.mockImplementationOnce(
      () => new Promise<void>((resolve) => (finish = resolve)),
    );

    const first = bridge._ensureHttpConnection();
    const joiner = bridge._ensureHttpConnection(2000);

    finish();
    await Promise.all([first, joiner]);

    expect(mockClient.connect).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
