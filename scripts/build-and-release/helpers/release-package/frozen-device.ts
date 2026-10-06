// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// The frozen .amxd is made by hand in Max, after `npm run release`, and nothing
// ties it to the build it came from. These checks do: the portal ships a copy
// of it, so a stale freeze would hand users last release's device.

import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { checkBuildVersion, readBuildInfo } from "./build-info.ts";

/** Must equal BUNDLED_DEVICE_FILENAME in src/portal/bundled-device.ts. */
export const FROZEN_DEVICE_FILENAME = "Producer_Pal.amxd";

/**
 * The string a device built at this version carries in its bytes. Freezing
 * stores the bundled mcp-server.mjs uncompressed, and src/shared/config.ts
 * declares the version as exactly this statement.
 *
 * @param version - The release version
 * @returns The marker to search for
 */
export function versionMarker(version: string): string {
  return `const VERSION = "${version}"`;
}

/**
 * Check that a device file carries this version's marker.
 *
 * @param devicePath - The .amxd to inspect
 * @param version - The version it must be
 * @returns What to print before refusing, or null when it matches
 */
export function checkDeviceVersion(
  devicePath: string,
  version: string,
): string | null {
  if (!existsSync(devicePath)) {
    return `${devicePath} not found.`;
  }

  if (!readFileSync(devicePath).includes(versionMarker(version))) {
    return [
      `${devicePath} does not contain ${versionMarker(version)}.`,
      `It was frozen from a different build than ${version}.`,
    ].join("\n");
  }

  return null;
}

/**
 * Check that the frozen device in release/ belongs to the build being packaged.
 *
 * @param options - Where release/ is, and the version package.json declares
 * @param options.releaseDir - The release/ folder
 * @param options.version - package.json's version
 * @returns What to print before refusing, or null when it belongs to this build
 */
export function checkFrozenDevice(options: {
  releaseDir: string;
  version: string;
}): string | null {
  const { releaseDir, version } = options;
  const devicePath = join(releaseDir, FROZEN_DEVICE_FILENAME);

  if (!existsSync(devicePath)) {
    return [
      `release/${FROZEN_DEVICE_FILENAME} not found.`,
      "Freeze the device in Max first (dev/process/releasing.md, Step 1).",
    ].join("\n");
  }

  const buildRefusal = checkBuildVersion(readBuildInfo(releaseDir), version);

  if (buildRefusal != null) {
    return [...buildRefusal, "Then freeze the device again."].join("\n");
  }

  const mismatch = checkDeviceVersion(devicePath, version);

  if (mismatch != null) {
    return `${mismatch}\nRun \`npm run release\`, then freeze the device again.`;
  }

  // The marker can't tell an earlier build of this version; the age can.
  if (
    statSync(devicePath).mtimeMs <
    statSync(join(releaseDir, "build-info.json")).mtimeMs
  ) {
    return [
      `release/${FROZEN_DEVICE_FILENAME} is older than release/build-info.json.`,
      "It was frozen from an earlier build. Freeze the device again.",
    ].join("\n");
  }

  return null;
}

/**
 * Throw unless each folder holds a byte-for-byte copy of the frozen device.
 *
 * @param devicePath - The frozen device
 * @param dirs - Folders that must each hold a copy
 */
export function assertDeviceCopies(devicePath: string, dirs: string[]): void {
  const expected = sha256(devicePath);

  for (const dir of dirs) {
    const copy = join(dir, FROZEN_DEVICE_FILENAME);

    if (!existsSync(copy)) {
      throw new Error(`${copy} was not written.`);
    }

    if (sha256(copy) !== expected) {
      throw new Error(`${copy} differs from ${devicePath}.`);
    }
  }
}

/**
 * Hash a file.
 *
 * @param path - The file to hash
 * @returns Its SHA-256, hex
 */
function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}
