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

const ADDS =
  "It adds clip automation, loading plug-ins, Max for Live devices and presets, audio-to-MIDI conversion, and undo/redo with one undo step per tool call.";

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
  userLibrary: null,
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
 * @param manage - Whether the caller can use ppal-manage
 * @returns The response content blocks
 */
async function connectThrough(
  getPing: () => Promise<RemoteScriptPing> = () => Promise.resolve(PING),
  manage = true,
): Promise<Array<{ text?: string }>> {
  const result = await withRemoteScriptNotice(
    fakeInnerCall(connectResponse()),
    getPing,
    () => manage,
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

const INSTALL = 'ppal-manage action "install-remote-script"';

describe("withRemoteScriptNotice", () => {
  it("tells the model to reinstall an installed script older than this build", async () => {
    remoteScriptStatus.mockResolvedValue(
      status({ installedVersion: "2.3.0", updateAvailable: true }),
    );

    const content = await connectThrough();

    expect(content).toHaveLength(2);
    expect(content[1]?.text).toBe(
      `remoteScript: v2.3.0 is installed, but this device ships v${VERSION}. ` +
        `To update it, call ${INSTALL}, then tell the user to restart Live.`,
    );
  });

  it("points at the Chat UI to update when ppal-manage is unavailable", async () => {
    remoteScriptStatus.mockResolvedValue(
      status({ installedVersion: "2.3.0", updateAvailable: true }),
    );

    const content = await connectThrough(undefined, false);

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

  it("tells the model how to install a script that isn't installed", async () => {
    remoteScriptStatus.mockResolvedValue(
      status({
        installed: false,
        installedVersion: null,
        running: false,
        runningVersion: null,
      }),
    );

    const content = await connectThrough();

    expect(content[1]?.text).toBe(
      `remoteScript: not installed. ${ADDS} To install it, call ${INSTALL}, then tell the user to restart Live.`,
    );
  });

  it("points at the Chat UI to install when ppal-manage is unavailable", async () => {
    remoteScriptStatus.mockResolvedValue(
      status({
        installed: false,
        installedVersion: null,
        running: false,
        runningVersion: null,
      }),
    );

    const content = await connectThrough(undefined, false);

    expect(content[1]?.text).toBe(
      `remoteScript: not installed. ${ADDS} Tell the user to install it (Chat UI > Settings > Remote Script > Install), then restart Live.`,
    );
  });

  it("only gives the version when a copy Live runs isn't found installed", async () => {
    remoteScriptStatus.mockResolvedValue(
      status({ installed: false, installedVersion: null }),
    );

    const content = await connectThrough();

    expect(content[1]?.text).toBe(`remoteScript: v${VERSION} running`);
  });

  it("says the script isn't running without suggesting a reinstall", async () => {
    remoteScriptStatus.mockResolvedValue(
      status({ running: false, runningVersion: null }),
    );

    for (const manage of [true, false]) {
      const content = await connectThrough(undefined, manage);

      expect(content[1]?.text).toBe(
        `remoteScript: v${VERSION} is installed but not running. ${ADDS} Tell the user to choose Producer Pal as a Control Surface in Live's Settings → Link, Tempo & MIDI, or restart Live. Reinstalling won't help.`,
      );
    }
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

  it("gives just the version when the script is current and running", async () => {
    remoteScriptStatus.mockResolvedValue(status());

    const content = await connectThrough();

    expect(content).toHaveLength(2);
    expect(content[1]?.text).toBe(`remoteScript: v${VERSION} running`);
  });

  it("says only that it is running when the running version is unknown", async () => {
    remoteScriptStatus.mockResolvedValue(status({ runningVersion: null }));

    const content = await connectThrough();

    expect(content[1]?.text).toBe("remoteScript: running");
  });

  it("names the port when another program answers on it", async () => {
    remoteScriptStatus.mockResolvedValue(
      status({
        running: false,
        runningVersion: null,
        otherOnPort: 3349,
        installedVersion: "2.3.0",
        updateAvailable: true,
      }),
    );

    const content = await connectThrough();

    expect(content[1]?.text).toBe(
      "remoteScript: not running; another program answers on port 3349.",
    );
  });

  it("adds nothing when installed newer than this build and running", async () => {
    remoteScriptStatus.mockResolvedValue(
      status({
        installedVersion: "999.0.0",
        runningVersion: "999.0.0",
        installedNewer: true,
      }),
    );

    const content = await connectThrough();

    expect(content[1]?.text).toBe("remoteScript: v999.0.0 running");
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
      () => true,
    )("ppal-read-live-set", {});

    expect(result.content).toHaveLength(1);
    expect(remoteScriptStatus).not.toHaveBeenCalled();
  });
});
