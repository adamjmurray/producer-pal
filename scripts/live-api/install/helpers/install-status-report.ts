// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { join } from "node:path";
import { remoteScriptPath } from "#src/mcp-server/rpc/remote-script/install/remote-script-install.ts";
import { BUILD_COMMIT_FILE } from "#src/mcp-server/rpc/remote-script/bundle/remote-script-build.ts";
import {
  libraryPathExists,
  readLibraryBytes,
} from "#src/mcp-server/rpc/remote-script/user-library/user-library-fs.ts";
import {
  type DeviceState,
  deviceFilePath,
  deviceFileStatus,
  readDeviceVersion,
} from "#src/portal/setup/device-file-status.ts";
import { findOtherDeviceCopies } from "#src/portal/setup/other-device-copies.ts";
import { findRemoteScriptLeftovers } from "./remote-script-leftovers.ts";

const VS_RELEASE: Record<DeviceState, string> = {
  "not-installed": "",
  same: "identical to the release build",
  "installed-older": "older than the release build",
  "installed-newer": "newer than the release build",
  different: "differs from the release build",
};

/**
 * Describe what's installed in a User Library. Changes nothing.
 *
 * @param library - Absolute path to the User Library
 * @param releaseFile - Where `npm run release:amxd` puts the device
 * @returns Lines to print
 */
export function installStatusLines(
  library: string,
  releaseFile: string,
): string[] {
  return [
    ...deviceLines(library, releaseFile),
    ...remoteScriptLines(remoteScriptPath(library)),
  ];
}

function deviceLines(library: string, releaseFile: string): string[] {
  const path = deviceFilePath(library);
  const others = findOtherDeviceCopies(library, path);
  const lines = [`Device: ${deviceSummary(path, library, releaseFile)}`];

  if (others.length > 0) {
    lines.push(
      `Other Producer_Pal .amxd copies (${others.length}):`,
      ...others.map((other) => `  ${other}`),
    );
  }

  return lines;
}

function deviceSummary(
  path: string,
  library: string,
  releaseFile: string,
): string {
  if (!libraryPathExists(path)) {
    return `not installed (${path})`;
  }

  const notes = [versionNote(readInstalledVersion(path))];
  const vsRelease = compareWithRelease(library, releaseFile);

  if (vsRelease != null) {
    notes.push(vsRelease);
  }

  return `installed at ${path} (${notes.join(", ")})`;
}

function readInstalledVersion(path: string): string | undefined {
  try {
    return readDeviceVersion(readLibraryBytes(path));
  } catch {
    return undefined;
  }
}

function versionNote(version: string | undefined): string {
  return version == null ? "version unknown" : `version ${version}`;
}

function compareWithRelease(
  library: string,
  releaseFile: string,
): string | undefined {
  try {
    const { state } = deviceFileStatus(library, releaseFile);

    return VS_RELEASE[state] || undefined;
  } catch {
    return "no release build to compare; run npm run release:amxd";
  }
}

function remoteScriptLines(path: string): string[] {
  const leftovers = findRemoteScriptLeftovers(path);
  const summary = libraryPathExists(path)
    ? `installed at ${path}${buildNote(path)}`
    : `not installed (${path})`;
  const lines = [`Remote script: ${summary}`];

  if (leftovers.length > 0) {
    lines.push(
      `Remote script temp/backup leftovers (${leftovers.length}):`,
      ...leftovers.map((leftover) => `  ${leftover}`),
    );
  }

  return lines;
}

function buildNote(path: string): string {
  try {
    const commit = readLibraryBytes(join(path, BUILD_COMMIT_FILE))
      .toString("utf8")
      .trim();

    return commit === "" ? "" : ` (build ${commit})`;
  } catch {
    return " (no build commit)";
  }
}
