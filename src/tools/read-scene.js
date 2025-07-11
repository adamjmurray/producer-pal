// src/tools/read-scene.js
import { readClip } from "./read-clip";

/**
 * Read comprehensive information about a scene
 * @param {Object} args - The parameters
 * @param {number} args.sceneIndex - Scene index (0-based)
 * @param {boolean} [args.includeClips=false] - Whether to include clip information
 * @param {boolean} [args.includeNotes=true] - Whether to include notes data in clips
 * @returns {Object} Result object with scene information
 */
export function readScene({
  sceneIndex,
  includeClips = false,
  includeNotes = true,
}) {
  const liveSet = new LiveAPI(`live_set`);
  const scene = new LiveAPI(`live_set scenes ${sceneIndex}`);

  if (!scene.exists()) {
    return {
      id: null,
      name: null,
      sceneIndex,
    };
  }

  const isTempoEnabled = scene.getProperty("tempo_enabled") > 0;
  const isTimeSignatureEnabled =
    scene.getProperty("time_signature_enabled") > 0;

  const sceneName = scene.getProperty("name");
  const result = {
    id: scene.id,
    name: sceneName ? `${sceneName} (${sceneIndex + 1})` : `${sceneIndex + 1}`,
    sceneIndex,
    color: scene.getColor(),
    isEmpty: scene.getProperty("is_empty") > 0,
    tempo: isTempoEnabled ? scene.getProperty("tempo") : "disabled",
    timeSignature: isTimeSignatureEnabled
      ? `${scene.getProperty("time_signature_numerator")}/${scene.getProperty("time_signature_denominator")}`
      : "disabled",
  };

  // Only include triggered when scene is triggered
  const isTriggered = scene.getProperty("is_triggered") > 0;
  if (isTriggered) {
    result.triggered = true;
  }

  if (includeClips) {
    result.clips = liveSet
      .getChildIds("tracks")
      .map((_trackId, trackIndex) =>
        readClip({ trackIndex, clipSlotIndex: sceneIndex, includeNotes }),
      )
      .filter((clip) => clip.id != null);
  }

  return result;
}
