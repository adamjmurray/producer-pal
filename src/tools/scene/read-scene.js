import { readClip } from "../clip/read-clip";
import { validateIdType } from "../shared/id-validation.js";
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
export function readScene(args = {}, _context = {}) {
  const { sceneIndex, sceneId } = args;

  // Validate parameters
  if (sceneId == null && sceneIndex == null) {
    throw new Error("Either sceneId or sceneIndex must be provided");
  }

  const { includeClips, includeColor } = parseIncludeArray(
    args.include,
    READ_SCENE_DEFAULTS,
  );
  const liveSet = new LiveAPI(`live_set`);

  let scene;
  let resolvedSceneIndex = sceneIndex;

  if (sceneId != null) {
    // Use sceneId to access scene directly and validate it's a scene
    scene = validateIdType(sceneId, "scene", "readScene");

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
    ...(includeColor && { color: scene.getColor() }),
  };

  // Only include tempo/timeSignature when enabled
  if (isTempoEnabled) {
    result.tempo = scene.getProperty("tempo");
  }
  if (isTimeSignatureEnabled) {
    result.timeSignature = scene.timeSignature;
  }

  // Only include triggered when scene is triggered
  const isTriggered = scene.getProperty("is_triggered") > 0;
  if (isTriggered) {
    result.triggered = true;
  }

  if (includeClips) {
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
  } else {
    // When not including full clip details, just return the count
    result.clipCount = liveSet
      .getChildIds("tracks")
      .map((_trackId, trackIndex) =>
        readClip({
          trackIndex,
          sceneIndex: resolvedSceneIndex,
          include: [],
        }),
      )
      .filter((clip) => clip.id != null).length;
  }

  return result;
}
