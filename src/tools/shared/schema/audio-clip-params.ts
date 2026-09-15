// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { z, type ZodType } from "zod";

/**
 * The audio-clip sample settings create-clip and update-clip both take, worded
 * identically. `warping` is not here: creating a clip decides whether Live may
 * time-stretch the file, updating one resets the region, so each tool says its
 * own thing.
 * @returns Param schemas to spread into a tool's inputSchema
 */
export function audioClipParams(): Record<string, ZodType> {
  return {
    gainDb: z.coerce
      .number()
      .min(-70)
      .max(24)
      .optional()
      .describe("audio clip gain in decibels, 0 = unity (ignored for MIDI)"),
    pitchShift: z.coerce
      .number()
      .min(-48)
      .max(48)
      .optional()
      .describe(
        "audio clip pitch shift in semitones, supports decimals (ignored for MIDI)",
      ),
    warpMode: z
      .enum(["beats", "tones", "texture", "repitch", "complex", "pro"])
      .optional()
      .describe("audio clip warp mode (ignored for MIDI)"),
  };
}
