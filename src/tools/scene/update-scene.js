import { verifyColorQuantization } from "#src/tools/shared/color-verification-helpers.js";
import {
  parseCommaSeparatedIds,
  parseTimeSignature,
  unwrapSingleResult,
} from "#src/tools/shared/utils.js";
import { validateIdTypes } from "#src/tools/shared/validation/id-validation.js";

/**
 * Updates properties of existing scenes
 * @param {{ ids?: string, name?: string, color?: string, tempo?: number | null, timeSignature?: string | null }} [args] - The scene parameters
 * @param {object} [_context] - Internal context object (unused)
 * @returns {object | Array<object>} Single scene object or array of scene objects
 */
export function updateScene(
  { ids, name, color, tempo, timeSignature } = {},
  _context = {},
) {
  if (!ids) {
    throw new Error("updateScene failed: ids is required");
  }

  // Parse comma-separated string into array
  const sceneIds = parseCommaSeparatedIds(ids);

  // Validate all IDs are scenes, skip invalid ones
  const scenes = validateIdTypes(sceneIds, "scene", "updateScene", {
    skipInvalid: true,
  });

  const updatedScenes = [];

  for (const scene of scenes) {
    // Update properties if provided
    if (name != null) {
      scene.set("name", name);
    }

    if (color != null) {
      scene.setColor(color);
      verifyColorQuantization(scene, color);
    }

    // Handle tempo - explicit -1 disables, non-null enables
    if (tempo === -1) {
      scene.set("tempo_enabled", false);
    } else if (tempo != null) {
      scene.set("tempo", tempo);
      scene.set("tempo_enabled", true);
    }

    // Handle time signature - explicit "disabled" disables, non-null enables
    if (timeSignature === "disabled") {
      scene.set("time_signature_enabled", false);
    } else if (timeSignature != null) {
      const parsed = parseTimeSignature(timeSignature);

      scene.set("time_signature_numerator", parsed.numerator);
      scene.set("time_signature_denominator", parsed.denominator);
      scene.set("time_signature_enabled", true);
    }

    // Build optimistic result object
    updatedScenes.push({
      id: scene.id,
    });
  }

  return unwrapSingleResult(updatedScenes);
}
