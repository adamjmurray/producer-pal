// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import { livePath, type PathLike } from "#src/shared/live-api-path-builders.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import {
  lookupMockObject,
  mockNonExistentObjects,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { type ArrangementTrack } from "#src/tools/shared/arrangement/helpers/take-lane-helpers.ts";
import { registerTakeLaneTrack } from "#src/tools/shared/arrangement/tests/helpers/take-lane-test-helpers.ts";
import { handleArrangementStartOperation } from "../../helpers/update-clip-arrangement-helpers.ts";

const SOURCE_TRACK = 0;
const DEST_TRACK = 5;
const SOURCE_ID = "123";
const DUPLICATED_ID = "456";

const mockContext = { silenceWavPath: "/tmp/test-silence.wav" } as const;

interface MoveOptions {
  /** Path of the source clip; a take-lane path makes it an unmovable source */
  sourcePath?: PathLike;
  isMidi?: number;
  filePath?: string;
  hasEnvelopes?: number;
  /** Take lanes the destination track already has */
  initialLanes?: number;
  /** 0 makes the destination an audio track */
  destHasMidiInput?: number;
  arrangementStartBeats?: number | null;
  destination?: ArrangementTrack | null;
}

/**
 * Register a source clip and a destination track, then run the move.
 * @param opts - What this test varies
 * @returns The clip id the operation resolved to
 */
function runMove(opts: MoveOptions = {}): string | null {
  const {
    sourcePath = livePath.track(SOURCE_TRACK).arrangementClip(0),
    isMidi = 1,
    filePath = "",
    hasEnvelopes = 0,
    initialLanes = 0,
    destHasMidiInput = 1,
    arrangementStartBeats = 32,
    destination = { trackIndex: DEST_TRACK, takeLane: null },
  } = opts;

  mockNonExistentObjects();

  registerMockObject(SOURCE_ID, {
    path: sourcePath,
    type: "Clip",
    properties: {
      is_arrangement_clip: 1,
      is_midi_clip: isMidi,
      file_path: filePath,
      has_envelopes: hasEnvelopes,
      start_time: 8,
      end_time: 16,
      length: 8,
      start_marker: 0,
      loop_start: 0,
      loop_end: 8,
      end_marker: 8,
      looping: 1,
      signature_numerator: 4,
      signature_denominator: 4,
      name: "Verse",
      color: 16711680,
    },
    methods: { get_notes_extended: () => JSON.stringify({ notes: [] }) },
  });

  registerMockObject(`track_${SOURCE_TRACK}`, {
    path: livePath.track(SOURCE_TRACK),
    type: "Track",
    properties: { arrangement_clips: children(SOURCE_ID) },
  });

  registerTakeLaneTrack({
    trackIndex: DEST_TRACK,
    initialLanes,
    hasMidiInput: destHasMidiInput,
  });

  // registerTakeLaneTrack answers the lane creates; the main lane's move goes
  // through Live's own arrangement duplicate instead.
  lookupMockObject(
    undefined,
    livePath.track(DEST_TRACK),
  )!.methods.duplicate_clip_to_arrangement = () => {
    registerMockObject(DUPLICATED_ID, {
      path: livePath.track(DEST_TRACK).arrangementClip(0),
      type: "Clip",
    });

    return ["id", DUPLICATED_ID];
  };

  return handleArrangementStartOperation({
    clip: LiveAPI.from(`id ${SOURCE_ID}`),
    arrangementStartBeats,
    destination,
    tracksWithMovedClips: new Map(),
    isMidiClip: isMidi === 1,
    context: mockContext,
  });
}

