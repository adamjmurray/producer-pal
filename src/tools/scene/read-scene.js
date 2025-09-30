import { readClip } from "../clip/read-clip";
import {
  parseIncludeArray,
  READ_SCENE_DEFAULTS,
} from "../shared/include-params.js";

/**
 * Read comprehensive information about a scene
 * @param {Object} args - The parameters
 * @param {number} [args.sceneIndex] - Scene index (0-based)
 * @param {string} [args.sceneId] - Scene ID to directly access any scene
 * @param {string[]} [args.include=[]] - Array of data to include
 * @returns {Object} Result object with scene information
 */
export function readScene(args = {}) {
  const { sceneIndex, sceneId } = args;

  // Validate parameters
  if (sceneId == null && sceneIndex == null) {
    throw new Error("Either sceneId or sceneIndex must be provided");
  }

  const includeFlags = parseIncludeArray(args.include, READ_SCENE_DEFAULTS);
  const liveSet = new LiveAPI(`live_set`);

  let scene;
  let resolvedSceneIndex = sceneIndex;

  if (sceneId != null) {
    // Use sceneId to access scene directly
    scene = LiveAPI.from(sceneId);
    if (!scene.exists()) {
      throw new Error(`No scene exists for sceneId "${sceneId}"`);
    }

    // Determine scene index from the scene's path
    resolvedSceneIndex = scene.sceneIndex;
  } else {
    scene = new LiveAPI(`live_set scenes ${sceneIndex}`);
  }

  if (!scene.exists()) {
    return {
      id: null,
      name: null,
      sceneIndex: resolvedSceneIndex,
    };
  }

  const isTempoEnabled = scene.getProperty("tempo_enabled") > 0;
  const isTimeSignatureEnabled =
    scene.getProperty("time_signature_enabled") > 0;

  const sceneName = scene.getProperty("name");
  const result = {
    id: scene.id,
    name: sceneName
      ? `${sceneName} (${resolvedSceneIndex + 1})`
      : `${resolvedSceneIndex + 1}`,
    sceneIndex: resolvedSceneIndex,
    color: scene.getColor(),
    isEmpty: scene.getProperty("is_empty") > 0,
    tempo: isTempoEnabled ? scene.getProperty("tempo") : "disabled",
    timeSignature: isTimeSignatureEnabled ? scene.timeSignature : "disabled",
  };

  // Only include triggered when scene is triggered
  const isTriggered = scene.getProperty("is_triggered") > 0;
  if (isTriggered) {
    result.triggered = true;
  }

  if (includeFlags.includeClips) {
    result.clips = liveSet
      .getChildIds("tracks")
      .map((_trackId, trackIndex) =>
        readClip({
          trackIndex,
          sceneIndex: resolvedSceneIndex,
          include: args.include,
        }),
      )
      .filter((clip) => clip.id != null);
  }

  return result;
}
