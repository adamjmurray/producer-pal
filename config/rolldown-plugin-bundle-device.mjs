// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { copyFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

/** Must equal BUNDLED_DEVICE_FILENAME in src/portal/bundled-device.ts. */
export const DEVICE_FILENAME = "Producer_Pal.amxd";

/**
 * Rolldown plugin that ships the frozen Max device next to the portal script.
 *
 * With a `deviceFile` it copies that file into each folder. Without one it
 * deletes any copy a release package left behind, so a plain build never ships
 * a stale device and the portal reports "no device bundled".
 *
 * The device is never imported, so it cannot end up inside a bundle (the
 * device's own bundle least of all, which would make the .amxd contain
 * itself). Runs at writeBundle, so in-memory builds in tests touch nothing.
 *
 * @param options - `{ dirs, deviceFile }`: folders beside the portal, and the frozen .amxd to copy (or null)
 * @returns The plugin
 */
export function bundleDevice({ dirs, deviceFile }) {
  return {
    name: "bundle-device",
    writeBundle() {
      for (const dir of dirs) {
        const target = join(dir, DEVICE_FILENAME);

        if (deviceFile == null || deviceFile === "") {
          rmSync(target, { force: true });
        } else {
          mkdirSync(dir, { recursive: true });
          copyFileSync(deviceFile, target);
        }
      }
    },
  };
}
