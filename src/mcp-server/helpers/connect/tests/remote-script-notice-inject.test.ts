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
import { currentRemoteScriptStatus } from "#src/mcp-server/rpc/remote-script/tests/remote-script-test-helpers.ts";
import { type RemoteScriptStatus } from "#src/mcp-server/rpc/remote-script/remote-script-status.ts";
import { VERSION } from "#src/shared/config.ts";
import { AFTER_RESTART_CHECK } from "#src/shared/version-check.ts";
import { withRemoteScriptNotice } from "../remote-script-notice-inject.ts";

const ADDS =
  "It adds clip automation, loading plug-ins, Max for Live devices and presets, audio-to-MIDI conversion, and undo/redo with one undo step per tool call.";

const { remoteScriptStatus, warn } = vi.hoisted(() => ({
  remoteScriptStatus:
    vi.fn<(ping?: RemoteScriptPing) => Promise<RemoteScriptStatus>>(),
  warn: vi.fn(),
}));

vi.mock(
  import("#src/mcp-server/rpc/remote-script/remote-script-status.ts"),
  () => ({
    remoteScriptStatus,
  }),
);

vi.mock(import("#src/mcp-server/node-for-max-logger.ts"), () => ({
  nodeWarn: warn,
  nodeLog: vi.fn(),
  nodeInfo: vi.fn(),
  nodeError: vi.fn(),
}));

const PING: RemoteScriptPing = {
  running: true,
  liveVersion: "12.4.0",
  scriptVersion: "2.3.0",
  scriptBuild: null,
  scriptCommit: null,
  userLibrary: null,
  otherOnPort: null,
};

/**
 * Run withRemoteScriptNotice over a ppal-connect call.
 * @param getStatus - Reads the status
 * @param manage - Whether the caller can use ppal-manage
 * @param smallModel - Whether the caller is in small-model mode
 * @returns The response content blocks
 */
async function connectThrough(
  getStatus: () => Promise<RemoteScriptStatus> = () => remoteScriptStatus(PING),
  manage = true,
  smallModel = false,
): Promise<Array<{ text?: string }>> {
  const result = await withRemoteScriptNotice(
    fakeInnerCall(connectResponse()),
    getStatus,
    () => ({ manage, smallModel }),
  )("ppal-connect", {});

  return result.content;
}

beforeEach(() => {
  remoteScriptStatus.mockReset();
  warn.mockReset();
});

const INSTALL = 'ppal-manage action "install-producer-pal"';
const ENABLE_IN_LIVE =
  "restart Live, then choose Producer Pal as a Control Surface in Settings → Tempo & MIDI, with Input and Output left as None";

