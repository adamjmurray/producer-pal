// src/tools/update-scene.js
import { parseCommaSeparatedIds, parseTimeSignature } from "./shared/utils.js";

/**
 * Updates properties of existing scenes
 * @param {Object} args - The scene parameters
 * @param {string} args.ids - Scene ID or comma-separated list of scene IDs to update
 * @param {string} [args.name] - Optional scene name
 * @param {string} [args.color] - Optional scene color (CSS format: hex)
 * @param {number|null} [args.tempo] - Optional scene tempo BPM. Pass -1 to disable.
 * @param {string|null} [args.timeSignature] - Optional time signature in format "4/4". Pass "disabled" to disable.
 * @returns {Object|Array<Object>} Single scene object or array of scene objects
 */
export function updateScene({ ids, name, color, tempo, timeSignature } = {}) {
  if (!ids) {
    throw new Error("updateScene failed: ids is required");
  }

  // Parse comma-separated string into array
  const sceneIds = parseCommaSeparatedIds(ids);

  const updatedScenes = [];

  for (const id of sceneIds) {
    // Convert string ID to LiveAPI path if needed
    const scene = LiveAPI.from(id);

    if (!scene.exists()) {
      throw new Error(
        `updateScene failed: scene with id "${id}" does not exist`,
      );
    }

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

    // Find sceneIndex for consistency with readScene format
    const sceneIndex = Number(scene.path.match(/live_set scenes (\d+)/)?.[1]);
    if (Number.isNaN(sceneIndex)) {
      throw new Error(
        `updateScene failed: could not determine sceneIndex for id "${id}" (path="${scene.path}")`,
      );
    }

    // Build optimistic result object
    const sceneResult = {
      id: scene.id,
      sceneIndex,
    };

    // Only include properties that were actually set
    if (name != null) sceneResult.name = name;
    if (color != null) sceneResult.color = color;
    if (tempo === -1) {
      sceneResult.tempo = "disabled";
    } else if (tempo != null) {
      sceneResult.tempo = tempo;
    }
    if (timeSignature === "disabled") {
      sceneResult.timeSignature = "disabled";
    } else if (timeSignature != null) {
      sceneResult.timeSignature = timeSignature;
    }

    updatedScenes.push(sceneResult);
  }

  // Return single object if single ID was provided, array if comma-separated IDs were provided
  return sceneIds.length > 1 ? updatedScenes : updatedScenes[0];
}
