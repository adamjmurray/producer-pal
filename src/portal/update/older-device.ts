// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { VERSION } from "#src/shared/config.ts";
import { isNewerVersion } from "#src/shared/version-check.ts";
import { type RunningDevice } from "./running-device.ts";

/**
 * @param device - The bridge's connection to the running device
 * @returns The running version when it is older than this portal's
 */
export async function olderDevice(
  device: RunningDevice,
): Promise<string | null> {
  if (!isOlder(device.version())) {
    return null;
  }

  // The connection may predate a manual update, so ask the device afresh.
  device.reset();
  await device.connect();

  const version = device.version();

  return version != null && isOlder(version) ? version : null;
}

/**
 * @param version - A device version, if known
 * @returns True when it is known and older than this portal's
 */
function isOlder(version: string | undefined): boolean {
  return version != null && isNewerVersion(version, VERSION);
}
