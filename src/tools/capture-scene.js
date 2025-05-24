// src/tools/capture-scene.js

/**
 * Captures the currently playing clips into a new scene
 * @param {Object} args - The parameters
 * @param {number} [args.sceneIndex] - Optional scene index to select before capturing
 * @param {string} [args.name] - Optional name for the captured scene
 * @returns {Object} Result object with information about the captured scene
 */
export function captureScene({ sceneIndex, name } = {}) {
  const liveSet = new LiveAPI("live_set");
  const appView = new LiveAPI("live_set view");

  if (sceneIndex != null) {
    const scene = new LiveAPI(`live_set scenes ${sceneIndex}`);
    appView.set("selected_scene", `id ${scene.id}`);
  }

  const selectedScene = new LiveAPI("live_set view selected_scene");
  const selectedSceneIndex = Number.parseInt(selectedScene.path.match(/live_set scenes (\d+)/)?.[1]);
  if (Number.isNaN(selectedSceneIndex)) {
    throw new Error(`capture-scene failed: couldn't determine selected scene index`);
  }

  liveSet.call("capture_and_insert_scene");

  const newSceneIndex = selectedSceneIndex + 1;
  const newScene = new LiveAPI(`live_set scenes ${newSceneIndex}`);

  if (name != null) {
    newScene.set("name", name);
  }

  // Build optimistic result object
  const result = {
    id: newScene.id,
    sceneIndex: newSceneIndex,
  };

  // Only include properties that were actually set
  if (name != null) result.name = name;

  return result;
}
