// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { VERSION } from "#src/shared/config.ts";
import { isBehindBuild, isNewerVersion } from "#src/shared/version-check.ts";
import { setRunningLiveMajor } from "../../live-library/live-db-path.ts";
import { findUserLibraryPath } from "../../live-library/query/user-library-path.ts";
import {
  remoteScriptPing,
  type RemoteScriptPing,
} from "./remote-script-client.ts";
import { remoteScriptPath } from "./install/remote-script-install.ts";
import {
  bundledRemoteScriptBuild,
  installedRemoteScriptBuild,
} from "./bundle/remote-script-build.ts";

/** Matches the version line in version.py. */
const VERSION_LINE = /^VERSION\s*=\s*["']([^"']*)["']/m;

/**
 * Added only by `npm run remote-script:install -- --probe`: a dev copy that
 * differs from every device build on purpose, so it is never offered an update.
 */
const DEV_PROBE_FILE = "probe.py";

/** What the chat UI needs to offer an install, an update, or nothing. */
export interface RemoteScriptStatus {
  /** Live's User Library, or null when we couldn't work it out. */
  userLibrary: string | null;
  installed: boolean;
  installedVersion: string | null;
  /** The installed files' build ID, or null when not installed. */
  installedBuild: string | null;
  bundledVersion: string;
  running: boolean;
  runningVersion: string | null;
  /** The build ID Live loaded, or null when not running or too old to say. */
  runningBuild: string | null;
  liveVersion: string | null;
  /** The port another program answered on, when it isn't our script. */
  otherOnPort: number | null;
  /**
   * Installed is older than this build, a different build of the same version,
   * or unreadable: offer an Update.
   */
  updateAvailable: boolean;
  /** Installed is newer than this build: installing would downgrade it. */
  installedNewer: boolean;
}

/**
 * Report whether the remote script is installed, running, and current.
 *
 * Installed and running are independent: Live only loads Remote Scripts at
 * startup and only when the control surface is selected, so a fresh install
 * reads installed but not running until the user restarts Live.
 *
 * @param knownPing - A ping the caller just made, to avoid asking Live again
 * @returns The status, with nulls for anything that couldn't be read
 */
export async function remoteScriptStatus(
  knownPing?: RemoteScriptPing,
): Promise<RemoteScriptStatus> {
  const ping = knownPing ?? (await remoteScriptPing());

  // The running Live picks which browser database to read. The ping is the
  // only place Node learns that on its own. A ping that failed says nothing
  // about it, so leave the last known major alone instead of clearing it.
  const liveMajor = majorOf(ping.liveVersion);

  if (liveMajor != null) {
    setRunningLiveMajor(liveMajor);
  }

  const userLibrary = await findUserLibraryPath();
  const script =
    userLibrary == null ? null : installedRemoteScript(userLibrary);

  return {
    userLibrary,
    installed: script?.installed ?? false,
    installedVersion: script?.installedVersion ?? null,
    installedBuild: script?.installedBuild ?? null,
    bundledVersion: VERSION,
    running: ping.running,
    runningVersion: ping.scriptVersion,
    runningBuild: ping.scriptBuild,
    liveVersion: ping.liveVersion,
    otherOnPort: ping.otherOnPort,
    updateAvailable: script != null && isBehind(script),
    installedNewer: isInstalledNewer(script?.installedVersion ?? null),
  };
}

/**
 * Whether a User Library has a remote script that is in place and not behind
 * this build. A script that is newer than this build counts as current.
 *
 * @param userLibrary - Absolute path to Live's User Library folder
 * @returns False when the script is missing or older than the bundled one
 */
export function remoteScriptCurrent(userLibrary: string): boolean {
  const script = installedRemoteScript(userLibrary);

  return script.installed && !isBehind(script);
}

/** The remote script as installed in one User Library. */
export interface InstalledRemoteScript {
  /** Where the script is installed, or would be */
  path: string;
  installed: boolean;
  /** Null when not installed or version.py can't be read */
  installedVersion: string | null;
  /** The files' build ID. Null when not installed or unreadable */
  installedBuild: string | null;
  /** A dev copy with the probe route, which never matches a device build */
  devProbe: boolean;
}

/**
 * Look for the remote script in a User Library. Never throws.
 *
 * @param userLibrary - Absolute path to Live's User Library folder
 * @returns Whether the script is there, and its version
 */
export function installedRemoteScript(
  userLibrary: string,
): InstalledRemoteScript {
  const path = remoteScriptPath(userLibrary);
  const installed = existsSync(join(path, "__init__.py"));

  return {
    path,
    installed,
    installedVersion: installed
      ? readScriptVersion(join(path, "version.py"))
      : null,
    installedBuild: installed ? installedRemoteScriptBuild(path) : null,
    devProbe: installed && existsSync(join(path, DEV_PROBE_FILE)),
  };
}

/**
 * @param script - The script as installed
 * @returns Whether it is older than this build, a different build of this
 *   version, or unreadable
 */
function isBehind(script: InstalledRemoteScript): boolean {
  if (!script.installed) {
    return false;
  }

  if (script.installedVersion !== VERSION) {
    return isBehindBuild(script.installedVersion, VERSION);
  }

  return (
    !script.devProbe && script.installedBuild !== bundledRemoteScriptBuild()
  );
}

/**
 * @param installedVersion - The installed script's version, if it names one
 * @returns Whether it is newer than this build
 */
function isInstalledNewer(installedVersion: string | null): boolean {
  return installedVersion != null && isNewerVersion(VERSION, installedVersion);
}

/**
 * Read an installed script's version out of its version.py.
 *
 * @param file - Path to the installed version.py
 * @returns The version, or null when the file is missing or has no version line
 */
function readScriptVersion(file: string): string | null {
  try {
    return VERSION_LINE.exec(readFileSync(file, "utf8"))?.[1] ?? null;
  } catch {
    return null;
  }
}

/**
 * The major version out of a Live version string.
 *
 * @param liveVersion - A version like "12.4.5", or null
 * @returns The major, or null when absent or unparseable
 */
function majorOf(liveVersion: string | null): number | null {
  const major = Number.parseInt(liveVersion ?? "", 10);

  return Number.isNaN(major) ? null : major;
}
