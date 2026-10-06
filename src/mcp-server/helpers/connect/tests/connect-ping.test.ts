// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  connectResponse,
  fakeInnerCall,
} from "#src/mcp-server/tests/config-dir-test-helpers.ts";
import { type RemoteScriptPing } from "#src/mcp-server/rpc/remote-script/remote-script-client.ts";
import { shareConnectPing } from "../connect-ping.ts";

const { remoteScriptPing } = vi.hoisted(() => ({
  remoteScriptPing: vi.fn<() => Promise<RemoteScriptPing>>(),
}));

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
  otherOnPort: null,
};

beforeEach(() => {
  remoteScriptPing.mockReset();
  remoteScriptPing.mockResolvedValue(PING);
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
