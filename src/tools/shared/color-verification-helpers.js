import * as console from "#src/shared/v8-max-console.js";

/**
 * Verifies if a color was quantized by Live's palette and emits warning if changed.
 *
 * When a color is set via the Live API, Live may quantize it to the nearest color
 * in its fixed palette (~70 colors). This function reads back the actual color that
 * was set and compares it to the requested color. If they differ, a warning is
 * emitted to inform the user.
 *
 * @param {LiveAPI} object - LiveAPI object (Track, Scene, or Clip) with getColor() and type property
 * @param {string} requestedColor - The color that was requested in #RRGGBB format
 */
export function verifyColorQuantization(object, requestedColor) {
  try {
    const actualColor = object.getColor();

    // Case-insensitive comparison (handles #ff0000 vs #FF0000)
    if (actualColor?.toUpperCase() !== requestedColor.toUpperCase()) {
      const objectType = object.type;

      console.error(
        `Note: Requested ${objectType.toLowerCase()} color ${requestedColor} was mapped to nearest palette color ${actualColor}. Live uses a fixed color palette.`,
      );
    }
  } catch (error) {
    // If getColor fails, log warning but don't break the tool
    console.error(
      `Warning: Could not verify color quantization: ${error.message}`,
    );
  }
}
