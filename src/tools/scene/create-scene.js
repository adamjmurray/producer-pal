import { MAX_AUTO_CREATED_SCENES } from "#src/tools/constants.js";
import { select } from "#src/tools/control/select.js";
import { captureScene } from "./capture-scene.js";
import {
  applyTempoProperty,
  applyTimeSignatureProperty,
} from "./scene-helpers.js";

/**
 * Creates new scenes at the specified index or captures currently playing clips
 * @param {object} args - The scene parameters
 * @param {number} [args.sceneIndex] - Scene index (0-based) where to insert new scenes. Required when capture=false, optional when capture=true
 * @param {number} [args.count=1] - Number of scenes to create (ignored when capture=true)
 * @param {boolean} [args.capture=false] - Capture currently playing Session clips instead of creating empty scenes
 * @param {string} [args.name] - Base name for the scenes
 * @param {string} [args.color] - Color for the scenes (CSS format: hex)
 * @param {number|null} [args.tempo] - Tempo in BPM for the scenes. Pass -1 to disable.
 * @param {string|null} [args.timeSignature] - Time signature in format "4/4". Pass "disabled" to disable.
 * @param {boolean} [args.switchView=false] - Automatically switch to session view
 * @param {object} _context - Internal context object (unused)
 * @returns {object | Array<object>} Single scene object when count=1, array when count>1
 */
export function createScene(
  {
    sceneIndex,
    count = 1,
    capture = false,
    name,
    color,
    tempo,
    timeSignature,
    switchView,
  } = {},
  _context = {},
) {
  // Handle capture mode
  if (capture) {
    const result = captureScene({ sceneIndex, name });

    applyCaptureProperties(result, { color, tempo, timeSignature });

    if (switchView) {
      select({ view: "session" });
    }

    return result;
  }

  // Create mode
  validateCreateSceneArgs(sceneIndex, count);

  // After validation, sceneIndex is guaranteed to be a number
  const validatedSceneIndex = /** @type {number} */ (sceneIndex);

  const liveSet = LiveAPI.from("live_set");

  ensureSceneCountForIndex(liveSet, validatedSceneIndex);

  const createdScenes = [];
  let currentIndex = validatedSceneIndex;

  for (let i = 0; i < count; i++) {
    const sceneResult = createSingleScene(
      liveSet,
      currentIndex,
      i,
      count,
      name,
      color,
      tempo,
      timeSignature,
    );

    createdScenes.push(sceneResult);
    currentIndex++;
  }

  if (switchView) {
    select({ view: "session" });
  }

  return count === 1 ? /** @type {object} */ (createdScenes[0]) : createdScenes;
}

/**
 * Applies scene properties (color, tempo, timeSignature) to a scene
 * @param {LiveAPI} scene - The LiveAPI scene object
 * @param {object} props - Properties to apply
 * @param {string | undefined} [props.color] - Color for the scene (CSS format: hex)
 * @param {number | null | undefined} [props.tempo] - Tempo in BPM
 * @param {string | null | undefined} [props.timeSignature] - Time signature in format "4/4"
 */
function applySceneProperties(scene, { color, tempo, timeSignature }) {
  if (color != null) {
    scene.setColor(color);
  }

  applyTempoProperty(scene, tempo);
  applyTimeSignatureProperty(scene, timeSignature);
}

/**
 * Builds the scene name based on index and count
 * @param {string | null | undefined} name - Base name for the scene
 * @param {number} index - 0-based index of the scene being created
 * @param {number} count - Total count of scenes being created
 * @returns {string | undefined} The computed scene name
 */
function buildSceneName(name, index, count) {
  if (name == null) {
    return;
  }

  if (count === 1 || index === 0) {
    return name;
  }

  return `${name} ${index + 1}`;
}

/**
 * Validates arguments for create scene mode
 * @param {number | undefined} sceneIndex - The scene index
 * @param {number} count - The number of scenes to create
 */
function validateCreateSceneArgs(sceneIndex, count) {
  if (sceneIndex == null) {
    throw new Error("createScene failed: sceneIndex is required");
  }

  if (count < 1) {
    throw new Error("createScene failed: count must be at least 1");
  }

  if (sceneIndex + count > MAX_AUTO_CREATED_SCENES) {
    throw new Error(
      `createScene failed: creating ${count} scenes at index ${sceneIndex} would exceed the maximum allowed scenes (${MAX_AUTO_CREATED_SCENES})`,
    );
  }
}

/**
 * Ensures enough scenes exist to insert at the specified index
 * @param {LiveAPI} liveSet - The LiveAPI live_set object
 * @param {number} sceneIndex - The target scene index
 */
function ensureSceneCountForIndex(liveSet, sceneIndex) {
  const currentSceneCount = liveSet.getChildIds("scenes").length;

  if (sceneIndex > currentSceneCount) {
    const scenesToPad = sceneIndex - currentSceneCount;

    for (let i = 0; i < scenesToPad; i++) {
      liveSet.call("create_scene", -1);
    }
  }
}

/**
 * Applies scene properties in capture mode
 * @param {{ sceneIndex: number }} result - The capture result object
 * @param {object} props - Properties to apply
 * @param {string | undefined} [props.color] - Color for the scene
 * @param {number | null | undefined} [props.tempo] - Tempo in BPM
 * @param {string | null | undefined} [props.timeSignature] - Time signature
 */
function applyCaptureProperties(result, props) {
  const { color, tempo, timeSignature } = props;

  if (color != null || tempo != null || timeSignature != null) {
    const scene = LiveAPI.from(`live_set scenes ${result.sceneIndex}`);

    applySceneProperties(scene, { color, tempo, timeSignature });
  }
}

/**
 * Creates a single scene with the specified properties
 * @param {LiveAPI} liveSet - The LiveAPI live_set object
 * @param {number} sceneIndex - The scene index
 * @param {number} creationIndex - 0-based index in the creation sequence
 * @param {number} count - Total count of scenes being created
 * @param {string | undefined} name - Base name for the scene
 * @param {string | undefined} color - Color for the scene
 * @param {number | null | undefined} tempo - Tempo for the scene
 * @param {string | null | undefined} timeSignature - Time signature for the scene
 * @returns {{ id: string, sceneIndex: number }} The created scene object
 */
function createSingleScene(
  liveSet,
  sceneIndex,
  creationIndex,
  count,
  name,
  color,
  tempo,
  timeSignature,
) {
  liveSet.call("create_scene", sceneIndex);
  const scene = LiveAPI.from(`live_set scenes ${sceneIndex}`);

  const sceneName = buildSceneName(name, creationIndex, count);

  if (sceneName != null) {
    scene.set("name", sceneName);
  }

  applySceneProperties(scene, { color, tempo, timeSignature });

  return {
    id: scene.id,
    sceneIndex,
  };
}
