// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// `npm run release:amxd` freezes the .amxd (so can `npm run device:freeze` or Max),
// and nothing ties the file to the build it came from. These checks do: the
// portal ships a copy of it, so a stale freeze would hand users last release's
// device, and a freeze of a debug build would hand them its dev-only features.

import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { DEV_BUILD_MARKER } from "../build-flag-guard.ts";
import { checkBuildVersion, readBuildInfo } from "./build-info.ts";
import { isFrozenAmxd } from "./device-freeze/amxd-container.ts";

/** Must equal BUNDLED_DEVICE_FILENAME in src/portal/setup/bundled-device.ts. */
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
 * What to print when bytes come from a build with dev-only flags on, which must
 * never ship.
 *
 * @param name - What the bytes are (a path or file name), for the message
 * @param bytes - The bytes to inspect
 * @returns The refusal, or null when they carry no dev-build marker
 */
export function checkNotDevBuild(
  name: string,
  bytes: Buffer | Uint8Array,
): string | null {
  if (!Buffer.from(bytes).includes(DEV_BUILD_MARKER)) {
    return null;
  }

  return `${name} was built with dev-only build flags (a debug build). It must not ship.`;
}

/**
 * Check that a device file is a release build carrying this version's marker.
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

  const bytes = readFileSync(devicePath);
  const devBuild = checkNotDevBuild(devicePath, bytes);

  if (devBuild != null) {
    return devBuild;
  }

  if (!bytes.includes(versionMarker(version))) {
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
      "Run `npm run release:amxd`, which freezes it (dev/process/releasing.md, Step 1).",
    ].join("\n");
  }

  if (!isFrozenAmxd(readFileSync(devicePath))) {
    return [
      `release/${FROZEN_DEVICE_FILENAME} is not frozen (it is an editable device).`,
      "Run `npm run release:amxd`, which freezes it, or freeze it in Max.",
    ].join("\n");
  }

  const buildRefusal = checkBuildVersion(readBuildInfo(releaseDir), version);

  if (buildRefusal != null) {
    return [...buildRefusal, "Then run `npm run release:amxd`."].join("\n");
  }

  const mismatch = checkDeviceVersion(devicePath, version);

  if (mismatch != null) {
    return `${mismatch}\nRun \`npm run release:amxd\` again.`;
  }

  // The marker can't tell an earlier build of this version; the age can.
  if (
    statSync(devicePath).mtimeMs <
    statSync(join(releaseDir, "build-info.json")).mtimeMs
  ) {
    return [
      `release/${FROZEN_DEVICE_FILENAME} is older than release/build-info.json.`,
      "It was frozen from an earlier build. Run `npm run release:amxd`.",
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
