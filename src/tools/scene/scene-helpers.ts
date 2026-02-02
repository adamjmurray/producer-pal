import { parseTimeSignature } from "#src/tools/shared/utils.ts";

/**
 * Applies tempo property to a scene
 * @param scene - The LiveAPI scene object
 * @param tempo - Tempo in BPM. -1 disables, other values enable
 */
export function applyTempoProperty(
  scene: LiveAPI,
  tempo?: number | null,
): void {
  if (tempo === -1) {
    scene.set("tempo_enabled", false);
  } else if (tempo != null) {
    scene.set("tempo", tempo);
    scene.set("tempo_enabled", true);
  }
}

/**
 * Applies time signature property to a scene
 * @param scene - The LiveAPI scene object
 * @param timeSignature - Time signature. "disabled" disables, other values enable
 */
export function applyTimeSignatureProperty(
  scene: LiveAPI,
  timeSignature?: string | null,
): void {
  if (timeSignature === "disabled") {
    scene.set("time_signature_enabled", false);
  } else if (timeSignature != null) {
    const parsed = parseTimeSignature(timeSignature);

    scene.set("time_signature_numerator", parsed.numerator);
    scene.set("time_signature_denominator", parsed.denominator);
    scene.set("time_signature_enabled", true);
  }
}
