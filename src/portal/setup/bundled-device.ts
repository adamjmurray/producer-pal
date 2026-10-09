// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The frozen device's name next to the portal. config/rolldown-plugin-bundle-
 * device.mjs and scripts/build-and-release/helpers/frozen-device.ts repeat it;
 * the bundled-device tests hold the three equal.
 */
export const BUNDLED_DEVICE_FILENAME = "Producer_Pal.amxd";

/**
 * Find the Max device that shipped with this portal. It is a plain file next to
 * the portal script, not embedded in it: 10 MB of base64 would be parsed on
 * every start for a feature used about once. Plain builds (dev, CI) bundle
 * none.
 *
 * @param portalDir - Folder holding the portal script; defaults to this bundle's own
 * @returns Absolute path of the bundled device, or null when none shipped
 */
export function findBundledDevice(
  portalDir: string = dirname(fileURLToPath(import.meta.url)),
): string | null {
  const devicePath = join(portalDir, BUNDLED_DEVICE_FILENAME);

  return existsSync(devicePath) ? devicePath : null;
}
