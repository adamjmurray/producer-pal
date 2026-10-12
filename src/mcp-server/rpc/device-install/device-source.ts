// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// Where the running device's .amxd file is. Only the device's patcher knows,
// so V8 reports it (see live-api-adapter/device-report.ts) and Node keeps it
// for the length of the process.

import Max from "max-api";
import { libraryPathExists } from "#src/mcp-server/rpc/remote-script/user-library/user-library-fs.ts";
import { maxPathToPosix } from "./max-file-path.ts";

// A frozen device's patcher body starts with `mx@c` at byte 32. An unfrozen
// one is plain JSON that points at sibling files, so a copy of it is useless.
const FROZEN_MARKER = Buffer.from("mx@c");
const FROZEN_MARKER_OFFSET = 32;

let sourcePath: string | null = null;

/**
 * Remember where V8 says the device file is.
 *
 * @param filepath - The patcher's `filepath` in Max's form
 * @returns The OS path now remembered, or null when `filepath` isn't one (the
 *   earlier path is kept)
 */
export function recordDeviceSource(filepath: string): string | null {
  const path = maxPathToPosix(filepath, libraryPathExists);

  if (path != null) {
    sourcePath = path;
  }

  return path;
}

/**
 * @returns The running device's file, or null until the device has said
 */
export function deviceSourcePath(): string | null {
  return sourcePath;
}

/** Forget the reported path. For test setup only. */
export function resetDeviceSource(): void {
  sourcePath = null;
}

/**
 * Ask the device to report where it is again. Safe to repeat. The device
 * answers through the `device.report` route.
 */
export function askDeviceToReport(): void {
  // Rides the "config" outlet: it's the one Node → V8 message the patch
  // passes on by name. The 1 is a dummy value, as for `updateDismissed`.
  void Max.outlet("config", "reportDevice", 1);
}

/**
 * @param bytes - Contents of an .amxd file
 * @returns Whether it's a frozen device, which carries everything it needs
 */
export function isFrozenDevice(bytes: Buffer): boolean {
  return bytes
    .subarray(FROZEN_MARKER_OFFSET, FROZEN_MARKER_OFFSET + FROZEN_MARKER.length)
    .equals(FROZEN_MARKER);
}
