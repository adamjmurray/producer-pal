// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { liveRunsOtherCopy } from "#src/shared/version-check";
import { type RemoteScriptStatus } from "#webui/hooks/settings/installation/use-remote-script";
import { goodTextClass, warnTextClass } from "./installation-classes";
import { versionText } from "./version-text";

/**
 * One-line summary of what is installed and whether Live is running it.
 * @param status - The server's remote-script status
 * @returns The summary text
 */
export function summarize(status: RemoteScriptStatus): string {
  if (!status.installed) {
    // Live can be running a copy from a second User Library, or one installed
    // by hand. Saying only "Not installed" would contradict what Live shows.
    return status.running
      ? `Not installed here, but Live${liveSuffix(status)} is running ${versionText(status.runningVersion)} from another location`
      : "Not installed";
  }

  const running = runningText(status);

  if (status.updateAvailable) {
    const installed =
      status.installedVersion === status.bundledVersion
        ? `installed v${status.bundledVersion} is a different build than this device's`
        : `installed ${versionText(status.installedVersion)}, this build has v${status.bundledVersion}`;

    return `Update available: ${installed} (${running})`;
  }

  if (status.installedNewer) {
    return `Installed ${versionText(status.installedVersion)} is newer than this device's v${status.bundledVersion} (${running})`;
  }

  return `Installed ${versionText(status.installedVersion)} (${running})`;
}

/**
 * Whether Live has the script loaded, which version, and which Live.
 * @param status - The server's remote-script status
 * @returns The running clause of the summary
 */
function runningText(status: RemoteScriptStatus): string {
  if (!status.running) {
    return `not running${portConflictText(status)}`;
  }

  // Same version, other build: naming the version twice would hide why the
  // line still asks for a restart.
  if (
    status.runningVersion === status.installedVersion &&
    liveRunsOtherCopy(status)
  ) {
    return `Live${liveSuffix(status)} is running a different build`;
  }

  const live =
    status.liveVersion == null ? "" : ` in Live ${status.liveVersion}`;

  return `running ${versionText(status.runningVersion)}${live}`;
}

/**
 * @param status - The server's remote-script status
 * @returns A clause naming the port another program answers on, or ""
 */
function portConflictText(status: RemoteScriptStatus): string {
  return status.otherOnPort == null
    ? ""
    : `; another program answers on port ${status.otherOnPort}`;
}

/**
 * @param status - The server's remote-script status
 * @returns Live's version as a suffix, or "" when it didn't say
 */
function liveSuffix(status: RemoteScriptStatus): string {
  return status.liveVersion == null ? "" : ` ${status.liveVersion}`;
}

/**
 * The version Live would pick up on a restart: an install or update landed
 * while Live is still running a different copy.
 * @param status - The server's remote-script status
 * @returns The installed version, or null when Live is already running it
 */
export function restartVersion(status: RemoteScriptStatus): string | null {
  return liveRunsOtherCopy(status) ? status.installedVersion : null;
}

/**
 * Whether Live still has to be pointed at the script: it isn't running, or it
 * is running another copy than the installed one.
 * @param status - The server's remote-script status
 * @returns True when the enable steps are still to do
 */
export function needsEnabling(status: RemoteScriptStatus): boolean {
  return !status.running || liveRunsOtherCopy(status);
}

/** How the card looks: its icon, and the colour of its status line. */
export interface RemoteScriptLook {
  kind: "warning" | "waiting" | "done";
  /** Classes for the status line. */
  textClass: string;
}

/**
 * - Done and green: Live runs the installed version, which is current.
 * - Amber: installed but Live isn't running it yet, or runs another copy.
 * - Otherwise plain, with a warning icon: not installed, or behind this build.
 * @param status - The server's remote-script status
 * @returns The icon and status colour
 */
export function remoteScriptLook(status: RemoteScriptStatus): RemoteScriptLook {
  if (status.installed && needsEnabling(status)) {
    return {
      kind: status.running ? "warning" : "waiting",
      textClass: warnTextClass,
    };
  }

  if (status.installed && !status.updateAvailable) {
    return { kind: "done", textClass: goodTextClass };
  }

  return { kind: "warning", textClass: "" };
}

/**
 * Text for the install button. The status describes only the detected User
 * Library, so any other path is a plain "Install".
 * @param status - The server's remote-script status
 * @param installing - Whether an install is in flight
 * @param isDetectedPath - Whether the field holds the detected User Library
 * @returns The button label
 */
export function installLabel(
  status: RemoteScriptStatus,
  installing: boolean,
  isDetectedPath: boolean,
): string {
  if (installing) {
    return "Installing…";
  }

  if (!status.installed || !isDetectedPath) {
    return "Install";
  }

  if (status.installedNewer) {
    return "Downgrade to match";
  }

  return status.updateAvailable ? "Update" : "Reinstall";
}
