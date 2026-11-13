// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import {
  setupArrangementClipPath,
  setupMockProperties,
} from "#src/tools/clip/update/helpers/update-clip-test-helpers.ts";
import { updateClip } from "#src/tools/clip/update/update-clip.ts";

describe("updateClip - arrangementLength (expose hidden content)", () => {
  it("lengthens the clip itself to reveal hidden content", async () => {
    const trackIndex = 0;
    const handles = setupArrangementClipPath(trackIndex, [
      "789",
      "1000",
      "2000",
      "3000",
    ]);
    const sourceClip = handles.get("789");

    expect(sourceClip).toBeDefined();

    if (sourceClip == null) {
      throw new Error("Expected source clip mock for 789");
    }

    setupMockProperties(sourceClip, {
      is_arrangement_clip: 1,
      is_midi_clip: 1,
      is_audio_clip: 0,
      start_time: 1,
      end_time: 5,
      loop_start: 0,
      loop_end: 4,
      looping: 0,
      length: 6.5,
      name: "Test Clip",
      color_index: 5,
      muted: 0,
      playing_status: 1,
    });

    const result = await updateClip({
      id: "789",
      arrangementLength: "1bar+n5/8", // 6.5 beats - extend to reveal 2.5 beats of hidden content
    });

    // The one clip grows in place, keeping its id and envelopes.
    expect(result).toStrictEqual(expect.objectContaining({ id: "789" }));
  });
});
