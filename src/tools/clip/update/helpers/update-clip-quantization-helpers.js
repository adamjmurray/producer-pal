/**
 * Quantization grid values mapping user-friendly strings to Live API integers
 */
export const QUANTIZE_GRID = {
  "1/4": 1,
  "1/8": 2,
  "1/8T": 3,
  "1/8+1/8T": 4,
  "1/16": 5,
  "1/16T": 6,
  "1/16+1/16T": 7,
  "1/32": 8,
};

/**
 * Handle quantization for MIDI clips
 * @param {LiveAPI} clip - The clip to quantize
 * @param {object} options - Quantization options
 * @param {number} options.quantize - Quantization strength 0-1
 * @param {string} options.quantizeGrid - Note grid value
 * @param {number} options.quantizeSwing - Swing amount 0-1 (default: 0)
 * @param {number} options.quantizePitch - Limit to specific pitch (optional)
 */
export function handleQuantization(
  clip,
  { quantize, quantizeGrid, quantizeSwing, quantizePitch },
) {
  if (quantize == null) {
    return;
  }

  // Validate MIDI clip
  if (clip.getProperty("is_midi_clip") <= 0) {
    throw new Error("Quantization only available on MIDI clips");
  }

  // Validate required grid
  if (quantizeGrid == null) {
    throw new Error("quantizeGrid required when quantize is provided");
  }

  const gridValue = QUANTIZE_GRID[quantizeGrid];
  const swingToUse = quantizeSwing ?? 0;

  // Set swing, quantize, restore swing
  const liveSet = LiveAPI.from("live_set");
  const originalSwing = liveSet.getProperty("swing_amount");

  liveSet.set("swing_amount", swingToUse);

  try {
    if (quantizePitch != null) {
      clip.call("quantize_pitch", quantizePitch, gridValue, quantize);
    } else {
      clip.call("quantize", gridValue, quantize);
    }
  } finally {
    liveSet.set("swing_amount", originalSwing);
  }
}
