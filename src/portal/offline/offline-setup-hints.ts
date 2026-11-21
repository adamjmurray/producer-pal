// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// The next steps an offline call is told, worded by what is installed where.
// Each device sentence says what ppal-manage add-producer-pal will do.

import { UPDATE_PORTAL_ADVICE, VERSION } from "#src/shared/config.ts";
import { isBehindBuild, isNewerVersion } from "#src/shared/version-check.ts";
import { INSTALL_WITH_TOOL } from "#src/tools/shared/remote-script/remote-script-setup.ts";
import { type InstalledRemoteScript } from "#src/mcp-server/rpc/remote-script/remote-script-status.ts";
import { type OfflineInstallStatus } from "./offline-install-status.ts";

export const SETUP_URL = "https://producer-pal.org/installation";

const ADD_ACTION = 'action "add-producer-pal"';

const ADD_CALL = `ppal-manage ${ADD_ACTION}`;
const CONTROL_SURFACE =
  "choose Producer Pal as a Control Surface in Settings → Tempo & MIDI";
const NEW_TRACK = "to a new MIDI track";
const UNKNOWN = "unknown version";

/**
 * The line for a remote script that isn't running, then what add-producer-pal
 * does after it. Falls back to a general line when the install is unknown.
 * @param status - What was found, if anything
 * @returns The hint, starting on a new line
 */
export function notRunningHint(
  status: OfflineInstallStatus | undefined,
): string {
  const script = status?.script;

  if (status == null || (status.library != null && script == null)) {
    return `\nRun ${INSTALL_WITH_TOOL} now (it installs the remote script and the device, and works without Producer Pal), then ask the user to restart Live and ${CONTROL_SURFACE}. ${afterInstall(status)}`;
  }

  if (status.library == null) {
    return `\nRun ${INSTALL_WITH_TOOL} now. Live's User Library wasn't found, so ask the user for its path (Live: Settings → Library → Location of User Library) and pass it as userLibrary. ${afterInstall(status)}`;
  }

  // The script step runs the install unless the script is already current.
  const after = scriptNeedsInstall(script)
    ? afterInstall(status)
    : afterThat(status);

  return `\n${scriptSetupSteps(script)} ${after}${olderPortalNote(status, null)}`;
}

/**
 * What gets the remote script running, for a call that needs it. An install
 * puts the device in the User Library too.
 * @param script - The remote script in the User Library, if it could be read
 * @returns The steps, as sentences
 */
export function scriptSetupSteps(
  script: InstalledRemoteScript | undefined,
): string {
  if (script?.installed !== true) {
    const where = script == null ? "" : ` to ${script.path}`;

    return `Run ${INSTALL_WITH_TOOL} (it installs the remote script${where} and the device), then ask the user to restart Live and ${CONTROL_SURFACE}.`;
  }

  const version = script.installedVersion ?? UNKNOWN;

  return scriptNeedsInstall(script)
    ? `The Producer Pal remote script at ${script.path} is out of date (${version}; this is ${VERSION}). Run ${INSTALL_WITH_TOOL} to update it, then ask the user to restart Live and ${CONTROL_SURFACE}.`
    : `The Producer Pal remote script is installed (${version}, ${script.path}) but not running. Ask the user to restart Live if they installed it since Live started, and to ${CONTROL_SURFACE}.`;
}

/**
 * @param script - The remote script in the User Library, if it could be read
 * @returns True when the steps for it run install-producer-pal
 */
function scriptNeedsInstall(
  script: InstalledRemoteScript | undefined,
): boolean {
  return (
    script?.installed !== true ||
    isBehindBuild(script.installedVersion, VERSION)
  );
}

/**
 * What to do when the remote script answers but the device isn't in the Set.
 * @param outdated - Why the running script is too old, or null when it isn't
 * @param status - What was found, if anything
 * @param runningScript - The version of the running remote script, if known
 * @returns The hint
 */
export function runningHint(
  outdated: string | null,
  status: OfflineInstallStatus | undefined,
  runningScript: string | null = null,
): string {
  if (outdated != null) {
    return `${outdated.charAt(0).toUpperCase()}${outdated.slice(1)}. ${afterInstall(status)}`;
  }

  const device = status == null ? undefined : deviceAction(status);

  if (status?.bundled === false) {
    return noBundledDevice();
  }

  const ask = `Ask the user, then call ${ADD_CALL}.`;

  const hint = device == null ? ask : `${ask} It ${device}`;

  return `${hint}${olderPortalNote(status, runningScript)}`;
}

/**
 * Say so when something installed is newer than this portal, which can't be
 * fixed from here.
 * @param status - What was found, if anything
 * @param runningScript - The version of the running remote script, if known
 * @returns A sentence starting with a space, or "" when the portal is newest
 */
function olderPortalNote(
  status: OfflineInstallStatus | undefined,
  runningScript: string | null,
): string {
  const newer = [
    ["remote script", runningScript ?? status?.script?.installedVersion],
    ["device", status?.device?.installedVersion],
  ].filter(
    (found): found is [string, string] =>
      found[1] != null && isNewerVersion(VERSION, found[1]),
  );

  if (newer.length === 0) {
    return "";
  }

  const what = newer
    .map(([name, version]) => `${name} (${version})`)
    .join(" and the installed ");

  return ` This portal (${VERSION}) is older than the installed ${what}. ${UPDATE_PORTAL_ADVICE}`;
}

/**
 * What add-producer-pal does with the device file, as the rest of a sentence.
 * @param status - What was found
 * @returns The predicate, or null when the portal has no device to add
 */
function deviceAction(status: OfflineInstallStatus): string | null {
  const { library, bundled, device } = status;

  if (!bundled) {
    return null;
  }

  if (library == null || device == null) {
    return `installs the Producer Pal device and adds it ${NEW_TRACK}.`;
  }

  const installed = device.installedVersion ?? UNKNOWN;

  switch (device.state) {
    case "not-installed":
      return `installs the Producer Pal device to ${device.path} and adds it ${NEW_TRACK}.`;
    case "installed-older":
      return `updates the Producer Pal device at ${device.path} (${installed} → ${device.bundledVersion ?? UNKNOWN}) and adds it ${NEW_TRACK}.`;
    case "same":
      return `adds the Producer Pal device already in the User Library (${installed}) ${NEW_TRACK}; nothing needs installing.`;
    default:
      return `adds the Producer Pal device already in the User Library (${installed}) ${NEW_TRACK}, as is.`;
  }
}

/**
 * @param status - What was found
 * @returns What add-producer-pal does next, or where to install by hand
 */
function afterThat(status: OfflineInstallStatus): string {
  const device = deviceAction(status);

  return device == null
    ? noBundledDevice()
    : `After that, ${ADD_CALL} ${device}`;
}

/**
 * What follows an install-producer-pal step, which has put the device in the
 * User Library already.
 * @param status - What was found, if anything
 * @returns What add-producer-pal does next, or where to install by hand
 */
function afterInstall(status: OfflineInstallStatus | undefined): string {
  return status?.bundled === false
    ? noBundledDevice()
    : `After that, ${ADD_CALL} adds the device ${NEW_TRACK}.`;
}

/** @returns Why ppal-manage can't add the device, and what to do instead */
function noBundledDevice(): string {
  return `ppal-manage can't add the device from this install; tell the user to install it by hand: ${SETUP_URL}.`;
}
