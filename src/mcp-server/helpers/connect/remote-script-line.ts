// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { VERSION } from "#src/shared/config.ts";
import {
  AFTER_RESTART_CHECK,
  liveRunsOtherCopy,
  remoteScriptAttention,
  versionText,
} from "#src/shared/version-check.ts";
import {
  ENABLE_IN_LIVE,
  INSTALL_WITH_TOOL,
  REMOTE_SCRIPT_ADDS,
} from "#src/tools/shared/remote-script/remote-script-setup.ts";
import { type RemoteScriptStatus } from "../../rpc/remote-script/remote-script-status.ts";

/**
 * The connect line for a remote script status. A running, current script is
 * just its version; every other state says what to do, and only that.
 *
 * @param status - The remote script status
 * @param manage - Whether the caller can use ppal-manage to install it
 * @returns The line
 */
export function remoteScriptLine(
  status: RemoteScriptStatus,
  manage: boolean,
): string {
  if (status.otherOnPort != null && !status.running) {
    return `remoteScript: not running; another program answers on port ${String(status.otherOnPort)}.`;
  }

  if (!status.installed) {
    // A script that is running is fine, even if its copy wasn't found.
    if (status.running) {
      return runningLine(status);
    }

    return manage
      ? `remoteScript: not installed. ${REMOTE_SCRIPT_ADDS} To install it, call ${INSTALL_WITH_TOOL}, then tell the user to ${ENABLE_IN_LIVE}.`
      : `remoteScript: not installed. ${REMOTE_SCRIPT_ADDS} Tell the user to install it (Chat UI > Settings > Installation > Install), then ${ENABLE_IN_LIVE}.`;
  }

  if (remoteScriptAttention(status) === "update") {
    const behind =
      status.installedVersion === VERSION
        ? `remoteScript: the installed v${VERSION} is a different build than this device ships.`
        : `remoteScript: ${versionText(status.installedVersion)} is installed, but this device ships v${VERSION}.`;

    return manage
      ? `${behind} To update it, call ${INSTALL_WITH_TOOL}, then tell the user to restart Live. ${AFTER_RESTART_CHECK}`
      : `${behind} Tell the user to update it (Chat UI > Settings > Installation > Update), then restart Live. ${AFTER_RESTART_CHECK}`;
  }

  if (!status.running) {
    const stopped = `remoteScript: ${versionText(status.installedVersion)} is installed but not running. ${REMOTE_SCRIPT_ADDS} Tell the user to ${ENABLE_IN_LIVE}.`;

    return manage
      ? `${stopped} Don't call ${INSTALL_WITH_TOOL} again: it can't start the script.`
      : stopped;
  }

  if (liveRunsOtherCopy(status)) {
    const running =
      status.runningVersion === status.installedVersion
        ? `a different build of v${String(status.runningVersion)} than the one installed`
        : `v${String(status.runningVersion)}, but v${String(status.installedVersion)} is installed`;

    return `remoteScript: Live is running ${running}. Tell the user to restart Live. ${AFTER_RESTART_CHECK}`;
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
