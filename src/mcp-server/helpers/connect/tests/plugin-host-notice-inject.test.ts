// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";
import {
  connectResponse,
  fakeInnerCall,
} from "#src/mcp-server/tests/config-dir-test-helpers.ts";
import { type PluginHostWrapperState } from "#src/portal/setup/plugin-host/plugin-host-part.ts";
import { currentRemoteScriptStatus } from "#src/mcp-server/rpc/remote-script/tests/remote-script-test-helpers.ts";
import { type RemoteScriptStatus } from "#src/mcp-server/rpc/remote-script/remote-script-status.ts";
import {
  withPluginHostNotice,
  type ReadWrapperStates,
  type WrapperReaders,
} from "../plugin-host-notice-inject.ts";

const INSTALL = 'ppal-manage action "install-producer-pal"';

const EFFECT: PluginHostWrapperState = {
  name: "PPal Plug-in Effect",
  path: "/lib/effect.amxd",
  state: "current",
};
const INSTRUMENT: PluginHostWrapperState = {
  name: "PPal Plug-in Instrument",
  path: "/lib/instrument.amxd",
  state: "current",
};
const BOTH_BEHIND: PluginHostWrapperState[] = [
  { ...EFFECT, state: "missing" },
  { ...INSTRUMENT, state: "differs" },
];

type DeviceCopy = Awaited<ReturnType<WrapperReaders["device"]>>;

const SAME_COPY: DeviceCopy = { problem: null, state: "same" };

interface ConnectOptions {
  wrappers?: PluginHostWrapperState[] | null;
  device?: DeviceCopy;
  status?: Partial<RemoteScriptStatus>;
  manage?: boolean;
  smallModel?: boolean;
}

/**
 * Run withPluginHostNotice over a ppal-connect call.
 * @param options - The wrappers' states, the script status and the caller
 * @returns The text of the blocks added to the response
 */
async function connectThrough(options: ConnectOptions = {}): Promise<string[]> {
  const {
    wrappers = BOTH_BEHIND,
    device = SAME_COPY,
    status = {},
    manage = true,
    smallModel = false,
  } = options;
  const result = await withPluginHostNotice(
    fakeInnerCall(connectResponse()),
    () => Promise.resolve(currentRemoteScriptStatus(status)),
    () => ({ manage, smallModel }),
    { states: () => wrappers, device: () => Promise.resolve(device) },
  )("ppal-connect", {});

  return result.content.slice(1).map((block) => block.text);
}

describe("withPluginHostNotice", () => {
  it("names each wrapper that is missing or differs, and the install call", async () => {
    expect(await connectThrough()).toStrictEqual([
      "pluginWrappers: PPal Plug-in Effect is not installed; " +
        "PPal Plug-in Instrument differs from this build. " +
        `Plug-ins load through these devices. To install them, call ${INSTALL}.`,
    ]);
  });

  it("leaves out a wrapper that is current", async () => {
    const [line] = await connectThrough({
      wrappers: [EFFECT, { ...INSTRUMENT, state: "missing" }],
    });

    expect(line).toContain("pluginWrappers: PPal Plug-in Instrument is not");
  });

  it("sends a caller without ppal-manage to the chat UI", async () => {
    const [line] = await connectThrough({ manage: false });

    expect(line).toContain(
      "Tell the user to install them (Chat UI > Settings > Installation).",
    );
    expect(line).not.toContain("ppal-manage");
  });

  it.each([
    ["both wrappers are current", { wrappers: [EFFECT, INSTRUMENT] }],
    ["there is no User Library to look in", { wrappers: null }],
    ["the status names no User Library", { status: { userLibrary: null } }],
    [
      "the User Library's device copy is newer",
      { device: { problem: null, state: "installed-newer" } },
    ],
    [
      "the User Library's device copy is a different build",
      { device: { problem: null, state: "different" } },
    ],
    [
      "the device hasn't said where it was loaded from",
      { device: { problem: "unknown-source", state: null } },
    ],
    ["the caller is in small-model mode", { manage: false, smallModel: true }],
    ["the remote script isn't running", { status: { running: false } }],
    [
      "the remote script needs an update",
      { status: { updateAvailable: true } },
    ],
    [
      "the installed script is newer than this build",
      { status: { installedNewer: true } },
    ],
  ] satisfies [string, ConnectOptions][])(
    "says nothing when %s",
    async (_why, options) => {
      expect(await connectThrough(options)).toStrictEqual([]);
    },
  );

  it.each([
    ["an older device copy", { problem: null, state: "installed-older" }],
    ["a development device", { problem: "not-frozen", state: null }],
  ] satisfies [string, DeviceCopy][])(
    "still names the wrappers with %s",
    async (_why, device) => {
      expect(await connectThrough({ device })).toHaveLength(1);
    },
  );

  it("reads the wrappers and the device copy in the User Library the status names", async () => {
    const states = vi.fn<ReadWrapperStates>(() => BOTH_BEHIND);
    const device = vi.fn<WrapperReaders["device"]>(() =>
      Promise.resolve(SAME_COPY),
    );

    await withPluginHostNotice(
      fakeInnerCall(connectResponse()),
      () => Promise.resolve(currentRemoteScriptStatus({ userLibrary: "/ul" })),
      () => ({ manage: true, smallModel: false }),
      { states, device },
    )("ppal-connect", {});

    expect(states).toHaveBeenCalledExactlyOnceWith("/ul");
    expect(device).toHaveBeenCalledExactlyOnceWith("/ul");
  });

  it("doesn't read the device copy when the wrappers are current", async () => {
    const device = vi.fn<WrapperReaders["device"]>();

    await withPluginHostNotice(
      fakeInnerCall(connectResponse()),
      () => Promise.resolve(currentRemoteScriptStatus()),
      () => ({ manage: true, smallModel: false }),
      { states: () => [EFFECT, INSTRUMENT], device },
    )("ppal-connect", {});

    expect(device).not.toHaveBeenCalled();
  });

  it("leaves other tools alone", async () => {
    const states = vi.fn<ReadWrapperStates>();
    const result = await withPluginHostNotice(
      fakeInnerCall(connectResponse()),
      () => Promise.resolve(currentRemoteScriptStatus()),
      () => ({ manage: true, smallModel: false }),
      { states, device: () => Promise.resolve(SAME_COPY) },
    )("ppal-read-live-set", {});

    expect(result.content).toHaveLength(1);
    expect(states).not.toHaveBeenCalled();
  });
});