describe("moving an arrangement clip to another lane", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("duplicates onto the destination track and deletes the original", () => {
    const result = runMove();

    expect(
      lookupMockObject(undefined, livePath.track(DEST_TRACK))?.call,
    ).toHaveBeenCalledWith(
      "duplicate_clip_to_arrangement",
      `id ${SOURCE_ID}`,
      32,
    );
    // The delete goes to the SOURCE track, not the one the copy landed on.
    expect(
      lookupMockObject(`track_${SOURCE_TRACK}`)?.call,
    ).toHaveBeenCalledWith("delete_clip", `id ${SOURCE_ID}`);
    expect(result).toBe(DUPLICATED_ID);
  });

  // Omitting arrangementStart means "same place, other lane".
  it("keeps the clip's own start time when no position is given", () => {
    runMove({ arrangementStartBeats: null });

    expect(
      lookupMockObject(undefined, livePath.track(DEST_TRACK))?.call,
    ).toHaveBeenCalledWith(
      "duplicate_clip_to_arrangement",
      `id ${SOURCE_ID}`,
      8,
    );
  });

  it("re-creates the clip on a take lane", () => {
    const result = runMove({
      destination: { trackIndex: DEST_TRACK, takeLane: 0 },
      initialLanes: 1,
    });

    expect(
      lookupMockObject(undefined, livePath.track(DEST_TRACK).takeLane(0))?.call,
    ).toHaveBeenCalledWith("create_midi_clip", 32, 8);
    expect(outlet).toHaveBeenCalledWith(
      1,
      `clip ${SOURCE_ID} was re-created on t${DEST_TRACK}/l0`,
    );
    expect(
      lookupMockObject(`track_${SOURCE_TRACK}`)?.call,
    ).toHaveBeenCalledWith("delete_clip", `id ${SOURCE_ID}`);
    expect(result).not.toBe(SOURCE_ID);
  });

  it("appends a lane for l+ and says what the re-created clip loses", () => {
    runMove({
      destination: { trackIndex: DEST_TRACK, takeLane: "new" },
      hasEnvelopes: 1,
    });

    expect(
      lookupMockObject(undefined, livePath.track(DEST_TRACK))?.call,
    ).toHaveBeenCalledWith("create_take_lane");
    expect(outlet).toHaveBeenCalledWith(
      1,
      `clip ${SOURCE_ID} was re-created on t${DEST_TRACK}/l0 (automation envelopes aren't copied)`,
    );
  });

  // Every refusal keeps the clip where it is, so the rest of the update still
  // lands and nothing is deleted without a copy in place.
  it.each([
    [
      "a MIDI clip aimed at an audio track",
      { destHasMidiInput: 0 },
      `track ${DEST_TRACK} is audio`,
    ],
    [
      "an audio clip with no sample, aimed at a take lane",
      {
        isMidi: 0,
        destHasMidiInput: 0,
        destination: {
          trackIndex: DEST_TRACK,
          takeLane: 0,
        } as ArrangementTrack,
        initialLanes: 1,
      },
      "it's an audio clip with no sample file",
    ],
    [
      "a take lane past the per-track limit",
      {
        destination: {
          trackIndex: DEST_TRACK,
          takeLane: 8,
        } as ArrangementTrack,
      },
      'take lane "l8" is out of range',
    ],
  ])("refuses %s", (_label, opts: MoveOptions, expected) => {
    const result = runMove(opts);

    expect(outlet).toHaveBeenCalledWith(
      1,
      expect.stringContaining(`clip ${SOURCE_ID} was not moved: ${expected}`),
    );
    expect(
      lookupMockObject(`track_${SOURCE_TRACK}`)?.call,
    ).not.toHaveBeenCalledWith("delete_clip", `id ${SOURCE_ID}`);
    expect(result).toBe(SOURCE_ID);
  });

  // The take-lane guard names whichever param asked for the move.
  it("names toPath when a take-lane clip is sent somewhere else", () => {
    const result = runMove({
      sourcePath: livePath.track(SOURCE_TRACK).takeLane(0).arrangementClip(0),
    });

    expect(outlet).toHaveBeenCalledWith(
      1,
      expect.stringContaining(
        `toPath ignored for take-lane clip (id ${SOURCE_ID})`,
      ),
    );
    expect(result).toBe(SOURCE_ID);
  });
});
