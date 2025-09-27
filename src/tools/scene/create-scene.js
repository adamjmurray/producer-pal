import { MAX_AUTO_CREATED_SCENES } from "../constants.js";
import { parseTimeSignature } from "../shared/utils.js";
import { captureScene } from "./capture-scene.js";

/**
 * Creates new scenes at the specified index or captures currently playing clips
 * @param {Object} args - The scene parameters
 * @param {number} [args.sceneIndex] - Scene index (0-based) where to insert new scenes. Required when capture=false, optional when capture=true
 * @param {number} [args.count=1] - Number of scenes to create (ignored when capture=true)
 * @param {boolean} [args.capture=false] - Capture currently playing Session clips instead of creating empty scenes
 * @param {string} [args.name] - Base name for the scenes
 * @param {string} [args.color] - Color for the scenes (CSS format: hex)
 * @param {number|null} [args.tempo] - Tempo in BPM for the scenes. Pass -1 to disable.
 * @param {string|null} [args.timeSignature] - Time signature in format "4/4". Pass "disabled" to disable.
 * @returns {Object|Array<Object>} Single scene object when count=1, array when count>1
 */
export function createScene({
  sceneIndex,
  count = 1,
  capture = false,
  name,
  color,
  tempo,
  timeSignature,
} = {}) {
  // Handle capture mode
  if (capture) {
    // For capture mode, delegate to captureScene
    // Only name is supported from the capture-scene parameters
    const result = captureScene({ sceneIndex, name });

    // Apply additional properties if provided (color, tempo, timeSignature)
    if (color != null || tempo != null || timeSignature != null) {
      const scene = new LiveAPI(`live_set scenes ${result.sceneIndex}`);

      if (color != null) {
        scene.setColor(color);
        result.color = color;
      }

      // Handle tempo - explicit -1 disables, non-null enables
      if (tempo === -1) {
        scene.set("tempo_enabled", false);
        result.tempo = "disabled";
      } else if (tempo != null) {
        scene.set("tempo", tempo);
        scene.set("tempo_enabled", true);
        result.tempo = tempo;
      }

      // Handle time signature - explicit "disabled" disables, non-null enables
      if (timeSignature === "disabled") {
        scene.set("time_signature_enabled", false);
        result.timeSignature = "disabled";
      } else if (timeSignature != null) {
        const parsed = parseTimeSignature(timeSignature);
        scene.set("time_signature_numerator", parsed.numerator);
        scene.set("time_signature_denominator", parsed.denominator);
        scene.set("time_signature_enabled", true);
        result.timeSignature = timeSignature;
      }
    }

    return result;
  }

  // Original create mode validation
  if (sceneIndex == null) {
    throw new Error("createScene failed: sceneIndex is required");
  }

  if (count < 1) {
    throw new Error("createScene failed: count must be at least 1");
  }

  const liveSet = new LiveAPI("live_set");

  if (sceneIndex + count > MAX_AUTO_CREATED_SCENES) {
    throw new Error(
      `createScene failed: creating ${count} scenes at index ${sceneIndex} would exceed the maximum allowed scenes (${MAX_AUTO_CREATED_SCENES})`,
    );
  }

  // Ensure we have enough scenes to insert at the specified index
  const currentSceneCount = liveSet.getChildIds("scenes").length;
  if (sceneIndex > currentSceneCount) {
    const scenesToPad = sceneIndex - currentSceneCount;
    for (let i = 0; i < scenesToPad; i++) {
      liveSet.call("create_scene", -1); // -1 means append at the end
    }
  }

  const createdScenes = [];
  let currentIndex = sceneIndex;

  for (let i = 0; i < count; i++) {
    // Create scene at the specified index (Live API will shift existing scenes down)
    liveSet.call("create_scene", currentIndex);
    const scene = new LiveAPI(`live_set scenes ${currentIndex}`);

    // Build the scene name
    const sceneName =
      name != null
        ? count === 1
          ? name
          : i === 0
            ? name
            : `${name} ${i + 1}`
        : undefined;

    // Set properties if provided
    if (sceneName != null) {
      scene.set("name", sceneName);
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
    const sceneResult = {
      id: scene.id,
      sceneIndex: currentIndex,
    };

    // Only include properties that were actually set
    if (sceneName != null) sceneResult.name = sceneName;
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

    createdScenes.push(sceneResult);

    // For subsequent scenes, increment the index since scenes shift down
    currentIndex++;
  }

  // Return single object if count=1, array if count>1
  return count === 1 ? createdScenes[0] : createdScenes;
}
