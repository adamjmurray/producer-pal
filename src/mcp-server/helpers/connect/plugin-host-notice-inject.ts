// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { type PluginHostWrapperState } from "#src/portal/setup/plugin-host/plugin-host-part.ts";
import { wrappersAreOursToInstall } from "#src/shared/version-check.ts";
import { INSTALL_WITH_TOOL } from "#src/tools/shared/remote-script/remote-script-setup.ts";
import { type CallLiveApiFunction } from "../../create-mcp-server.ts";
import { type RemoteScriptStatus } from "../../rpc/remote-script/remote-script-status.ts";
import {
  withConnectAppend,
  type WrappedCallLiveApi,
} from "./connect-append.ts";
import { type RemoteScriptCaller } from "./remote-script-line.ts";

/** Reads how each installed wrapper compares with this build's. */
export type ReadWrapperStates = (
  library: string | null,
) => PluginHostWrapperState[] | null;

/** What connect reads to decide which wrappers to mention. */
export interface WrapperReaders {
  /** The wrappers' states in a User Library. */
  states: ReadWrapperStates;
  /** How the device's copy in that User Library compares with the device. */
  device: (
    library: string,
  ) => Promise<{ problem: string | null; state: string | null }>;
}

/**
 * Wrap a callLiveApi so a successful ppal-connect response says when a plug-in
 * wrapper device in the User Library is missing or differs from this build.
 * Wrappers that are in place add no line.
 *
 * @param inner - The underlying callLiveApi to wrap
 * @param getStatus - Reads the remote script status (shared per connect)
 * @param getCaller - Reads what this caller can do
 * @param readers - Read the wrappers' states and the device copy's
 * @returns A callLiveApi that appends the line to connect results
 */
export function withPluginHostNotice(
  inner: CallLiveApiFunction,
  getStatus: () => Promise<RemoteScriptStatus>,
  getCaller: () => RemoteScriptCaller,
  readers: WrapperReaders,
): WrappedCallLiveApi {
  return withConnectAppend(inner, async () =>
    pluginHostLine(
      await wrappersToInstall(await getStatus(), readers),
      getCaller(),
    ),
  );
}

/**
 * The wrappers connect should mention. None while the remote script line still
 * has something to install or start, since plug-ins can't load until then. None
 * when the script or the device copy says the User Library belongs to another
 * build, as for the install notice.
 *
 * @param status - The remote script status
 * @param readers - Read the wrappers' states and the device copy's
 * @returns The wrappers that are missing or differ from this build
 */
export async function wrappersToInstall(
  status: RemoteScriptStatus,
  readers: WrapperReaders,
): Promise<PluginHostWrapperState[]> {
  const { userLibrary } = status;
  const settled =
    status.running && !status.updateAvailable && !status.installedNewer;

  if (!settled || userLibrary == null) {
    return [];
  }

  const behind = (readers.states(userLibrary) ?? []).filter(
    ({ state }) => state !== "current",
  );

  return behind.length > 0 &&
    wrappersAreOursToInstall(await readers.device(userLibrary))
    ? behind
    : [];
}

/**
 * @param wrappers - The wrappers that are missing or differ from this build
 * @param caller - What the caller can do and which mode it is in
 * @returns The connect line, or null with nothing to say. Small-model mode
 *   doesn't manage installs, so it gets none
 */
export function pluginHostLine(
  wrappers: PluginHostWrapperState[],
  caller: RemoteScriptCaller,
): string | null {
  if (wrappers.length === 0 || caller.smallModel) {
    return null;
  }

  const each = wrappers
    .map(
      ({ name, state }) =>
        `${name} ${state === "missing" ? "is not installed" : "differs from this build"}`,
    )
    .join("; ");
  const fix = caller.manage
    ? `To install them, call ${INSTALL_WITH_TOOL}.`
    : "Tell the user to install them (Chat UI > Settings > Installation).";

  return `pluginWrappers: ${each}. Plug-ins load through these devices. ${fix}`;
}
