// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { VERSION } from "#src/shared/config.ts";
import { isNewerVersion } from "#src/shared/version-check.ts";
import { setRunningLiveMajor } from "../../live-library/live-db-path.ts";
import { findUserLibraryPath } from "../../live-library/query/user-library-path.ts";
import {
  remoteScriptPing,
  type RemoteScriptPing,
} from "./remote-script-client.ts";
import { remoteScriptPath } from "./install/remote-script-install.ts";

/** Matches the one line version.py holds. */
const VERSION_LINE = /^VERSION\s*=\s*["']([^"']*)["']/m;

/** What the chat UI needs to offer an install, an update, or nothing. */
export interface RemoteScriptStatus {
  /** Live's User Library, or null when we couldn't work it out. */
  userLibrary: string | null;
  installed: boolean;
  installedVersion: string | null;
  bundledVersion: string;
  running: boolean;
  runningVersion: string | null;
  liveVersion: string | null;
  /** The port another program answered on, when it isn't our script. */
  otherOnPort: number | null;
  /** Installed is older than this build (or unreadable): offer an Update. */
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
  const { installed, installedVersion } =
    userLibrary == null
      ? { installed: false, installedVersion: null }
      : installedRemoteScript(userLibrary);
  const installedNewer =
    installedVersion != null && isNewerVersion(VERSION, installedVersion);

  return {
    userLibrary,
    installed,
    installedVersion,
    bundledVersion: VERSION,
    running: ping.running,
    runningVersion: ping.scriptVersion,
    liveVersion: ping.liveVersion,
    otherOnPort: ping.otherOnPort,
    updateAvailable:
      installed && installedVersion !== VERSION && !installedNewer,
    installedNewer,
  };
}

/** The remote script as installed in one User Library. */
export interface InstalledRemoteScript {
  /** Where the script is installed, or would be */
  path: string;
  installed: boolean;
  /** Null when not installed or version.py can't be read */
  installedVersion: string | null;
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
  };
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
