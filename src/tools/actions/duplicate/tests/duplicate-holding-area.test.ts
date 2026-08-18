// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { requireMockTrack } from "#src/test/helpers/mock-registry-test-helpers.ts";
import {
  createQueuedMethod,
  setupArrangementClip,
  setupLiveSet,
  setupTrack,
} from "#src/tools/shared/arrangement/tests/helpers/arrangement-tiling-test-helpers.ts";
import { createClipsForLength } from "../helpers/duplicate-helpers.ts";

/** The holding area Live hands us: song_length, a few bars past the last event. */
const HOLDING_AREA_START = 64;
/** An 8-bar source clip at the top of the arrangement. */
const SOURCE_LENGTH = 32;
/** Duplicate it 4 bars long, landing right where the holding area starts. */
const TARGET_START = 64;
const TARGET_LENGTH = 16;

const context = {
  holdingAreaStartBeats: HOLDING_AREA_START,
  silenceWavPath: "/tmp/test-silence.wav",
};

/** Where the track's last duplicate-to-holding put the copy. */
let holdingStart = 0;

/**
 * Register the holding copy where the track actually placed it, so the overlap
 * checks downstream see its real span rather than a fixed one.
 * @param end - Where the holding copy currently ends, in beats
 */
function registerHoldingClip(end: number): void {
  setupArrangementClip(
    "300",
    0,
    {
      is_midi_clip: 1,
      is_arrangement_clip: 1,
      start_time: holdingStart,
      end_time: end,
    },
    2,
  );
}

/**
 * A track with an 8-bar source at bar 1 and clip 700 filling the span the
 * shortened copy is about to land on.
 * @returns The source clip and the track
 */
function setupShortenOverHoldingArea(): {
  sourceClip: LiveAPI;
  track: LiveAPI;
} {
  holdingStart = 0;
  setupLiveSet({
    properties: { signature_numerator: 4, signature_denominator: 4 },
  });

  const sourceClip = setupArrangementClip("100", 0, {
    is_midi_clip: 1,
    is_arrangement_clip: 1,
    length: SOURCE_LENGTH,
    start_time: 0,
    end_time: SOURCE_LENGTH,
  });

  setupArrangementClip(
    "700",
    0,
    { start_time: TARGET_START, end_time: TARGET_START + TARGET_LENGTH },
    1,
  );
  setupArrangementClip(
    "400",
    0,
    { is_arrangement_clip: 1, start_time: TARGET_START },
    3,
  );

  setupTrack(0, {
    properties: { arrangement_clips: ["id", "100", "id", "700"] },
    methods: {
      duplicate_clip_to_arrangement: createQueuedMethod([
        (_id: unknown, position: unknown) => {
          holdingStart = position as number;
          registerHoldingClip(holdingStart + SOURCE_LENGTH);

          return ["id", "300"];
        },
        ["id", "400"],
      ]),
      // Shortening drops a temp clip at the new end, truncating the copy there.
      create_midi_clip: (position: unknown) => {
        registerHoldingClip(position as number);

        return ["id", "301"];
      },
    },
  });

  return { sourceClip, track: LiveAPI.from(livePath.track(0)) };
}

/**
 * The position the source was first duplicated to — the holding area.
 * @returns Position in beats
 */
function holdingDuplicatePosition(): number {
  const call = requireMockTrack(0).call.mock.calls.find(
    ([method]: unknown[]) => method === "duplicate_clip_to_arrangement",
  ) as unknown[];

  return call[2] as number;
}

describe("createClipsForLength holding area", () => {
  it("keeps the holding area clear of the shortened clip's target", async () => {
    // The holding copy is what gets moved onto the target. If it sits in the
    // target span, moveClipFromHolding reads that as a self-overlap and skips
    // the clear — leaving the crash the clear exists to prevent.
    const { sourceClip, track } = setupShortenOverHoldingArea();

    await createClipsForLength(
      sourceClip,
      track,
      TARGET_START,
      TARGET_LENGTH,
      4,
      4,
      undefined,
      [],
      context,
    );

    expect(holdingDuplicatePosition()).toBeGreaterThanOrEqual(
      TARGET_START + TARGET_LENGTH,
    );
  });

  it("clears the target before moving the shortened copy onto it", async () => {
    const { sourceClip, track } = setupShortenOverHoldingArea();

    const result = await createClipsForLength(
      sourceClip,
      track,
      TARGET_START,
      TARGET_LENGTH,
      4,
      4,
      undefined,
      [],
      context,
    );

    expect(track.call).toHaveBeenCalledWith("delete_clip", "id 700");
    expect(result).toStrictEqual([
      { id: "400", path: "t0", arrangementStart: "17|1" },
    ]);
  });
});