describe("withRemoteScriptNotice", () => {
  it("tells the model to reinstall an installed script older than this build", async () => {
    remoteScriptStatus.mockResolvedValue(
      currentRemoteScriptStatus({
        installedVersion: "2.3.0",
        updateAvailable: true,
      }),
    );

    const content = await connectThrough();

    expect(content).toHaveLength(2);
    expect(content[1]?.text).toBe(
      `remoteScript: v2.3.0 is installed, but this device ships v${VERSION}. ` +
        `To update it, call ${INSTALL}, then tell the user to restart Live. ${AFTER_RESTART_CHECK}`,
    );
  });

  it("calls it a different build when the installed version is this one", async () => {
    remoteScriptStatus.mockResolvedValue(
      currentRemoteScriptStatus({ updateAvailable: true }),
    );

    const content = await connectThrough();

    expect(content[1]?.text).toBe(
      `remoteScript: the installed v${VERSION} is a different build than this device ships. ` +
        `To update it, call ${INSTALL}, then tell the user to restart Live. ${AFTER_RESTART_CHECK}`,
    );
  });

  it("points at the Chat UI to update when ppal-manage is unavailable", async () => {
    remoteScriptStatus.mockResolvedValue(
      currentRemoteScriptStatus({
        installedVersion: "2.3.0",
        updateAvailable: true,
      }),
    );

    const content = await connectThrough(undefined, false);

    expect(content[1]?.text).toBe(
      `remoteScript: v2.3.0 is installed, but this device ships v${VERSION}. ` +
        "Tell the user to update it (Chat UI > Settings > Installation > Update), then restart Live. " +
        AFTER_RESTART_CHECK,
    );
  });

  it("says so when the installed version can't be read", async () => {
    remoteScriptStatus.mockResolvedValue(
      currentRemoteScriptStatus({
        installedVersion: null,
        updateAvailable: true,
      }),
    );

    const content = await connectThrough();

    expect(content[1]?.text).toContain(
      "remoteScript: an unknown version is installed",
    );
  });

  it("tells the model how to install a script that isn't installed", async () => {
    remoteScriptStatus.mockResolvedValue(
      currentRemoteScriptStatus({
        installed: false,
        installedVersion: null,
        running: false,
        runningVersion: null,
      }),
    );

    const content = await connectThrough();

    expect(content[1]?.text).toBe(
      `remoteScript: not installed. ${ADDS} To install it, call ${INSTALL}, then tell the user to ${ENABLE_IN_LIVE}.`,
    );
  });

  it("points at the Chat UI to install when ppal-manage is unavailable", async () => {
    remoteScriptStatus.mockResolvedValue(
      currentRemoteScriptStatus({
        installed: false,
        installedVersion: null,
        running: false,
        runningVersion: null,
      }),
    );

    const content = await connectThrough(undefined, false);

    expect(content[1]?.text).toBe(
      `remoteScript: not installed. ${ADDS} Tell the user to install it (Chat UI > Settings > Installation > Install), then ${ENABLE_IN_LIVE}.`,
    );
  });

  it("only gives the version when a copy Live runs isn't found installed", async () => {
    remoteScriptStatus.mockResolvedValue(
      currentRemoteScriptStatus({ installed: false, installedVersion: null }),
    );

    const content = await connectThrough();

    expect(content[1]?.text).toBe(`remoteScript: v${VERSION} running`);
  });

  it("says the script isn't running without suggesting a reinstall", async () => {
    remoteScriptStatus.mockResolvedValue(
      currentRemoteScriptStatus({ running: false, runningVersion: null }),
    );

    const stopped = `remoteScript: v${VERSION} is installed but not running. ${ADDS} Tell the user to ${ENABLE_IN_LIVE}.`;

    const content = await connectThrough(undefined, true);

    expect(content[1]?.text).toBe(
      `${stopped} Don't call ${INSTALL} again: it can't start the script.`,
    );
  });

  it("doesn't name ppal-manage for a script that isn't running when the caller lacks it", async () => {
    remoteScriptStatus.mockResolvedValue(
      currentRemoteScriptStatus({ running: false, runningVersion: null }),
    );

    const content = await connectThrough(undefined, false);

    expect(content[1]?.text).toBe(
      `remoteScript: v${VERSION} is installed but not running. ${ADDS} Tell the user to ${ENABLE_IN_LIVE}.`,
    );
  });

  it("tells the user to restart Live when it runs an older copy than the installed one", async () => {
    remoteScriptStatus.mockResolvedValue(
      currentRemoteScriptStatus({ runningVersion: "2.3.0" }),
    );

    const content = await connectThrough();

    expect(content[1]?.text).toBe(
      `remoteScript: Live is running v2.3.0, but v${VERSION} is installed. Tell the user to restart Live. ${AFTER_RESTART_CHECK}`,
    );
  });

  it("tells the user to restart Live when it runs another build of the installed version", async () => {
    remoteScriptStatus.mockResolvedValue(
      currentRemoteScriptStatus({ runningBuild: "build-0" }),
    );

    const content = await connectThrough();

    expect(content[1]?.text).toBe(
      `remoteScript: Live is running a different build of v${VERSION} than the one installed. Tell the user to restart Live. ${AFTER_RESTART_CHECK}`,
    );
  });

  it("tells the user to restart Live when it runs a newer copy than the installed one", async () => {
    remoteScriptStatus.mockResolvedValue(
      currentRemoteScriptStatus({ runningVersion: "999.0.0" }),
    );

    const content = await connectThrough();

    expect(content[1]?.text).toBe(
      `remoteScript: Live is running v999.0.0, but v${VERSION} is installed. Tell the user to restart Live. ${AFTER_RESTART_CHECK}`,
    );
  });

  it("gives just the version when the script is current and running", async () => {
    remoteScriptStatus.mockResolvedValue(currentRemoteScriptStatus());

    const content = await connectThrough();

    expect(content).toHaveLength(2);
    expect(content[1]?.text).toBe(`remoteScript: v${VERSION} running`);
  });

  it("says only that it is running when the running version is unknown", async () => {
    remoteScriptStatus.mockResolvedValue(
      currentRemoteScriptStatus({ runningVersion: null }),
    );

    const content = await connectThrough();

    expect(content[1]?.text).toBe("remoteScript: running");
  });

  it("names the port when another program answers on it", async () => {
    remoteScriptStatus.mockResolvedValue(
      currentRemoteScriptStatus({
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
      currentRemoteScriptStatus({
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

  it("leaves other tools alone", async () => {
    remoteScriptStatus.mockResolvedValue(
      currentRemoteScriptStatus({ runningVersion: "2.3.0" }),
    );

    const result = await withRemoteScriptNotice(
      fakeInnerCall(connectResponse()),
      () => remoteScriptStatus(PING),
      () => ({ manage: true, smallModel: false }),
    )("ppal-read-live-set", {});

    expect(result.content).toHaveLength(1);
    expect(remoteScriptStatus).not.toHaveBeenCalled();
  });
});

describe("withRemoteScriptNotice in small-model mode", () => {
  /**
   * @param overrides - What differs from a current, running script
   * @returns The remote script line a small-model caller gets
   */
  async function lineFor(
    overrides: Parameters<typeof currentRemoteScriptStatus>[0],
  ): Promise<string | undefined> {
    remoteScriptStatus.mockResolvedValue(currentRemoteScriptStatus(overrides));

    const content = await connectThrough(undefined, false, true);

    return content[1]?.text;
  }

  it("calls an installed copy that is behind a running script", async () => {
    expect(
      await lineFor({ installedVersion: "2.3.0", updateAvailable: true }),
    ).toBe(`remoteScript: v${VERSION} running`);
  });

  it("calls a different build of this version a running script", async () => {
    expect(await lineFor({ updateAvailable: true })).toBe(
      `remoteScript: v${VERSION} running`,
    );
  });

  it("doesn't ask for a restart when Live runs another copy", async () => {
    expect(await lineFor({ runningVersion: "2.3.0" })).toBe(
      "remoteScript: v2.3.0 running",
    );
    expect(await lineFor({ runningBuild: "build-0" })).toBe(
      `remoteScript: v${VERSION} running`,
    );
  });

  it("says a behind copy isn't running, rather than that it is behind", async () => {
    expect(
      await lineFor({
        installedVersion: "2.3.0",
        updateAvailable: true,
        running: false,
        runningVersion: null,
      }),
    ).toBe(
      `remoteScript: v2.3.0 is installed but not running. ${ADDS} Tell the user to ${ENABLE_IN_LIVE}.`,
    );
  });

  it("still says when the script isn't installed", async () => {
    expect(
      await lineFor({
        installed: false,
        installedVersion: null,
        running: false,
        runningVersion: null,
      }),
    ).toBe(
      `remoteScript: not installed. ${ADDS} Tell the user to install it (Chat UI > Settings > Installation > Install), then ${ENABLE_IN_LIVE}.`,
    );
  });

  it("still names another program on the port", async () => {
    expect(
      await lineFor({
        running: false,
        runningVersion: null,
        otherOnPort: 3349,
      }),
    ).toBe("remoteScript: not running; another program answers on port 3349.");
  });
});
