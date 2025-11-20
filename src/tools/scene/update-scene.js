import { validateIdTypes } from "../shared/id-validation.js";
import { parseCommaSeparatedIds, parseTimeSignature } from "../shared/utils.js";

/**
 * Updates properties of existing scenes
 * @param {object} args - The scene parameters
 * @param {string} args.ids - Scene ID or comma-separated list of scene IDs to update
 * @param {string} [args.name] - Optional scene name
 * @param {string} [args.color] - Optional scene color (CSS format: hex)
 * @param {number|null} [args.tempo] - Optional scene tempo BPM. Pass -1 to disable.
 * @param {string|null} [args.timeSignature] - Optional time signature in format "4/4". Pass "disabled" to disable.
 * @param {object} _context - Internal context object (unused)
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

  // Return single object if one valid result, array for multiple results or empty array for none
  if (updatedScenes.length === 0) {
    return [];
  }
  return updatedScenes.length === 1 ? updatedScenes[0] : updatedScenes;
}
