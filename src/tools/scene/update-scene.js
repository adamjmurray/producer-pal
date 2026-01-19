import { verifyColorQuantization } from "#src/tools/shared/color-verification-helpers.js";
import {
  parseCommaSeparatedIds,
  unwrapSingleResult,
} from "#src/tools/shared/utils.js";
import { validateIdTypes } from "#src/tools/shared/validation/id-validation.js";
import {
  applyTempoProperty,
  applyTimeSignatureProperty,
} from "./scene-helpers.js";

/**
 * @typedef {object} UpdateSceneResult
 * @property {string} id - The scene ID
 */

/**
 * Updates properties of existing scenes
 * @param {{ ids?: string, name?: string, color?: string, tempo?: number | null, timeSignature?: string | null }} [args] - The scene parameters
 * @param {object} [_context] - Internal context object (unused)
 * @returns {UpdateSceneResult | UpdateSceneResult[]} Single scene object or array of scene objects
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

    applyTempoProperty(scene, tempo);
    applyTimeSignatureProperty(scene, timeSignature);

    // Build optimistic result object
    updatedScenes.push({
      id: scene.id,
    });
  }

  return /** @type {UpdateSceneResult | UpdateSceneResult[]} */ (
    unwrapSingleResult(updatedScenes)
  );
}
