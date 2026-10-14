// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { LIVE_API_WARP_MODE_TEXTURE } from "#src/tools/constants.ts";
import { dbToLiveGain } from "#src/tools/shared/helpers/gain-conversion.ts";
import { createClip } from "../../create-clip.ts";
import { setupSessionAudioClipMocks } from "../create-clip-test-helpers.ts";

/** What Live holds after taking every audio write as asked. */
const KEPT = {
  gain: dbToLiveGain(-6),
  pitch_coarse: 5,
  pitch_fine: 25,
  warp_mode: LIVE_API_WARP_MODE_TEXTURE,
};

const ASKED = {
  slot: "0/0",
  sampleFile: "/path/to/kick.wav",
  gainDb: -6,
  pitchShift: 5.25,
  warpMode: "texture" as const,
};

describe("createClip - audio properties Live didn't keep", () => {
  it("says nothing when Live kept every value", async () => {
    const { clip } = setupSessionAudioClipMocks();

    Object.assign(clip.properties, KEPT);

    const result = (await createClip(ASKED)) as Record<string, unknown>;

    expect(result).not.toHaveProperty("gainDb");
    expect(result).not.toHaveProperty("pitchShift");
    expect(result).not.toHaveProperty("warpMode");
    expect(result.detail).toBeUndefined();
  });

  it("reports the values Live kept in place of the ones asked for", async () => {
    const { clip } = setupSessionAudioClipMocks();

    Object.assign(clip.properties, KEPT, {
      gain: dbToLiveGain(0),
      pitch_coarse: 0,
      pitch_fine: 0,
      warp_mode: 0,
    });

    const result = (await createClip(ASKED)) as Record<string, unknown>;

    expect(result).toStrictEqual(
      expect.objectContaining({
        gainDb: expect.any(Number),
        pitchShift: 0,
        warpMode: "beats",
        detail: "gainDb, pitchShift, warpMode read back as shown, not as sent",
      }),
    );
  });
});
