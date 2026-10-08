// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { VERSION } from "#src/shared/config.ts";
import {
  liveRunsOtherCopy,
  remoteScriptAttention,
} from "#src/shared/version-check.ts";
import {
  INSTALL_WITH_TOOL,
  REMOTE_SCRIPT_ADDS,
} from "#src/tools/shared/remote-script/remote-script-setup.ts";
import { type CallLiveApiFunction } from "../../create-mcp-server.ts";
import { type RemoteScriptPing } from "../../rpc/remote-script/remote-script-client.ts";
import {
  remoteScriptStatus,
  type RemoteScriptStatus,
} from "../../rpc/remote-script/remote-script-status.ts";
import {
  withConnectAppend,
  type WrappedCallLiveApi,
} from "./connect-append.ts";

/** Reading the status must not hold connect up. */
const STATUS_TIMEOUT_MS = 1500;

/**
 * Wrap a callLiveApi so a successful ppal-connect response says where the
 * remote script stands: not installed, behind this build, installed but not
 * running, needing a Live restart, or running. The script updates separately
 * from the device, so it drifts.
 *
 * Done Node-side: the installed copy is a file in the User Library, which V8
 * can't read. A status that fails or runs long adds no line.
 *
 * @param inner - The underlying callLiveApi to wrap
 * @param getPing - Reads the remote script ping (shared with the skills)
 * @param manageAvailable - Whether the caller can call ppal-manage; when not,
 *   the line points at the Chat UI instead
 * @returns A callLiveApi that appends the status line to connect results
 */
export function withRemoteScriptNotice(
  inner: CallLiveApiFunction,
  getPing: () => Promise<RemoteScriptPing>,
  manageAvailable: () => boolean,
): WrappedCallLiveApi {
  return withConnectAppend(inner, async () =>
    remoteScriptLine(await readStatus(getPing), manageAvailable()),
  );
}

/**
 * The connect line for a remote script status. A running, current script is
 * just its version; every other state says what to do, and only that.
 *
 * @param status - The remote script status
 * @param manage - Whether the caller can use ppal-manage to install it
 * @returns The line
 */
function remoteScriptLine(status: RemoteScriptStatus, manage: boolean): string {
  if (status.otherOnPort != null && !status.running) {
    return `remoteScript: not running; another program answers on port ${String(status.otherOnPort)}.`;
  }

  if (!status.installed) {
    // A script that is running is fine, even if its copy wasn't found.
    if (status.running) {
      return runningLine(status);
    }

    return manage
      ? `remoteScript: not installed. ${REMOTE_SCRIPT_ADDS} To install it, call ${INSTALL_WITH_TOOL}, then tell the user to restart Live.`
      : `remoteScript: not installed. ${REMOTE_SCRIPT_ADDS} Tell the user to install it (Chat UI > Settings > Remote Script > Install), then restart Live.`;
  }

  if (remoteScriptAttention(status) === "update") {
    const behind = `remoteScript: ${versionText(status.installedVersion)} is installed, but this device ships v${VERSION}.`;

    return manage
      ? `${behind} To update it, call ${INSTALL_WITH_TOOL}, then tell the user to restart Live.`
      : `${behind} Tell the user to update it (Chat UI > Settings > Remote Script > Update), then restart Live.`;
  }

  if (!status.running) {
    return `remoteScript: ${versionText(status.installedVersion)} is installed but not running. ${REMOTE_SCRIPT_ADDS} Tell the user to choose Producer Pal as a Control Surface in Live's Settings → Link, Tempo & MIDI, or restart Live. Reinstalling won't help.`;
  }

  if (liveRunsOtherCopy(status)) {
    return `remoteScript: Live is running v${String(status.runningVersion)}, but v${String(status.installedVersion)} is installed. Tell the user to restart Live.`;
  }

  return runningLine(status);
}

/**
 * @param status - The remote script status
 * @returns The line for a script that is running and needs nothing
 */
function runningLine(status: RemoteScriptStatus): string {
  return status.runningVersion == null
    ? "remoteScript: running"
    : `remoteScript: v${status.runningVersion} running`;
}

/**
 * @param version - A version the status reported, or null
 * @returns The version to show, never "vnull"
 */
function versionText(version: string | null): string {
  return version == null ? "an unknown version" : `v${version}`;
}

/**
 * Read the status from a ping, giving up after STATUS_TIMEOUT_MS.
 *
 * @param getPing - Reads the remote script ping
 * @returns The status
 * @throws When the status takes too long or can't be read
 */
async function readStatus(
  getPing: () => Promise<RemoteScriptPing>,
): Promise<RemoteScriptStatus> {
  let timer: NodeJS.Timeout | undefined;

  try {
    return await Promise.race([
      getPing().then((ping) => remoteScriptStatus(ping)),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error("remote script status timed out")),
          STATUS_TIMEOUT_MS,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
