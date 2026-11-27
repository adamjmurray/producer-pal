// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { VERSION } from "#src/shared/config.ts";
import { isNewerVersion } from "#src/shared/version-check.ts";
import { type RunningDevice } from "./running-device.ts";

/**
 * @param device - The bridge's connection to the running device
 * @returns The running version when it is older than this portal's. Throws
 *   when the device doesn't answer.
 */
export async function olderDevice(
  device: RunningDevice,
): Promise<string | null> {
  // Always ask afresh: the device answers each request on its own, so a
  // connection made to one version keeps working after another replaces it.
  device.reset();
  await device.connect();

  const version = device.version();

  return version != null && isNewerVersion(version, VERSION) ? version : null;
}
