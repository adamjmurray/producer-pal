// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { VERSION } from "#src/shared/config.ts";
import { isNewerVersion } from "#src/shared/version-check.ts";
import { setRunningLiveMajor } from "../../live-library/live-db-path.ts";
import { findUserLibraryPath } from "../../live-library/query/user-library-path.ts";
import { remoteScriptPing } from "./remote-script-client.ts";
import { remoteScriptPath } from "./remote-script-install.ts";

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
 * @returns The status, with nulls for anything that couldn't be read
 */
export async function remoteScriptStatus(): Promise<RemoteScriptStatus> {
  const ping = await remoteScriptPing();

  // The running Live picks which browser database to read. The ping is the
  // only place Node learns that on its own. A ping that failed says nothing
  // about it, so leave the last known major alone instead of clearing it.
  const liveMajor = majorOf(ping.liveVersion);

  if (liveMajor != null) {
    setRunningLiveMajor(liveMajor);
  }

  const userLibrary = await findUserLibraryPath();
  const folder = userLibrary == null ? null : remoteScriptPath(userLibrary);
  const installed = folder != null && existsSync(join(folder, "__init__.py"));
  const installedVersion = installed
    ? readScriptVersion(join(folder, "version.py"))
    : null;
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
    updateAvailable:
      installed && installedVersion !== VERSION && !installedNewer,
    installedNewer,
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
