// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  connectResponse,
  fakeInnerCall,
} from "#src/mcp-server/tests/config-dir-test-helpers.ts";
import { type RemoteScriptPing } from "#src/mcp-server/rpc/remote-script/remote-script-client.ts";
import { currentRemoteScriptStatus } from "#src/mcp-server/rpc/remote-script/tests/remote-script-test-helpers.ts";
import { type RemoteScriptStatus } from "#src/mcp-server/rpc/remote-script/remote-script-status.ts";
import { shareConnectPing } from "../connect-ping.ts";

const { remoteScriptPing, remoteScriptStatus } = vi.hoisted(() => ({
  remoteScriptPing: vi.fn<() => Promise<RemoteScriptPing>>(),
  remoteScriptStatus: vi.fn<() => Promise<RemoteScriptStatus>>(),
}));

vi.mock(
  import("#src/mcp-server/rpc/remote-script/remote-script-status.ts"),
  () => ({ remoteScriptStatus }),
);

vi.mock(
  import("#src/mcp-server/rpc/remote-script/remote-script-client.ts"),
  () => ({
    remoteScriptPing,
  }),
);

const PING: RemoteScriptPing = {
  running: true,
  liveVersion: "12.4.0",
  scriptVersion: "2.4.0",
  scriptBuild: null,
  scriptCommit: null,
  userLibrary: null,
  otherOnPort: null,
};

beforeEach(() => {
  remoteScriptPing.mockReset();
  remoteScriptPing.mockResolvedValue(PING);
  remoteScriptStatus.mockReset();
  remoteScriptStatus.mockResolvedValue(currentRemoteScriptStatus());
});

afterEach(() => {
  vi.useRealTimers();
});

describe("shareConnectPing", () => {
  it("pings once however many callers ask during a connect", async () => {
    const shared = shareConnectPing(fakeInnerCall(connectResponse()));

    await shared.inner("ppal-connect", {});

    expect(await shared.getPing()).toBe(PING);
    expect(await shared.getPing()).toBe(PING);
    expect(remoteScriptPing).toHaveBeenCalledOnce();
  });

  it("pings again on the next connect", async () => {
    const shared = shareConnectPing(fakeInnerCall(connectResponse()));

    await shared.inner("ppal-connect", {});
    await shared.getPing();
    await shared.inner("ppal-connect", {});
    await shared.getPing();

    expect(remoteScriptPing).toHaveBeenCalledTimes(2);
  });

  it("keeps the ping across other tools", async () => {
    const shared = shareConnectPing(fakeInnerCall(connectResponse()));

    await shared.getPing();
    await shared.inner("ppal-read-live-set", {});
    await shared.getPing();

    expect(remoteScriptPing).toHaveBeenCalledOnce();
  });

  it("passes the call through to the inner one", async () => {
    const inner = fakeInnerCall(connectResponse());
    const overrides = { notation: "stark" as const };

    await shareConnectPing(inner).inner("ppal-connect", { a: 1 }, overrides);

    expect(inner).toHaveBeenCalledWith("ppal-connect", { a: 1 }, overrides);
  });
});

describe("shareConnectPing status", () => {
  it("reads the status once, from the shared ping, however many callers ask", async () => {
    const shared = shareConnectPing(fakeInnerCall(connectResponse()));

    await shared.inner("ppal-connect", {});

    const [first, second] = await Promise.all([
      shared.getStatus(),
      shared.getStatus(),
    ]);

    expect(first).toBe(second);
    expect(remoteScriptStatus).toHaveBeenCalledExactlyOnceWith(PING);
    expect(remoteScriptPing).toHaveBeenCalledOnce();
  });

  it("reads it again on the next connect", async () => {
    const shared = shareConnectPing(fakeInnerCall(connectResponse()));

    await shared.inner("ppal-connect", {});
    await shared.getStatus();
    await shared.inner("ppal-connect", {});
    await shared.getStatus();

    expect(remoteScriptStatus).toHaveBeenCalledTimes(2);
  });

  it("gives every caller the same failure when the read throws", async () => {
    const shared = shareConnectPing(fakeInnerCall(connectResponse()));

    remoteScriptStatus.mockRejectedValue(new Error("db locked"));

    await expect(shared.getStatus()).rejects.toThrow("db locked");
    await expect(shared.getStatus()).rejects.toThrow("db locked");
    expect(remoteScriptStatus).toHaveBeenCalledOnce();
  });

  it("fails when the ping throws", async () => {
    const shared = shareConnectPing(fakeInnerCall(connectResponse()));

    remoteScriptPing.mockRejectedValue(new Error("no"));

    await expect(shared.getStatus()).rejects.toThrow("no");
    expect(remoteScriptStatus).not.toHaveBeenCalled();
  });

  it("gives up, once for everyone, when the status takes too long", async () => {
    vi.useFakeTimers();
    remoteScriptStatus.mockReturnValue(new Promise(() => {}));

    const shared = shareConnectPing(fakeInnerCall(connectResponse()));
    const reads = Promise.allSettled([shared.getStatus(), shared.getStatus()]);

    await vi.advanceTimersByTimeAsync(2000);

    const results = await reads;

    expect(results.map((r) => r.status)).toStrictEqual([
      "rejected",
      "rejected",
    ]);
    expect(String((results[0] as PromiseRejectedResult).reason)).toContain(
      "timed out",
    );
    expect(remoteScriptStatus).toHaveBeenCalledOnce();
  });
});
