// src/tools/read-scene.js
import { readClip } from "./read-clip";
import { convertIncludeParams, READ_SCENE_DEFAULTS } from "./include-params.js";

/**
 * Read comprehensive information about a scene
 * @param {Object} args - The parameters
 * @param {number} args.sceneIndex - Scene index (0-based)
 * @param {string[]} [args.include=[]] - Array of data to include
 * @returns {Object} Result object with scene information
 */
export function readScene(args = {}) {
  const { sceneIndex } = args;

  // Support both new include array format and legacy individual parameters
  const includeOrLegacyParams =
    args.include !== undefined ? args.include : args;

  const { includeClips, includeNotes } = convertIncludeParams(
    includeOrLegacyParams,
    READ_SCENE_DEFAULTS,
  );
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
    timeSignature: isTimeSignatureEnabled ? scene.timeSignature : "disabled",
  };

  // Only include triggered when scene is triggered
  const isTriggered = scene.getProperty("is_triggered") > 0;
  if (isTriggered) {
    result.triggered = true;
  }

  if (includeClips) {
    // For backward compatibility: if 'notes' is explicitly in the include array, use that setting
    // Otherwise, let readClip use its own default (true)
    const includeArray = Array.isArray(includeOrLegacyParams) ? includeOrLegacyParams : [];
    const notesExplicitlyRequested = includeArray.includes("notes");
    const clipIncludeNotes = notesExplicitlyRequested ? includeNotes : undefined;
    
    result.clips = liveSet
      .getChildIds("tracks")
      .map((_trackId, trackIndex) =>
        readClip({ trackIndex, clipSlotIndex: sceneIndex, includeNotes: clipIncludeNotes }),
      )
      .filter((clip) => clip.id != null);
  }

  return result;
}
