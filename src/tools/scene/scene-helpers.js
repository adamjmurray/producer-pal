import { parseTimeSignature } from "#src/tools/shared/utils.js";

/**
 * Applies tempo property to a scene
 * @param {LiveAPI} scene - The LiveAPI scene object
 * @param {number | null | undefined} tempo - Tempo in BPM. -1 disables, other values enable
 */
export function applyTempoProperty(scene, tempo) {
  if (tempo === -1) {
    scene.set("tempo_enabled", false);
  } else if (tempo != null) {
    scene.set("tempo", tempo);
    scene.set("tempo_enabled", true);
  }
}

/**
 * Applies time signature property to a scene
 * @param {LiveAPI} scene - The LiveAPI scene object
 * @param {string | null | undefined} timeSignature - Time signature. "disabled" disables, other values enable
 */
export function applyTimeSignatureProperty(scene, timeSignature) {
  if (timeSignature === "disabled") {
    scene.set("time_signature_enabled", false);
  } else if (timeSignature != null) {
    const parsed = parseTimeSignature(timeSignature);

    scene.set("time_signature_numerator", parsed.numerator);
    scene.set("time_signature_denominator", parsed.denominator);
    scene.set("time_signature_enabled", true);
  }
}
