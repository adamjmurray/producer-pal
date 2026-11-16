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

interface ConnectOptions {
  wrappers?: PluginHostWrapperState[] | null;
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
    status = {},
    manage = true,
    smallModel = false,
  } = options;
  const result = await withPluginHostNotice(
    fakeInnerCall(connectResponse()),
    () => Promise.resolve(currentRemoteScriptStatus(status)),
    () => ({ manage, smallModel }),
    () => wrappers,
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

  it("reads the wrappers in the User Library the status names", async () => {
    const readStates = vi.fn<ReadWrapperStates>(() => []);

    await withPluginHostNotice(
      fakeInnerCall(connectResponse()),
      () => Promise.resolve(currentRemoteScriptStatus({ userLibrary: "/ul" })),
      () => ({ manage: true, smallModel: false }),
      readStates,
    )("ppal-connect", {});

    expect(readStates).toHaveBeenCalledExactlyOnceWith("/ul");
  });

  it("leaves other tools alone", async () => {
    const readStates = vi.fn<ReadWrapperStates>();
    const result = await withPluginHostNotice(
      fakeInnerCall(connectResponse()),
      () => Promise.resolve(currentRemoteScriptStatus()),
      () => ({ manage: true, smallModel: false }),
      readStates,
    )("ppal-read-live-set", {});

    expect(result.content).toHaveLength(1);
    expect(readStates).not.toHaveBeenCalled();
  });
});
