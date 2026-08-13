// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import * as console from "#src/shared/max/v8-max-console.ts";
import { parseTimeSignature } from "#src/tools/shared/utils.ts";

/**
 * Applies tempo property to a scene
 * @param scene - The LiveAPI scene object
 * @param tempo - Tempo in BPM (20.0-999.0). -1 disables; other valid values enable
 */
export function applyTempoProperty(
  scene: LiveAPI,
  tempo?: number | null,
): void {
  if (tempo === -1) {
    scene.set("tempo_enabled", false);
  } else if (tempo != null) {
    // Mirror the live-set tempo guard: an out-of-range value (e.g. 0) would
    // otherwise be written and enabled as an invalid scene tempo. Warn and skip.
    if (tempo < 20 || tempo > 999) {
      console.warn(
        "scene tempo must be between 20.0 and 999.0 BPM (or -1 to disable)",
      );

      return;
    }

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
