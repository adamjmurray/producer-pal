// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// A move to a take lane re-creates the clip. One that can't be re-created (a
// step sequencer clip, an audio clip with no sample) is refused, so it must not
// count as overwriting what an earlier move in the same call lands on.

import { describe, expect, it } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { setMidiClipType } from "#src/test/helpers/mock-registry-test-helpers.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import {
  mockNonExistentObjects,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { registerTakeLaneTrack } from "#src/tools/shared/arrangement/tests/helpers/take-lane-test-helpers.ts";
import { updateClip } from "#src/tools/clip/update/update-clip.ts";

const DEST_TRACK = 5;

/**
 * Register two arrangement clips on track 0 and a destination track with a take lane.
 * @param kind - What the second clip is
 * @param isMidi - Whether the clips and the destination are MIDI
 */
function register(kind: "step-sequencer" | "no-sample", isMidi: boolean): void {
  mockNonExistentObjects();
  registerMockObject("live-set", {
    path: livePath.liveSet,
    type: "Song",
    properties: { signature_numerator: 4, signature_denominator: 4 },
  });

  for (const [index, id] of ["A", "B"].entries()) {
    const clip = registerMockObject(id, {
      path: livePath.track(0).arrangementClip(index),
      type: "Clip",
      properties: {
        is_arrangement_clip: 1,
        is_midi_clip: isMidi ? 1 : 0,
        is_audio_clip: isMidi ? 0 : 1,
        file_path: id === "B" && kind === "no-sample" ? "" : "kick.wav",
        warping: 0,
        start_time: index * 8,
        end_time: index * 8 + 4,
        length: 4,
        start_marker: 0,
        loop_start: 0,
        loop_end: 4,
        end_marker: 4,
        looping: 1,
        signature_numerator: 4,
        signature_denominator: 4,
      },
      methods: { get_notes_extended: () => JSON.stringify({ notes: [] }) },
    });

    if (isMidi) {
      setMidiClipType(clip, id === "B" ? "step-sequencer" : "notes");
    }
  }

  registerMockObject("source-track", {
    path: livePath.track(0),
    type: "Track",
    properties: {
      has_midi_input: isMidi ? 1 : 0,
      arrangement_clips: children("A", "B"),
    },
    methods: { delete_clip: () => null },
  });
  registerTakeLaneTrack({
    trackIndex: DEST_TRACK,
    initialLanes: 1,
    hasMidiInput: isMidi ? 1 : 0,
  });
}

describe("updateClip - a move that can't be re-created covers nothing", () => {
  it.each([
    ["a step sequencer clip", "step-sequencer", true, "step sequencer clip"],
    ["an audio clip with no sample", "no-sample", false, "no sample file"],
  ] as const)(
    "%s doesn't overwrite the earlier clip moved to the same span",
    async (_name, kind, isMidi, why) => {
      register(kind, isMidi);

      const result = (await updateClip({
        id: "A,B",
        toPath: `t${DEST_TRACK}/l0[5|1],t${DEST_TRACK}/l0[5|1]`,
      })) as Array<{ id: string; ok?: boolean; detail?: string }>;

      expect(result[0]?.detail).toContain("re-created on");
      expect(result[0]?.detail).not.toContain("overwritten");
      expect(result[1]?.ok).toBe(false);
      expect(result[1]?.detail).toContain(why);
    },
  );
});
