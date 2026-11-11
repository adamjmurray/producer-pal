// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  expectNoNotesApiCalls,
  requireMockObject,
  setMidiClipType,
} from "#src/test/helpers/mock-registry-test-helpers.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import { mockTrackProperties } from "#src/tools/track/read/tests/helpers/read-track-test-helpers.ts";
import { setupTrackPathMappedMocks } from "#src/tools/track/read/tests/helpers/read-track-path-mapped-test-helpers.ts";
import { readOneTrack } from "#src/tools/track/read/read-track.ts";

const STEP_PATH = livePath.track(0).clipSlot(0).clip();
const NOTES_PATH = livePath.track(0).clipSlot(1).clip();

function setupDrumTrack(): void {
  setupTrackPathMappedMocks({
    pathIdMap: {
      [String(livePath.track(0))]: "track1",
      [STEP_PATH]: "step_clip",
      [NOTES_PATH]: "notes_clip",
    },
    objects: {
      Track: mockTrackProperties({
        name: "Drums",
        has_midi_input: 1,
        devices: [],
        clip_slots: children("slot1", "slot2"),
        arrangement_clips: [],
      }),
      step_clip: { is_midi_clip: 1, name: "Step Sequencer", length: 4 },
      notes_clip: { is_midi_clip: 1, name: "Notes", length: 4 },
    },
  });
}

describe("read-track - Live 13 step sequencer clips", () => {
  it("lists a step sequencer clip beside a notes clip, only the step sequencer one says so", () => {
    setupDrumTrack();
    const stepClip = requireMockObject(STEP_PATH);

    setMidiClipType(stepClip, "step-sequencer");
    setMidiClipType(requireMockObject(NOTES_PATH), "notes");

    const result = readOneTrack({
      trackIndex: 0,
      include: ["session-clips", "notes"],
    });
    const [step, notes] = result.sessionClips as Record<string, unknown>[];

    expect(step).toStrictEqual(
      expect.objectContaining({
        type: "step-sequencer",
        name: "Step Sequencer",
        detail: "steps can't be read",
      }),
    );
    expect(step).not.toHaveProperty("notes");
    // A notes clip's type matches the track's, so it stays out of the listing.
    expect(notes).toStrictEqual({
      id: "notes_clip",
      name: "Notes",
      path: "t0/s1",
    });
    expectNoNotesApiCalls(stepClip);
  });

  it("lists no clip as a step sequencer on Live 12, and drops the redundant type", () => {
    setupDrumTrack();
    setMidiClipType(requireMockObject(STEP_PATH), "live-12");
    setMidiClipType(requireMockObject(NOTES_PATH), "live-12");

    const result = readOneTrack({
      trackIndex: 0,
      include: ["session-clips"],
    });

    for (const clip of result.sessionClips as Array<Record<string, unknown>>) {
      expect(clip).not.toHaveProperty("type");
      expect(clip).not.toHaveProperty("detail");
    }
  });
});
