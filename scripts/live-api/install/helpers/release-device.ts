// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { existsSync } from "node:fs";
import { join } from "node:path";
import { type DeviceInstallResult } from "#src/portal/setup/device-install.ts";
import { DEVICE_FILE_NAME } from "#src/portal/setup/device-file-status.ts";

/**
 * Where `npm run release:amxd` leaves the frozen device.
 *
 * @param rootDir - The repo root
 * @returns Absolute path to the release device, built or not
 */
export function releaseDevicePath(rootDir: string): string {
  return join(rootDir, "release", DEVICE_FILE_NAME);
}

/**
 * The release device, which has to be built first.
 *
 * @param rootDir - The repo root
 * @returns Absolute path to the release device
 * @throws {Error} When it hasn't been built
 */
export function requireReleaseDevice(rootDir: string): string {
  const file = releaseDevicePath(rootDir);

  if (!existsSync(file)) {
    throw new Error(`${file} not found. Run \`npm run release:amxd\` first.`);
  }

  return file;
}

/**
 * Say what a device install did, for printing.
 *
 * @param result - What `installDevice` returned
 * @returns Lines to print, and whether the device ended up as asked
 */
export function describeDeviceInstall(result: DeviceInstallResult): {
  lines: string[];
  ok: boolean;
} {
  const lines = [result.detail, `Device: ${result.path}`];

  if (result.previousVersion != null || result.bundledVersion != null) {
    lines.push(
      `Version: ${result.previousVersion ?? "none"} -> ${result.bundledVersion ?? "unknown"}`,
    );
  }

  if (result.outcome === "skipped") {
    lines.push("Use `npm run install:device -- --force` to replace it.");
  }

  if (result.error != null) {
    lines.push(`Error: ${result.error}`);
  }

  if (result.otherCopies.length > 0) {
    lines.push(
      `WARNING: ${result.otherCopies.length} other Producer_Pal .amxd ${result.otherCopies.length === 1 ? "copy" : "copies"} in the User Library, which makes adding the device to a Set ambiguous:`,
      ...result.otherCopies.map((path) => `  ${path}`),
      "Delete the extras so Live's browser shows one Producer Pal.",
    );
  }

  return {
    lines,
    ok:
      result.outcome === "installed" ||
      result.outcome === "updated" ||
      result.outcome === "current",
  };
}
