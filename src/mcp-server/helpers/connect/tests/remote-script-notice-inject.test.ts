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
import { type RemoteScriptStatus } from "#src/mcp-server/rpc/remote-script/remote-script-status.ts";
import { VERSION } from "#src/shared/config.ts";
import { withRemoteScriptNotice } from "../remote-script-notice-inject.ts";

const { remoteScriptStatus, warn } = vi.hoisted(() => ({
  remoteScriptStatus: vi.fn<() => Promise<RemoteScriptStatus>>(),
  warn: vi.fn(),
}));

vi.mock(
  import("#src/mcp-server/rpc/remote-script/remote-script-status.ts"),
  () => ({
    remoteScriptStatus,
  }),
);

vi.mock(import("#src/mcp-server/node-for-max-logger.ts"), () => ({
  warn,
  log: vi.fn(),
  info: vi.fn(),
  error: vi.fn(),
}));

const PING: RemoteScriptPing = {
  running: true,
  liveVersion: "12.4.0",
  scriptVersion: "2.3.0",
  otherOnPort: null,
};

/**
 * A status for an installed, current script that Live is running.
 * @param overrides - Fields to change
 * @returns The status
 */
function status(
  overrides: Partial<RemoteScriptStatus> = {},
): RemoteScriptStatus {
  return {
    userLibrary: "/lib",
    installed: true,
    installedVersion: VERSION,
    bundledVersion: VERSION,
    running: true,
    runningVersion: VERSION,
    liveVersion: "12.4.0",
    otherOnPort: null,
    updateAvailable: false,
    installedNewer: false,
    ...overrides,
  };
}

/**
 * Run withRemoteScriptNotice over a ppal-connect call.
 * @param getPing - Reads the ping
 * @returns The response content blocks
 */
async function connectThrough(
  getPing: () => Promise<RemoteScriptPing> = () => Promise.resolve(PING),
): Promise<Array<{ text?: string }>> {
  const result = await withRemoteScriptNotice(
    fakeInnerCall(connectResponse()),
    getPing,
  )("ppal-connect", {});

  return result.content;
}

beforeEach(() => {
  remoteScriptStatus.mockReset();
  warn.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("withRemoteScriptNotice", () => {
  it("tells the user to update an installed script older than this build", async () => {
    remoteScriptStatus.mockResolvedValue(
      status({ installedVersion: "2.3.0", updateAvailable: true }),
    );

    const content = await connectThrough();

    expect(content).toHaveLength(2);
    expect(content[1]?.text).toBe(
      `remoteScript: v2.3.0 is installed, but this device ships v${VERSION}. ` +
        "Tell the user to update it (Chat UI > Settings > Remote Script > Update), then restart Live.",
    );
  });

  it("says so when the installed version can't be read", async () => {
    remoteScriptStatus.mockResolvedValue(
      status({ installedVersion: null, updateAvailable: true }),
    );

    const content = await connectThrough();

    expect(content[1]?.text).toContain(
      "remoteScript: an unknown version is installed",
    );
  });

  it("tells the user to restart Live when it runs an older copy than the installed one", async () => {
    remoteScriptStatus.mockResolvedValue(status({ runningVersion: "2.3.0" }));

    const content = await connectThrough();

    expect(content[1]?.text).toBe(
      `remoteScript: Live is running v2.3.0, but v${VERSION} is installed. Tell the user to restart Live.`,
    );
  });

  it("tells the user to restart Live when it runs a newer copy than the installed one", async () => {
    remoteScriptStatus.mockResolvedValue(status({ runningVersion: "999.0.0" }));

    const content = await connectThrough();

    expect(content[1]?.text).toBe(
      `remoteScript: Live is running v999.0.0, but v${VERSION} is installed. Tell the user to restart Live.`,
    );
  });

  it("hands the ping it was given to the status read", async () => {
    remoteScriptStatus.mockResolvedValue(status());

    await connectThrough();

    expect(remoteScriptStatus).toHaveBeenCalledExactlyOnceWith(PING);
  });

  it("adds nothing when the script is current", async () => {
    remoteScriptStatus.mockResolvedValue(status());

    expect(await connectThrough()).toHaveLength(1);
  });

  it("adds nothing when the script is not installed", async () => {
    remoteScriptStatus.mockResolvedValue(
      status({ installed: false, installedVersion: null }),
    );

    expect(await connectThrough()).toHaveLength(1);
  });

  it("adds nothing when another program answers on the port", async () => {
    remoteScriptStatus.mockResolvedValue(
      status({
        running: false,
        runningVersion: null,
        otherOnPort: 3349,
        installedVersion: "2.3.0",
        updateAvailable: true,
      }),
    );

    expect(await connectThrough()).toHaveLength(1);
  });

  it("still connects, with no line, when reading the status throws", async () => {
    remoteScriptStatus.mockRejectedValue(new Error("db locked"));

    expect(await connectThrough()).toHaveLength(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("db locked"));
  });

  it("still connects, with no line, when the ping throws", async () => {
    const content = await connectThrough(() => Promise.reject(new Error("no")));

    expect(content).toHaveLength(1);
    expect(remoteScriptStatus).not.toHaveBeenCalled();
  });

  it("still connects, with no line, when the status takes too long", async () => {
    vi.useFakeTimers();
    remoteScriptStatus.mockReturnValue(new Promise(() => {}));

    const pending = connectThrough();

    await vi.advanceTimersByTimeAsync(2000);

    expect(await pending).toHaveLength(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("timed out"));
  });

  it("leaves other tools alone", async () => {
    remoteScriptStatus.mockResolvedValue(status({ runningVersion: "2.3.0" }));

    const result = await withRemoteScriptNotice(
      fakeInnerCall(connectResponse()),
      () => Promise.resolve(PING),
    )("ppal-read-live-set", {});

    expect(result.content).toHaveLength(1);
    expect(remoteScriptStatus).not.toHaveBeenCalled();
  });
});
