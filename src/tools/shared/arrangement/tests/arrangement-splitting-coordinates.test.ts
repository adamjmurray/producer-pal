// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Which timeline split positions are read on: `arrangementSplit` measures them
 * on the song timeline, the deprecated `split` from each clip's own start.
 * Every other splitting test uses a clip at song position 0, where the two
 * coordinate systems coincide and can't tell each other apart.
 */
import { describe, expect, it } from "vitest";
import {
  ARRANGEMENT_SPLIT_MODE,
  LEGACY_SPLIT_MODE,
  performSplitting,
} from "#src/tools/shared/arrangement/arrangement-splitting.ts";
import { setupSplitTest } from "./helpers/arrangement-splitting-test-helpers.ts";

const HOLDING_AREA = { holdingAreaStartBeats: 40000 } as const;

/**
 * A 16-beat clip starting at song beat 16 — song bars 5 through 9, so a
 * position reads 4 bars apart in the two coordinate systems.
 */
const CLIP_AT_BAR_5 = {
  looping: true,
  startTime: 16.0,
  endTime: 32.0,
  loopEnd: 4.0,
} as const;

/** Song beat 24 = bar 7, which is 8 beats into a clip that starts at bar 5. */
const SONG_BEAT_24 = 24;

/** 8 beats: bar 3 read on the song timeline, bar 3 of the clip read from it. */
const BEAT_8 = 8;

/**
 * The right-trim that vacates everything after the first segment. Its position
 * is where the cut landed on the song timeline, and its length is what followed.
 */
function expectCutAtSongBeat(
  trackMock: { call: { mock: { calls: unknown[][] } } },
  position: number,
  remainingLength: number,
): void {
  const trims = trackMock.call.mock.calls.filter(
    ([method]) => method === "create_midi_clip",
  );

  expect(trims).toContainEqual(["create_midi_clip", position, remainingLength]);
}

describe("split position coordinates", () => {
  it("reads arrangementSplit positions on the song timeline", () => {
    const { callState, mockClip, clips } = setupSplitTest(CLIP_AT_BAR_5);

    performSplitting(
      [mockClip],
      [SONG_BEAT_24],
      clips,
      HOLDING_AREA,
      ARRANGEMENT_SPLIT_MODE,
    );

    // 8 beats into the clip, leaving 8 beats after the cut.
    expectCutAtSongBeat(callState.trackMock, SONG_BEAT_24, 8);
  });

  it("reads deprecated split positions from the clip's own start", () => {
    const { callState, mockClip, clips } = setupSplitTest(CLIP_AT_BAR_5);

    // The same physical cut as the test above, from a different number: 8 beats
    // in from the clip's start rather than song beat 24.
    performSplitting(
      [mockClip],
      [BEAT_8],
      clips,
      HOLDING_AREA,
      LEGACY_SPLIT_MODE,
    );

    expectCutAtSongBeat(callState.trackMock, SONG_BEAT_24, 8);
  });

  it("skips a song position that falls outside the clip, naming its span", () => {
    const { callState, mockClip, clips } = setupSplitTest(CLIP_AT_BAR_5);

    // Song beat 8 is bar 3 — before this clip starts. Under the old reading it
    // would have cut 2 bars in, which is the confusion the rename fixes.
    performSplitting(
      [mockClip],
      [BEAT_8],
      clips,
      HOLDING_AREA,
      ARRANGEMENT_SPLIT_MODE,
    );

    expect(callState.trackMock.call).not.toHaveBeenCalledWith(
      "create_midi_clip",
      expect.any(Number),
      expect.any(Number),
    );
    expect(outlet).toHaveBeenCalledWith(
      1,
      expect.stringContaining("arrangementSplit skipped for clip clip_1"),
    );
    expect(outlet).toHaveBeenCalledWith(
      1,
      expect.stringContaining("the clip spans 5|1 to 9|1"),
    );
  });

  it("skips a clip-relative position past the clip's end", () => {
    const { callState, mockClip, clips } = setupSplitTest(CLIP_AT_BAR_5);

    // 24 beats in overruns a 16-beat clip. Same number as the song-timeline
    // test, opposite outcome.
    performSplitting(
      [mockClip],
      [SONG_BEAT_24],
      clips,
      HOLDING_AREA,
      LEGACY_SPLIT_MODE,
    );

    expect(callState.trackMock.call).not.toHaveBeenCalledWith(
      "create_midi_clip",
      expect.any(Number),
      expect.any(Number),
    );
    expect(outlet).toHaveBeenCalledWith(
      1,
      expect.stringContaining("split skipped for clip clip_1"),
    );
    expect(outlet).toHaveBeenCalledWith(
      1,
      expect.stringContaining("before its end at 5|1"),
    );
  });
});
