// device/tool-write-scene.js
const { readScene } = require("./tool-read-scene");
const { sleep, DEFAULT_SLEEP_TIME_AFTER_WRITE } = require("./sleep");
const { MAX_AUTO_CREATED_SCENES } = require("./tool-write-clip");

/**
 * Updates a scene at the specified index
 * @param {Object} args - The scene parameters
 * @param {number} args.sceneIndex - Scene index (0-based)
 * @param {string} [args.name] - Optional scene name
 * @param {string} [args.color] - Optional scene color (CSS format: hex, rgb(), or named color)
 * @param {number} [args.tempo] - Optional scene tempo BPM
 * @param {boolean} [args.isTempoEnabled] - Optional flag to enable/disable scene tempo
 * @param {string} [args.timeSignature] - Optional time signature in format "4/4"
 * @param {boolean} [args.isTimeSignatureEnabled] - Optional flag to enable/disable scene time signature
 * @param {boolean} [args.trigger] - Optional flag to trigger the scene
 * @returns {Object} Result object with scene information
 */
async function writeScene({
  sceneIndex,
  name,
  color,
  tempo,
  isTempoEnabled,
  timeSignature,
  isTimeSignatureEnabled,
  trigger,
} = {}) {
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

  if (tempo != null) {
    scene.set("tempo", tempo);
  }

  if (isTempoEnabled != null) {
    scene.set("tempo_enabled", isTempoEnabled);
  }

  if (timeSignature != null) {
    const match = timeSignature.match(/^(\d+)\/(\d+)$/);
    if (!match) {
      throw new Error('Time signature must be in format "n/m" (e.g. "4/4")');
    }
    const numerator = parseInt(match[1], 10);
    const denominator = parseInt(match[2], 10);
    scene.set("time_signature_numerator", numerator);
    scene.set("time_signature_denominator", denominator);
  }

  if (isTimeSignatureEnabled != null) {
    scene.set("time_signature_enabled", isTimeSignatureEnabled);
  }

  if (trigger === true) {
    scene.call("fire");
    // clip triggered/playing state won't be updated until we wait a moment
    await sleep(DEFAULT_SLEEP_TIME_AFTER_WRITE);
  }

  return readScene({ sceneIndex });
}

module.exports = { writeScene };
