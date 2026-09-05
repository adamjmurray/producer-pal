// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { requireMockTrack } from "#src/test/helpers/mock-registry-test-helpers.ts";
import {
  lookupMockObject,
  type RegisteredMockObject,
} from "#src/test/mocks/mock-registry.ts";
import {
  createQueuedMethod,
  setupArrangementClip,
  setupLiveSet,
  setupTrack,
} from "#src/tools/shared/arrangement/tests/helpers/arrangement-tiling-test-helpers.ts";
import { createClipsForLength } from "../helpers/duplicate-helpers.ts";

/** An 8-bar source clip at the top of the arrangement. */
const SOURCE_LENGTH = 32;
/** Duplicate it 4 bars long, landing right where the holding area starts. */
const TARGET_START = 64;
const TARGET_LENGTH = 16;

const context = {
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
      context,
    );

    expect(track.call).toHaveBeenCalledWith("delete_clip", "id 700");
    expect(result).toStrictEqual([
      // TARGET_START 64 in 4/4 is bar 17 beat 1
      { id: "400", path: "t0[17|1]" },
    ]);
  });
});

/**
 * A track that keeps its arrangement clips up to date as the call places them,
 * so each duplicate's holding area is computed against what really sits there.
 * @returns The track
 */
function setupTrackTrackingItsClips(): LiveAPI {
  let clipIds = ["100"];
  let dupCount = 0;

  /**
   * Report the clips the track holds right now.
   */
  function publish(): void {
    requireMockTrack(0).properties.arrangement_clips = clipIds.flatMap((id) => [
      "id",
      id,
    ]);
  }

  /**
   * A registered clip's span.
   * @param id - Clip id
   * @returns Its start and end in beats
   */
  function spanOf(id: string): { start: number; end: number } {
    const props = lookupMockObject(id)?.properties as Record<string, number>;

    return { start: props.start_time ?? 0, end: props.end_time ?? 0 };
  }

  setupTrack(0, {
    properties: { arrangement_clips: ["id", "100"] },
    methods: {
      duplicate_clip_to_arrangement: (source: unknown, position: unknown) => {
        dupCount += 1;
        const id = `dup_${String(dupCount)}`;
        const start = position as number;
        const from = spanOf(String(source).replace(/^id /, ""));

        setupArrangementClip(
          id,
          0,
          {
            is_midi_clip: 1,
            is_arrangement_clip: 1,
            start_time: start,
            end_time: start + (from.end - from.start),
          },
          clipIds.length,
        );
        clipIds.push(id);
        publish();

        return ["id", id];
      },
      // The shortening trim: whatever clip spans this position now ends here.
      create_midi_clip: (position: unknown) => {
        const at = position as number;

        for (const id of clipIds) {
          const { start, end } = spanOf(id);

          if (start < at && end > at) {
            (lookupMockObject(id) as RegisteredMockObject).properties.end_time =
              at;
          }
        }

        return ["id", "temp"];
      },
      delete_clip: (id: unknown) => {
        clipIds = clipIds.filter(
          (clipId) => clipId !== String(id).replace(/^id /, ""),
        );
        publish();

        return null;
      },
    },
  });

  return LiveAPI.from(livePath.track(0));
}

describe("createClipsForLength across a multi-position duplicate", () => {
  it("stages each copy past the one the same call already placed", async () => {
    // Regression: the holding area was song_length captured at request start,
    // so a copy placed at the end of the arrangement sat exactly where a later
    // copy — one placed further left, which never pushes the holding area —
    // staged. That copy then duplicated an arrangement clip onto an occupied
    // span (the Ableton crash) and destroyed the first copy, which the call had
    // already reported as created.
    setupLiveSet({
      properties: { signature_numerator: 4, signature_denominator: 4 },
    });
    setupArrangementClip("100", 0, {
      is_midi_clip: 1,
      is_arrangement_clip: 1,
      length: SOURCE_LENGTH,
      start_time: 0,
      end_time: SOURCE_LENGTH,
    });

    const track = setupTrackTrackingItsClips();
    const sourceClip = LiveAPI.from("id 100");

    // Copy A lands at the end of the arrangement; copy B lands to its left.
    for (const start of [232, 40]) {
      await createClipsForLength(
        sourceClip,
        track,
        start,
        TARGET_LENGTH,
        4,
        4,
        undefined,
        context,
      );
    }

    const holdingTargets = requireMockTrack(0)
      .call.mock.calls.filter(
        ([method, source]: unknown[]) =>
          method === "duplicate_clip_to_arrangement" && source === "id 100",
      )
      .map(([, , position]: unknown[]) => position as number);

    // Copy A occupies [232, 248), so copy B has to stage past it.
    expect(holdingTargets).toHaveLength(2);
    expect(holdingTargets[1]).toBeGreaterThanOrEqual(248);
  });
});
