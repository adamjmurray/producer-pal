// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: AGPL-3.0-or-later

import { errorMessage } from "#src/shared/error-utils.ts";
import * as console from "#src/shared/v8-max-console.ts";

/**
 * Verifies if a color was quantized by Live's palette and emits warning if changed.
 *
 * When a color is set via the Live API, Live may quantize it to the nearest color
 * in its fixed palette (~70 colors). This function reads back the actual color that
 * was set and compares it to the requested color. If they differ, a warning is
 * emitted to inform the user.
 * @param object - LiveAPI object (Track, Scene, or Clip)
 * @param requestedColor - The color that was requested in #RRGGBB format
 */
export function verifyColorQuantization(
  object: LiveAPI,
  requestedColor: string,
): void {
  try {
    const actualColor = object.getColor();

    // Case-insensitive comparison (handles #ff0000 vs #FF0000)
    if (actualColor?.toUpperCase() !== requestedColor.toUpperCase()) {
      const objectType = object.type;

      console.warn(
        `Requested ${objectType.toLowerCase()} color ${requestedColor} was mapped to nearest palette color ${actualColor}. Live uses a fixed color palette.`,
      );
    }
  } catch (error) {
    // If getColor fails, log warning but don't break the tool
    console.warn(`Could not verify color quantization: ${errorMessage(error)}`);
  }
}
