// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { assertDefined } from "#src/shared/error-message.ts";
import { extractDevicePath } from "#src/tools/shared/device/helpers/path/insertion-path.ts";

/**
 * Calculate the default destination: position after the original device on the same track
 * @param devicePath - Full Live API path of the source device
 * @returns Simplified path for destination
 */
export function calculateDefaultDestination(devicePath: string): string {
  // Never null: a device's path starts with its track's.
  const simplifiedPath = assertDefined(
    extractDevicePath(devicePath),
    `device path for "${devicePath}"`,
  );

  // Parse the path to increment the last device index
  const segments = simplifiedPath.split("/");
  const lastSegment = segments.at(-1);

  if (lastSegment?.startsWith("d")) {
    const deviceIndex = Number.parseInt(lastSegment.slice(1));

    segments[segments.length - 1] = `d${deviceIndex + 1}`;

    return segments.join("/");
  }

  // Fallback: append to the container
  return simplifiedPath;
}
