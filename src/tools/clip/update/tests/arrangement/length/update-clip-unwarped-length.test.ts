// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { beforeEach, describe, expect, it } from "vitest";
import { setupResizableClip } from "#src/tools/clip/update/helpers/arrangement/resizable-clip-test-helpers.ts";
import { setupUpdateClipMocks } from "#src/tools/clip/update/helpers/update-clip-test-helpers.ts";
import { updateClip } from "#src/tools/clip/update/update-clip.ts";

/**
 * A 2-bar unlooped, unwarped audio clip at 120 BPM: 8 beats, 4 seconds of a
 * 10-second file. Its markers count in seconds, so a resize that treated them
 * as beats would land at the wrong span.
 */
const UNWARPED_TWO_BARS = {
  is_midi_clip: 0,
  is_audio_clip: 1,
  warping: 0,
  looping: 0,
  end_time: 8,
  loop_start: 0,
  loop_end: 4,
  start_marker: 0,
  end_marker: 4,
  sample_length: 441000,
  sample_rate: 44100,
} as const;

const context = { silenceWavPath: "/path/to/silence.wav" };

describe("updateClip - arrangementLength (unwarped audio)", () => {
  beforeEach(() => {
    setupUpdateClipMocks();
  });

  it("shortens the clip, moving its markers in seconds", async () => {
    const { sourceClip } = setupResizableClip(UNWARPED_TWO_BARS);

    const result = await updateClip(
      { id: "789", arrangementLength: "1bar" },
      context,
    );

    expect(result).toStrictEqual({ id: "789", path: "t0[1|1]" });
    expect(sourceClip.properties).toStrictEqual(
      expect.objectContaining({ end_time: 4, loop_end: 2, end_marker: 2 }),
    );
  });

  it("lengthens the clip, moving its loop end in seconds", async () => {
    const { sourceClip } = setupResizableClip(UNWARPED_TWO_BARS);

    const result = await updateClip(
      { id: "789", arrangementLength: "4bar" },
      context,
    );

    expect(result).toStrictEqual({ id: "789", path: "t0[1|1]" });
    expect(sourceClip.properties).toStrictEqual(
      expect.objectContaining({ end_time: 16, loop_end: 8 }),
    );
  });
});
