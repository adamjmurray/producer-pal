// src/tool-write-scene.js
import { readScene } from "./tool-read-scene";
import { MAX_AUTO_CREATED_SCENES } from "./tool-write-clip";

/**
 * Updates a scene at the specified index
 * @param {Object} args - The scene parameters
 * @param {number} args.sceneIndex - Scene index (0-based)
 * @param {string} [args.name] - Optional scene name
 * @param {string} [args.color] - Optional scene color (CSS format: hex, rgb(), or named color)
 * @param {number|null} [args.tempo] - Optional scene tempo BPM. Pass -1 to disable.
 * @param {string|null} [args.timeSignature] - Optional time signature in format "4/4". Pass "disabled" to disable.
 * @returns {Object} Result object with scene information
 */
export function writeScene({ sceneIndex, name, color, tempo, timeSignature } = {}) {
  const liveSet = new LiveAPI("live_set");
  const currentSceneCount = liveSet.getChildIds("scenes").length;

  if (sceneIndex >= MAX_AUTO_CREATED_SCENES) {
    throw new Error(`Scene index ${sceneIndex} exceeds the maximum allowed value of ${MAX_AUTO_CREATED_SCENES - 1}`);
  }

  if (sceneIndex >= currentSceneCount) {
    const scenesToCreate = sceneIndex - currentSceneCount + 1;
    for (let i = 0; i < scenesToCreate; i++) {
      liveSet.call("create_scene", -1); // -1 means append at the end
    }
  }

  const scene = new LiveAPI(`live_set scenes ${sceneIndex}`);

  if (name != null) {
    scene.set("name", name);
  }

  if (color != null) {
    scene.setColor(color);
  }

  // Handle tempo - explicit null disables, non-null enables (it can also be undefined, which will do nothing)
  if (tempo === -1) {
    scene.set("tempo_enabled", false);
  } else if (tempo != null) {
    scene.set("tempo", tempo);
    scene.set("tempo_enabled", true);
  }

  // Handle time signature - explicit null disables, non-null enables (it can also be undefined, which will do nothing)
  if (timeSignature === "disabled") {
    scene.set("time_signature_enabled", false);
  } else if (timeSignature != null) {
    const match = timeSignature.match(/^(\d+)\/(\d+)$/);
    if (!match) {
      throw new Error('Time signature must be in format "n/m" (e.g. "4/4")');
    }
    const numerator = parseInt(match[1], 10);
    const denominator = parseInt(match[2], 10);
    scene.set("time_signature_numerator", numerator);
    scene.set("time_signature_denominator", denominator);
    scene.set("time_signature_enabled", true);
  }

  return readScene({ sceneIndex });
}
