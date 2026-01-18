import { readClip } from "#src/tools/clip/read/read-clip.js";
import {
  parseIncludeArray,
  READ_SCENE_DEFAULTS,
} from "#src/tools/shared/tool-framework/include-params.js";
import { validateIdType } from "#src/tools/shared/validation/id-validation.js";

/**
 * Read comprehensive information about a scene
 * @param {object} args - The parameters
 * @param {number} [args.sceneIndex] - Scene index (0-based)
 * @param {string} [args.sceneId] - Scene ID to directly access any scene
 * @param {string[]} [args.include=[]] - Array of data to include
 * @param {object} _context - Internal context object (unused)
 * @returns {object} Result object with scene information
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
  const liveSet = LiveAPI.from(`live_set`);

  let scene;
  /** @type {number | null | undefined} */
  let resolvedSceneIndex = sceneIndex;

  if (sceneId != null) {
    // Use sceneId to access scene directly and validate it's a scene
    scene = validateIdType(sceneId, "scene", "readScene");

    // Determine scene index from the scene's path
    resolvedSceneIndex = scene.sceneIndex;
  } else {
    scene = LiveAPI.from(`live_set scenes ${sceneIndex}`);
  }

  if (!scene.exists()) {
    return {
      id: null,
      name: null,
      sceneIndex: resolvedSceneIndex,
    };
  }

  const isTempoEnabled =
    /** @type {number} */ (scene.getProperty("tempo_enabled")) > 0;
  const isTimeSignatureEnabled =
    /** @type {number} */ (scene.getProperty("time_signature_enabled")) > 0;

  const sceneName = scene.getProperty("name");
  // resolvedSceneIndex is guaranteed to be a number at this point (either from sceneIndex param or scene.sceneIndex)
  const sceneNum = /** @type {number} */ (resolvedSceneIndex);
  /** @type {{ id: string, name: string, sceneIndex: number | null | undefined, color?: string | null, tempo?: unknown, timeSignature?: string | null, triggered?: boolean, clips?: object[], clipCount?: number }} */
  const result = {
    id: scene.id,
    name: sceneName ? `${sceneName} (${sceneNum + 1})` : `${sceneNum + 1}`,
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
  const isTriggered =
    /** @type {number} */ (scene.getProperty("is_triggered")) > 0;

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
