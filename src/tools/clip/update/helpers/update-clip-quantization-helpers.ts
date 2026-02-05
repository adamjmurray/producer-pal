// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: AGPL-3.0-or-later

import { noteNameToMidi } from "#src/shared/pitch.ts";
import * as console from "#src/shared/v8-max-console.ts";

/**
 * Quantization grid values mapping user-friendly strings to Live API integers
 */
export const QUANTIZE_GRID: Record<string, number> = {
  "1/4": 1,
  "1/8": 2,
  "1/8T": 3,
  "1/8+1/8T": 4,
  "1/16": 5,
  "1/16T": 6,
  "1/16+1/16T": 7,
  "1/32": 8,
};

interface QuantizationOptions {
  /** Quantization strength 0-1 */
  quantize?: number;
  /** Note grid value */
  quantizeGrid?: string;
  /** Swing amount 0-1 (default: 0) */
  quantizeSwing?: number;
  /** Limit to specific pitch as note name, e.g., C3, D#4 (optional) */
  quantizePitch?: string;
}

/**
 * Handle quantization for MIDI clips
 * @param clip - The clip to quantize
 * @param options - Quantization options
 * @param options.quantize - Quantization strength 0-1
 * @param options.quantizeGrid - Note grid value
 * @param options.quantizeSwing - Swing amount 0-1 (default: 0)
 * @param options.quantizePitch - Limit to specific pitch (optional)
 */
export function handleQuantization(
  clip: LiveAPI,
  { quantize, quantizeGrid, quantizeSwing, quantizePitch }: QuantizationOptions,
): void {
  if (quantize == null) {
    return;
  }

  // Warn and skip for audio clips
  if ((clip.getProperty("is_midi_clip") as number) <= 0) {
    console.warn(`quantize parameter ignored for audio clip (id ${clip.id})`);

    return;
  }

  // Warn and skip if grid not provided
  if (quantizeGrid == null) {
    console.warn("quantize parameter ignored - quantizeGrid is required");

    return;
  }

  const gridValue = QUANTIZE_GRID[quantizeGrid];
  const swingToUse = quantizeSwing ?? 0;

  // Set swing, quantize, restore swing
  const liveSet = LiveAPI.from("live_set");
  const originalSwing = liveSet.getProperty("swing_amount");

  liveSet.set("swing_amount", swingToUse);

  try {
    if (quantizePitch != null) {
      const midiPitch = noteNameToMidi(quantizePitch);

      if (midiPitch == null) {
        console.warn(
          `invalid note name "${quantizePitch}" for quantizePitch, ignoring`,
        );

        return;
      }

      clip.call("quantize_pitch", midiPitch, gridValue, quantize);
    } else {
      clip.call("quantize", gridValue, quantize);
    }
  } finally {
    liveSet.set("swing_amount", originalSwing);
  }
}
