// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// The next steps an offline call is told, worded by what is installed where.
// Each device sentence says what ppal-manage add-producer-pal will do.

import { type InstalledRemoteScript } from "#src/mcp-server/rpc/remote-script/remote-script-status.ts";
import { UPDATE_PORTAL_ADVICE, VERSION } from "#src/shared/config.ts";
import { isNewerVersion } from "#src/shared/version-check.ts";
import { INSTALL_WITH_TOOL } from "#src/tools/shared/remote-script/remote-script-setup.ts";
import { type OfflineInstallStatus } from "./offline-install-status.ts";

export const SETUP_URL = "https://producer-pal.org/installation";

const ADD_ACTION = 'action "add-producer-pal"';

const ADD_CALL = `ppal-manage ${ADD_ACTION}`;
const CONTROL_SURFACE =
  "choose Producer Pal as a Control Surface in Settings → Link, Tempo & MIDI";
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
  const script = status == null ? undefined : scriptLine(status);

  if (status == null || script == null) {
    return `
Or run ${INSTALL_WITH_TOOL} now (it works without Producer Pal), then ask the user to restart Live and choose Producer Pal as a Control Surface. After that, ${ADD_CALL} adds the device.`;
  }

  return `\n${script} ${afterThat(status)}${olderPortalNote(status, null)}`;
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
    const after =
      status == null
        ? `After that, ${ADD_CALL} adds the device.`
        : afterThat(status);

    return `${outdated.charAt(0).toUpperCase()}${outdated.slice(1)}. ${after}`;
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
 * @param status - What was found
 * @returns What to do about the remote script, or undefined when it can't be said
 */
function scriptLine(status: OfflineInstallStatus): string | undefined {
  const { library, script } = status;

  if (library == null) {
    return `Or run ${INSTALL_WITH_TOOL} now. Live's User Library wasn't found, so ask the user for its path (Live: Settings → Library → Location of User Library) and pass it as userLibrary.`;
  }

  if (script == null) {
    return undefined;
  }

  if (!script.installed) {
    return `Or set it up now: run ${INSTALL_WITH_TOOL} (installs to ${script.path}), then ask the user to restart Live and ${CONTROL_SURFACE}.`;
  }

  return isCurrent(script)
    ? `The Producer Pal remote script is installed (${script.installedVersion}, ${script.path}) but not running. Ask the user to restart Live if they installed it since Live started, and to ${CONTROL_SURFACE}.`
    : `The Producer Pal remote script at ${script.path} is out of date (${script.installedVersion ?? UNKNOWN}; this is ${VERSION}). Run ${INSTALL_WITH_TOOL} to update it, then ask the user to restart Live and ${CONTROL_SURFACE}.`;
}

/**
 * @param script - An installed remote script
 * @returns Whether its version is this build's or newer
 */
function isCurrent(script: InstalledRemoteScript): boolean {
  const { installedVersion } = script;

  return installedVersion != null && !isNewerVersion(installedVersion, VERSION);
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

/** @returns Why ppal-manage can't add the device, and what to do instead */
function noBundledDevice(): string {
  return `ppal-manage can't add the device from this install; tell the user to install it by hand: ${SETUP_URL}.`;
}
